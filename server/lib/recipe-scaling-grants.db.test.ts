import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runWithRequestContext } from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  bindRecipeScalingGrant,
  consumeRecipeScalingGrant,
  createRecipeScalingGrant,
} from "./recipe-scaling-grants.js";

const TEST_DB_PATH = join(
  tmpdir(),
  `recipe-scaling-grants-${process.pid}-${Date.now()}.pglite`,
);
const OWNER = "grant-owner@example.com";
const DOCUMENT_ID = "grant-recipe";
const THREAD_ID = "grant-thread";
const TURN_ID = "grant-turn";
const MESSAGE_ID = "grant-message";
const FACTOR = 1.5;

let getDb: typeof import("../db/index.js").getDb;
let schema: typeof import("../db/schema.js");

const asOwner = <T>(run: () => Promise<T>) =>
  runWithRequestContext({ userEmail: OWNER }, run);

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const dbModule = await import("../db/index.js");
  getDb = dbModule.getDb;
  schema = dbModule.schema;
  const plugin = (await import("../plugins/db.js")).default;
  await plugin(undefined as never);
}, 60_000);

beforeEach(async () => getDb().delete(schema.recipeScalingGrants));
afterAll(() => rmSync(TEST_DB_PATH, { force: true, recursive: true }));

describe("recipe scaling grant persistence", () => {
  it("stores only a hash and binds once to the same thread/turn/message", async () => {
    const now = new Date();
    const grant = await createRecipeScalingGrant(
      { ownerEmail: OWNER, documentId: DOCUMENT_ID, factor: FACTOR },
      now,
    );
    const [row] = await getDb().select().from(schema.recipeScalingGrants);
    expect(row.tokenHash).not.toBe(grant.token);
    expect(row.expiresAt).toBe(
      new Date(now.getTime() + 5 * 60_000).toISOString(),
    );
    const binding = {
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: FACTOR,
      threadId: THREAD_ID,
      turnId: TURN_ID,
      messageId: MESSAGE_ID,
    };
    await expect(
      asOwner(() => bindRecipeScalingGrant(grant.token, binding, now)),
    ).resolves.toMatchObject({
      boundThreadId: THREAD_ID,
      boundTurnId: TURN_ID,
      boundMessageId: MESSAGE_ID,
    });
    await expect(
      asOwner(() => bindRecipeScalingGrant(grant.token, binding, now)),
    ).resolves.toMatchObject({
      boundThreadId: THREAD_ID,
    });
    await expect(
      asOwner(() =>
        bindRecipeScalingGrant(
          grant.token,
          { ...binding, threadId: "other-thread" },
          now,
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      asOwner(() =>
        bindRecipeScalingGrant(
          grant.token,
          { ...binding, turnId: "other-turn" },
          now,
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      asOwner(() =>
        bindRecipeScalingGrant(
          grant.token,
          { ...binding, messageId: "other-message" },
          now,
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
  });

  it("rejects wrong caller, expired and unknown grants", async () => {
    const now = new Date();
    const grant = await createRecipeScalingGrant(
      { ownerEmail: OWNER, documentId: DOCUMENT_ID, factor: FACTOR },
      now,
    );
    const binding = {
      ownerEmail: OWNER,
      threadId: THREAD_ID,
      turnId: undefined,
      messageId: undefined,
    };
    await expect(
      runWithRequestContext({ userEmail: "other@example.com" }, () =>
        bindRecipeScalingGrant(
          grant.token,
          { ...binding, ownerEmail: "other@example.com" },
          now,
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      asOwner(() =>
        bindRecipeScalingGrant(
          grant.token,
          binding,
          new Date(now.getTime() + 5 * 60_000),
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      asOwner(() =>
        bindRecipeScalingGrant("unknown-token".padEnd(48, "x"), binding, now),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
  });

  it("consumes once only after matching exact owner/document/factor/thread/turn", async () => {
    const now = new Date();
    const grant = await createRecipeScalingGrant(
      { ownerEmail: OWNER, documentId: DOCUMENT_ID, factor: FACTOR },
      now,
    );
    const binding = {
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: FACTOR,
      threadId: THREAD_ID,
      turnId: TURN_ID,
    };
    await asOwner(() => bindRecipeScalingGrant(grant.token, binding, now));
    await expect(
      asOwner(() =>
        consumeRecipeScalingGrant(grant.token, { ...binding, factor: 2 }, now),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      asOwner(() =>
        consumeRecipeScalingGrant(
          grant.token,
          { ...binding, threadId: "other-thread" },
          now,
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      asOwner(() => consumeRecipeScalingGrant(grant.token, binding, now)),
    ).resolves.toBeUndefined();
    await expect(
      asOwner(() => consumeRecipeScalingGrant(grant.token, binding, now)),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    const [row] = await getDb()
      .select()
      .from(schema.recipeScalingGrants)
      .where(eq(schema.recipeScalingGrants.documentId, DOCUMENT_ID));
    expect(row.consumedAt).toBe(now.toISOString());
  });
});
