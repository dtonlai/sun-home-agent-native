import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runWithRequestContext } from "@agent-native/core/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { schema as dbSchema, getDb } from "../server/db/index.js";
import action from "./start-recipe-scaling.js";

const TEST_DB_PATH = join(
  tmpdir(),
  `recipe-scaling-start-${process.pid}-${Date.now()}.pglite`,
);
const OWNER = "recipe-start-owner@example.com";
const DOCUMENT_ID = "recipe-start-page";

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const plugin = (await import("../server/plugins/db.js")).default;
  await plugin(undefined as never);
}, 60_000);

beforeEach(async () => {
  await getDb().delete(dbSchema.recipeScalingGrants);
  await getDb().delete(dbSchema.documents);
  await getDb().insert(dbSchema.documents).values({
    id: DOCUMENT_ID,
    ownerEmail: OWNER,
    title: "Recipe",
    content: "Ingredients",
    bodyRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

afterAll(() => rmSync(TEST_DB_PATH, { force: true, recursive: true }));

describe("start-recipe-scaling", () => {
  it("creates a short-lived opaque local grant only for the authenticated accessible source", async () => {
    const result = await runWithRequestContext({ userEmail: OWNER }, () =>
      action.run({ documentId: DOCUMENT_ID, factor: 0.5 }, {
        caller: "frontend",
        userEmail: OWNER,
      } as never),
    );
    expect(result).toMatchObject({ documentId: DOCUMENT_ID, factor: 0.5 });
    expect(result.grantToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    const rows = await getDb().select().from(dbSchema.recipeScalingGrants);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: "0.5",
    });
    expect(rows[0].tokenHash).not.toBe(result.grantToken);
  });

  it("is not agent or MCP callable and rejects missing or inaccessible sources", async () => {
    expect(action.agentTool).toBe(false);
    expect(action.mcpTool).toBe(false);
    await expect(
      runWithRequestContext({ userEmail: OWNER }, () =>
        action.run({ documentId: "missing", factor: 1 }, {
          caller: "frontend",
          userEmail: OWNER,
        } as never),
      ),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_document_unavailable",
    });
    await expect(
      runWithRequestContext({ userEmail: "other@example.com" }, () =>
        action.run({ documentId: DOCUMENT_ID, factor: 1 }, {
          caller: "frontend",
          userEmail: "other@example.com",
        } as never),
      ),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_document_unavailable",
    });
    await expect(
      runWithRequestContext({ userEmail: OWNER }, () =>
        action.run({ documentId: DOCUMENT_ID, factor: 0 }, {
          caller: "frontend",
          userEmail: OWNER,
        } as never),
      ),
    ).rejects.toThrow();
    await getDb()
      .update(dbSchema.documents)
      .set({ trashedAt: new Date().toISOString() });
    await expect(
      runWithRequestContext({ userEmail: OWNER }, () =>
        action.run({ documentId: DOCUMENT_ID, factor: 1 }, {
          caller: "frontend",
          userEmail: OWNER,
        } as never),
      ),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_document_unavailable",
    });
  });
});
