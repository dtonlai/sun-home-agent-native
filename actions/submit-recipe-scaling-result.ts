import { fail, defineAction } from "@agent-native/core/action";
import { getRequestRunContext } from "@agent-native/core/server";
import { z } from "zod";

import {
  recipeScalingActionScopeSchema,
  RECIPE_SCALING_ACTION_NAME,
} from "../server/lib/recipe-scaling-action-surface.js";

const recipeScalingResultSchema = z
  .object({
    documentId: z.string().min(1).max(256),
    factor: z.number().finite().positive(),
    recipe: z
      .object({
        servings: z.number().int().min(1).max(10_000),
        ingredientLines: z
          .array(z.string().trim().min(1).max(300))
          .min(1)
          .max(100),
        instructions: z
          .array(z.string().trim().min(1).max(2_000))
          .min(1)
          .max(100),
        adjustmentExplanations: z
          .array(z.string().trim().min(1).max(500))
          .max(12),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    const totalCharacters = [
      ...result.recipe.ingredientLines,
      ...result.recipe.instructions,
      ...result.recipe.adjustmentExplanations,
    ].reduce((total, line) => total + line.length, 0);
    if (totalCharacters > 40_000) {
      context.addIssue({
        code: "custom",
        message: "The scaled recipe result exceeds the 40,000 character limit",
      });
    }
  });

export default defineAction({
  description:
    "Submit a validated scaled recipe for the currently authorized source document and factor. Available only during a Sun Home recipe scaling turn; this action validates and returns data without calling a model or changing Content.",
  schema: recipeScalingResultSchema,
  outputSchema: recipeScalingResultSchema,
  http: false,
  readOnly: true,
  mcpTool: false,
  run: async (input, ctx) => {
    const run = getRequestRunContext();
    const parsedScope = recipeScalingActionScopeSchema.safeParse(
      run?.actionScope,
    );
    if (
      ctx?.caller !== "tool" ||
      !ctx.userEmail ||
      !parsedScope.success ||
      !run?.allowedActionNames?.includes(RECIPE_SCALING_ACTION_NAME) ||
      parsedScope.data.ownerEmail.toLowerCase() !== ctx.userEmail.toLowerCase()
    ) {
      fail("This action requires an authorized recipe scaling turn", {
        statusCode: 403,
        errorCode: "recipe_scaling_scope_required",
      });
    }

    const scope = parsedScope.data;
    if (
      input.documentId !== scope.documentId ||
      input.factor !== scope.factor
    ) {
      fail(
        "The submitted result does not match the selected recipe and scale factor",
        {
          statusCode: 409,
          errorCode: "recipe_scaling_result_mismatch",
        },
      );
    }

    return recipeScalingResultSchema.parse(input);
  },
});
