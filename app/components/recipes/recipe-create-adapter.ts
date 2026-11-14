import type {
  CreateRecipeInput,
  CreateRecipeResult,
} from "@shared/recipe-creation";

import type {
  CreatedRecipe,
  RecipeDraftInput,
} from "@/components/recipes/RecipeCreationForm";

export type RecipeCreateContext = Pick<
  CreateRecipeInput,
  "target" | "formViewId" | "expectedSchemaRevision"
>;

export type RecipeCreateActionInput = CreateRecipeInput;
export type RecipeCreateActionResult = CreateRecipeResult;

export function adaptRecipeCreateInput(
  recipe: RecipeDraftInput,
  context: RecipeCreateContext,
): CreateRecipeInput {
  return { ...context, ...recipe };
}

export function adaptRecipeCreateResult(
  result: CreateRecipeResult,
): CreatedRecipe {
  return { documentId: result.documentId, urlPath: result.urlPath };
}
