import type {
  CreatedRecipe,
  RecipeDraftInput,
} from "@/components/recipes/RecipeCreationForm";

/** UI payload aligned to the proposed CreateRecipeInput in the creation contract. */
export type RecipeCreateContext = {
  target: {
    spaceId: string;
    databaseId: string;
    databaseDocumentId: string;
  };
  formViewId: string;
  expectedSchemaRevision: string;
};

export type RecipeCreateActionInput = RecipeDraftInput & RecipeCreateContext;

/** Draft response shape from docs/recipe-creation-contract.md. */
export type RecipeCreateActionResult = {
  itemId: string;
  documentId: string;
  urlPath: string;
  receiptId: string;
  idempotency: {
    key: string;
    result: "applied" | "replayed";
    payloadDigest: string;
  };
  readback: {
    verified: true;
    title: string;
    propertyValues: Record<string, unknown>;
    bodyHash: string;
  };
};

export function adaptRecipeCreateInput(
  recipe: RecipeDraftInput,
  context: RecipeCreateContext,
): RecipeCreateActionInput {
  return { ...context, ...recipe };
}

/** Reduce the proposed action receipt to the fields needed by the form. */
export function adaptRecipeCreateResult(
  result: RecipeCreateActionResult,
): CreatedRecipe {
  return { documentId: result.documentId, urlPath: result.urlPath };
}
