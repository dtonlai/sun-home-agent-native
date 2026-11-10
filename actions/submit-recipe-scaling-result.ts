import { fail, defineAction } from "@agent-native/core/action";
import {
  getRequestRunContext,
  getRequestUserEmail,
} from "@agent-native/core/server";
import { z } from "zod";

import {
  recipeScalingActionScopeSchema,
  RECIPE_SCALING_ACTION_NAME,
} from "../server/lib/recipe-scaling-action-surface.js";
import { consumeRecipeScalingGrant } from "../server/lib/recipe-scaling-grants.js";
import { resolveDocumentAccess } from "./_document-access.js";

const recipeScalingResultSchema = z
  .object({
    documentId: z.string().min(1).max(256),
    factor: z.number().finite().positive(),
    recipe: z
      .object({
        servings: z.string().trim().max(80).nullable(),
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
    "Submit a validated scaled recipe matching the active Sun Home recipe scaling scope's source document and factor. This action validates and returns data without calling a model or changing Content.",
  schema: recipeScalingResultSchema,
  outputSchema: recipeScalingResultSchema,
  chatUI: {
    renderer: "sun-home.recipe-scaling-result",
    title: "Scaled recipe comparison",
    projectResult: (_args, result) => result,
  },
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
      !run.threadId ||
      run.threadId !== ctx.threadId ||
      getRequestUserEmail()?.toLowerCase() !== ctx.userEmail.toLowerCase()
    ) {
      fail("This action requires an authorized recipe scaling turn", {
        statusCode: 403,
        errorCode: "recipe_scaling_scope_required",
      });
    }

    const result = recipeScalingResultSchema.parse(input);
    const document = await resolveDocumentAccess(result.documentId);
    if (!document || document.resource.trashedAt) {
      fail("The selected recipe is unavailable", {
        statusCode: 404,
        errorCode: "recipe_scaling_document_unavailable",
      });
    }
    await consumeRecipeScalingGrant(parsedScope.data.grantToken, {
      ownerEmail: ctx.userEmail,
      documentId: result.documentId,
      factor: result.factor,
      threadId: run.threadId,
      turnId: ctx.turnId,
    });
    return result;
  },
});
