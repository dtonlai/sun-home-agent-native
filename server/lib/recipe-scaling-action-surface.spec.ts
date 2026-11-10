import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runWithRequestContext } from "@agent-native/core/server";
import { createThread } from "@agent-native/core/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_PATH = join(
  tmpdir(),
  `sun-home-recipe-scaling-${process.pid}-${Date.now()}.pglite`,
);
const OWNER = "recipe-owner@example.com";
const OUTSIDER = "recipe-outsider@example.com";
const DOCUMENT_ID = "recipe-scaling-page";
const THREAD_ID = "recipe-scaling-thread";
const OUTSIDER_THREAD_ID = "recipe-scaling-outsider-thread";
const FACTOR = 1.5;

let getDb: typeof import("../db/index.js").getDb;
let schema: typeof import("../db/schema.js");
let resolveSurface: typeof import("./recipe-scaling-action-surface.js").resolveRecipeScalingActionSurface;

const asUser = <T>(userEmail: string, run: () => Promise<T>) =>
  runWithRequestContext({ userEmail }, run);

function scalingDetails(overrides: Record<string, unknown> = {}) {
  return {
    ownerEmail: OWNER,
    orgId: null,
    threadId: THREAD_ID,
    mode: "act" as const,
    actionScope: {
      kind: "sun-home-recipe-scaling",
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: FACTOR,
    },
    availableActionNames: [
      "get-document",
      "submit-recipe-scaling-result",
      "update-document",
    ],
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const dbModule = await import("../db/index.js");
  getDb = dbModule.getDb;
  schema = dbModule.schema;
  const dbPlugin = (await import("../plugins/db.js")).default;
  await dbPlugin(undefined as never);
  await createThread(OWNER, { id: THREAD_ID });
  await createThread(OUTSIDER, { id: OUTSIDER_THREAD_ID });
  const { resolveRecipeScalingActionSurface } =
    await import("./recipe-scaling-action-surface.js");
  resolveSurface = resolveRecipeScalingActionSurface;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.documents);
  await getDb().insert(schema.documents).values({
    id: DOCUMENT_ID,
    ownerEmail: OWNER,
    title: "Recipe scaling fixture",
    content: "Ingredients\n- 1 cup flour",
    bodyRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

afterAll(() => {
  rmSync(TEST_DB_PATH, { force: true, recursive: true });
});

describe("recipe scaling action surface", () => {
  it("binds the authenticated caller, accessible source, factor, and exact read/result allowlist", async () => {
    const surface = await asUser(OWNER, () => resolveSurface(scalingDetails()));
    expect(surface).toEqual({
      allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
      actionScope: {
        kind: "sun-home-recipe-scaling",
        ownerEmail: OWNER,
        documentId: DOCUMENT_ID,
        factor: FACTOR,
      },
    });
  });

  it("rejects forged caller identity, malformed scope, and plan mode", async () => {
    await expect(
      asUser(OUTSIDER, () => resolveSurface(scalingDetails())),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_unavailable" });
    await expect(
      asUser(OWNER, () =>
        resolveSurface(
          scalingDetails({
            actionScope: { kind: "sun-home-recipe-scaling", factor: FACTOR },
          }),
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_binding_invalid" });
    await expect(
      asUser(OWNER, () => resolveSurface(scalingDetails({ mode: "plan" }))),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_turn_invalid" });
  });

  it("rejects missing or inaccessible documents and threads not owned by the caller", async () => {
    await expect(
      asUser(OWNER, () =>
        resolveSurface(
          scalingDetails({
            actionScope: {
              ...scalingDetails().actionScope,
              documentId: "missing-recipe",
            },
          }),
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser(OUTSIDER, () =>
        resolveSurface(
          scalingDetails({
            ownerEmail: OUTSIDER,
            threadId: OUTSIDER_THREAD_ID,
            actionScope: {
              ...scalingDetails().actionScope,
              ownerEmail: OUTSIDER,
            },
          }),
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser(OUTSIDER, () =>
        resolveSurface(
          scalingDetails({
            ownerEmail: OUTSIDER,
            threadId: "another-users-thread",
            actionScope: {
              ...scalingDetails().actionScope,
              ownerEmail: OUTSIDER,
            },
          }),
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_thread_unavailable" });
  });

  it("fails closed if either required action is missing from the registry", async () => {
    await expect(
      asUser(OWNER, () =>
        resolveSurface(
          scalingDetails({
            availableActionNames: ["get-document", "update-document"],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_actions_unavailable",
    });
  });

  it("does not claim ordinary chat or comment scopes", async () => {
    await expect(
      resolveSurface({
        ownerEmail: OWNER,
        actionScope: { kind: "content-comment-ai", requestId: "request" },
      }),
    ).resolves.toBeNull();
  });
});
