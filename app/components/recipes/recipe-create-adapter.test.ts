import { describe, expect, it } from "vitest";

import {
  adaptRecipeCreateInput,
  adaptRecipeCreateResult,
} from "@/components/recipes/recipe-create-adapter";
import type { RecipeDraftInput } from "@/components/recipes/RecipeCreationForm";

const recipe: RecipeDraftInput = {
  idempotencyKey: "intent-1",
  title: "Roast vegetables",
  servings: "2–3 servings",
  ingredientGroups: [
    { name: "Vegetables", entries: ["2 carrots"] },
    { name: "Seasoning", entries: ["1 tsp salt"] },
  ],
  instructionGroups: [{ name: "Roast", entries: ["Bake until tender."] }],
  notes: [{ title: "Make ahead", nfm: "Prepare vegetables the night before." }],
  tags: ["weeknight", "vegetarian"],
  cuisine: "Mediterranean",
  sourceLinks: [
    { title: "Original", url: "https://example.test/recipe" },
    { url: "https://example.test/variation" },
  ],
  additionalNfm: "<callout>Keep the vegetables in a single layer.</callout>",
};

describe("recipe create action adapter", () => {
  it("adds the fresh Content target and form metadata without losing recipe fields", () => {
    const input = adaptRecipeCreateInput(recipe, {
      target: {
        spaceId: "recipes-space",
        databaseId: "recipes-database",
        databaseDocumentId: "recipes-database-page",
      },
      formViewId: "recipe-form",
      expectedSchemaRevision: "schema-revision-1",
    });

    expect(input).toEqual({
      ...recipe,
      target: {
        spaceId: "recipes-space",
        databaseId: "recipes-database",
        databaseDocumentId: "recipes-database-page",
      },
      formViewId: "recipe-form",
      expectedSchemaRevision: "schema-revision-1",
    });
  });

  it("keeps the stable page ID and URL from the proposed action result", () => {
    expect(
      adaptRecipeCreateResult({
        itemId: "row-1",
        documentId: "recipe-page-1",
        urlPath: "/page/recipe-page-1?databaseId=recipes-database",
        receiptId: "receipt-1",
        idempotency: {
          key: "intent-1",
          result: "applied",
          payloadDigest: "digest-1",
        },
        readback: {
          verified: true,
          title: "Roast vegetables",
          propertyValues: { Tags: ["weeknight"] },
          bodyHash: "body-hash-1",
        },
      }),
    ).toEqual({
      documentId: "recipe-page-1",
      urlPath: "/page/recipe-page-1?databaseId=recipes-database",
    });
  });
});
