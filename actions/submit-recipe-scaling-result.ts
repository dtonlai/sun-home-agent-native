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

const ingredientLineSchema = z.string().trim().min(1).max(300);
const instructionLineSchema = z.string().trim().min(1).max(2_000);
const adjustmentExplanationSchema = z.string().trim().min(1).max(500);

const recipeComponentSchema = z
  .object({
    name: z.string().trim().min(1),
    ingredientLines: z.array(ingredientLineSchema).max(100),
    instructions: z.array(instructionLineSchema).max(100),
  })
  .strict();

const recipeScalingResultSchema = z
  .object({
    documentId: z.string().min(1).max(256),
    factor: z.number().finite().positive(),
    recipe: z
      .object({
        servings: z.string().trim().max(80).nullable(),
        ingredientLines: z.array(ingredientLineSchema).max(100),
        instructions: z.array(instructionLineSchema).max(100),
        components: z.array(recipeComponentSchema).max(20).optional(),
        adjustmentExplanations: z.array(adjustmentExplanationSchema).max(12),
      })
      .strict(),
  })
  .strict()
  .superRefine((result, context) => {
    const components = result.recipe.components ?? [];
    const ingredientLineCount =
      result.recipe.ingredientLines.length +
      components.reduce(
        (count, component) => count + component.ingredientLines.length,
        0,
      );
    const instructionLineCount =
      result.recipe.instructions.length +
      components.reduce(
        (count, component) => count + component.instructions.length,
        0,
      );

    if (ingredientLineCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["recipe", "ingredientLines"],
        message:
          "The scaled recipe must include at least one ingredient across ingredientLines and components",
      });
    }
    if (instructionLineCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["recipe", "instructions"],
        message:
          "The scaled recipe must include at least one instruction across instructions and components",
      });
    }
    if (ingredientLineCount > 100) {
      context.addIssue({
        code: "custom",
        path: ["recipe", "ingredientLines"],
        message: "The scaled recipe can include at most 100 ingredient lines",
      });
    }
    if (instructionLineCount > 100) {
      context.addIssue({
        code: "custom",
        path: ["recipe", "instructions"],
        message: "The scaled recipe can include at most 100 instruction lines",
      });
    }

    components.forEach((component, index) => {
      if (
        component.ingredientLines.length === 0 &&
        component.instructions.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["recipe", "components", index],
          message:
            "A component must include at least one ingredient or instruction",
        });
      }
    });

    const totalCharacters = [
      ...result.recipe.ingredientLines,
      ...result.recipe.instructions,
      ...result.recipe.adjustmentExplanations,
      ...components.flatMap((component) => [
        component.name,
        ...component.ingredientLines,
        ...component.instructions,
      ]),
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
