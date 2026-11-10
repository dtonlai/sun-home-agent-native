import { runWithRequestContext } from "@agent-native/core/server";
import { describe, expect, it } from "vitest";

import action from "./submit-recipe-scaling-result.js";

const OWNER = "recipe-owner@example.com";
const DOCUMENT_ID = "selected-recipe";
const FACTOR = 1.5;
const ACTION_SCOPE = {
  kind: "sun-home-recipe-scaling",
  ownerEmail: OWNER,
  documentId: DOCUMENT_ID,
  factor: FACTOR,
};
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

function asScalingTool<T>(run: () => Promise<T>) {
  return runWithRequestContext(
    {
      userEmail: OWNER,
      run: {
        allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
        actionScope: ACTION_SCOPE,
      },
    },
    run,
  );
}

describe("submit-recipe-scaling-result", () => {
  it("returns a trimmed, bounded result for the exact selected source and factor", async () => {
    const result = await asScalingTool(() =>
      action.run(INPUT, { caller: "tool", userEmail: OWNER } as never),
    );
    expect(result).toEqual({
      ...INPUT,
      recipe: {
        ...INPUT.recipe,
        ingredientLines: ["1½ cups flour"],
        instructions: ["Mix and bake."],
        adjustmentExplanations: ["Bake time remains unchanged."],
      },
    });
  });

  it("preserves fractional, range, and absent serving descriptions as text", async () => {
    for (const servings of ["1.5", "1½–2", null]) {
      const result = await asScalingTool(() =>
        action.run({ ...INPUT, recipe: { ...INPUT.recipe, servings } }, {
          caller: "tool",
          userEmail: OWNER,
        } as never),
      );
      expect(result.recipe.servings).toBe(servings);
    }
  });

  it("rejects a tool run without scope and a different signed-in caller", async () => {
    await expect(
      runWithRequestContext({ userEmail: OWNER }, () =>
        action.run(INPUT, { caller: "tool", userEmail: OWNER } as never),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_required" });

    await expect(
      asScalingTool(() =>
        action.run(INPUT, {
          caller: "tool",
          userEmail: "other@example.com",
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_required" });
  });

  it("rejects a result for another document or scale factor", async () => {
    await expect(
      asScalingTool(() =>
        action.run({ ...INPUT, documentId: "another-recipe" }, {
          caller: "tool",
          userEmail: OWNER,
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_result_mismatch" });
    await expect(
      asScalingTool(() =>
        action.run({ ...INPUT, factor: 2 }, {
          caller: "tool",
          userEmail: OWNER,
        } as never),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_result_mismatch" });
  });

  it("rejects malformed, extra-field, and oversized result data", async () => {
    expect(action.schema.safeParse({ ...INPUT, extra: true }).success).toBe(
      false,
    );
    expect(
      action.schema.safeParse({
        ...INPUT,
        recipe: { ...INPUT.recipe, servings: 6 },
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        ...INPUT,
        recipe: { ...INPUT.recipe, servings: "s".repeat(81) },
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        ...INPUT,
        recipe: {
          ...INPUT.recipe,
          instructions: ["x".repeat(2_001)],
        },
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        ...INPUT,
        recipe: {
          ...INPUT.recipe,
          instructions: [
            "x".repeat(2_000),
            "y".repeat(2_000),
            "z".repeat(2_000),
          ],
          ingredientLines: Array.from({ length: 100 }, () => "x".repeat(300)),
          adjustmentExplanations: Array.from({ length: 12 }, () =>
            "x".repeat(500),
          ),
        },
      }).success,
    ).toBe(false);
  });
});
