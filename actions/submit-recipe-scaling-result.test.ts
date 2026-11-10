import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createThread, runWithRequestContext } from "@agent-native/core/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  bindRecipeScalingGrant,
  createRecipeScalingGrant,
} from "../server/lib/recipe-scaling-grants.js";
import action from "./submit-recipe-scaling-result.js";

const TEST_DB_PATH = join(
  tmpdir(),
  `recipe-scaling-result-${process.pid}-${Date.now()}.pglite`,
);
const OWNER = "recipe-owner@example.com";
const DOCUMENT_ID = "selected-recipe";
const OTHER_DOCUMENT_ID = "another-accessible-recipe";
const THREAD_ID = "recipe-scaling-result-thread";
const TURN_ID = "recipe-scaling-result-turn";
const FACTOR = 1.5;
const INPUT = {
  documentId: DOCUMENT_ID,
  factor: FACTOR,
  recipe: {
    servings: "6",
    ingredientLines: ["  1½ cups flour  "],
    instructions: ["  Mix and bake.  "],
    adjustmentExplanations: ["  Bake time remains unchanged.  "],
  },
};

let getDb: typeof import("../server/db/index.js").getDb;
let schema: typeof import("../server/db/schema.js");
let grantToken = "";

function asScalingTool<T>(
  run: () => Promise<T>,
  overrides: Record<string, unknown> = {},
) {
  return runWithRequestContext(
    {
      userEmail: OWNER,
      run: {
        threadId: THREAD_ID,
        allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
        actionScope: { kind: "sun-home-recipe-scaling", grantToken },
        ...overrides,
      },
    },
    run,
  );
}

function callResult(input: unknown, overrides: Record<string, unknown> = {}) {
  return asScalingTool(() =>
    action.run(
      input as never,
      {
        caller: "tool",
        userEmail: OWNER,
        threadId: THREAD_ID,
        turnId: TURN_ID,
        ...overrides,
      } as never,
    ),
  );
}

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const dbModule = await import("../server/db/index.js");
  getDb = dbModule.getDb;
  schema = dbModule.schema;
  const plugin = (await import("../server/plugins/db.js")).default;
  await plugin(undefined as never);
  await createThread(OWNER, { id: THREAD_ID });
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.recipeScalingGrants);
  await getDb().delete(schema.documents);
  await getDb().insert(schema.documents).values({
    id: DOCUMENT_ID,
    ownerEmail: OWNER,
    title: "Recipe",
    content: "Recipe body",
    bodyRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await getDb().insert(schema.documents).values({
    id: OTHER_DOCUMENT_ID,
    ownerEmail: OWNER,
    title: "Another recipe",
    content: "Another recipe body",
    bodyRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  grantToken = (
    await createRecipeScalingGrant({
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: FACTOR,
    })
  ).token;
  await runWithRequestContext({ userEmail: OWNER }, () =>
    bindRecipeScalingGrant(grantToken, {
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: FACTOR,
      threadId: THREAD_ID,
      turnId: TURN_ID,
    }),
  );
});

afterAll(() => rmSync(TEST_DB_PATH, { force: true, recursive: true }));

describe("submit-recipe-scaling-result", () => {
  it("returns a bounded result and consumes the exact caller/thread/document/factor grant", async () => {
    const result = await callResult(INPUT);
    expect(result).toEqual({
      ...INPUT,
      recipe: {
        ...INPUT.recipe,
        ingredientLines: ["1½ cups flour"],
        instructions: ["Mix and bake."],
        adjustmentExplanations: ["Bake time remains unchanged."],
      },
    });
    await expect(callResult(INPUT)).rejects.toMatchObject({
      errorCode: "recipe_scaling_grant_unavailable",
    });
  });

  it("preserves fractional and range serving text", async () => {
    for (const servings of ["1.5", "1½–2", null]) {
      const result = await callResult({
        ...INPUT,
        recipe: { ...INPUT.recipe, servings },
      });
      expect(result.recipe.servings).toBe(servings);
      // Each grant is single-use; create and bind a fresh one for the next value.
      if (servings !== null) {
        grantToken = (
          await createRecipeScalingGrant({
            ownerEmail: OWNER,
            documentId: DOCUMENT_ID,
            factor: FACTOR,
          })
        ).token;
        await runWithRequestContext({ userEmail: OWNER }, () =>
          bindRecipeScalingGrant(grantToken, {
            ownerEmail: OWNER,
            documentId: DOCUMENT_ID,
            factor: FACTOR,
            threadId: THREAD_ID,
            turnId: TURN_ID,
          }),
        );
      }
    }
  });

  it("does not consume when schema validation fails", async () => {
    await expect(
      callResult({ ...INPUT, recipe: { ...INPUT.recipe, servings: 6 } }),
    ).rejects.toThrow();
    await expect(callResult(INPUT)).resolves.toMatchObject({
      documentId: DOCUMENT_ID,
    });
  });

  it("rejects missing authority, mismatched result, caller, thread, and turn", async () => {
    await expect(
      runWithRequestContext({ userEmail: OWNER }, () =>
        action.run(INPUT, { caller: "tool", userEmail: OWNER } as never),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_required" });
    await expect(callResult({ ...INPUT, factor: 2 })).rejects.toMatchObject({
      errorCode: "recipe_scaling_grant_unavailable",
    });
    await expect(
      callResult({ ...INPUT, documentId: OTHER_DOCUMENT_ID }),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
    await expect(
      callResult(INPUT, { userEmail: "other@example.com" }),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_required" });
    await expect(
      callResult(INPUT, { threadId: "other-thread" }),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_required" });
    await expect(
      callResult(INPUT, { turnId: "other-turn" }),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });
  });

  it("checks Content access again before consuming", async () => {
    await getDb().delete(schema.documents);
    await expect(callResult(INPUT)).rejects.toMatchObject({
      errorCode: "recipe_scaling_document_unavailable",
    });
  });

  it("keeps the output contract bounded and strict", async () => {
    expect(action.schema.safeParse({ ...INPUT, extra: true }).success).toBe(
      false,
    );
    expect(
      action.schema.safeParse({
        ...INPUT,
        recipe: { ...INPUT.recipe, servings: "s".repeat(81) },
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        ...INPUT,
        recipe: { ...INPUT.recipe, instructions: ["x".repeat(2_001)] },
      }).success,
    ).toBe(false);
  });
});
