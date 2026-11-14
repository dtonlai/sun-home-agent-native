import { describe, expect, it } from "vitest";

import {
  buildRecipeCollectionTableQuery,
  buildRecipeDocumentSearchQuery,
  cuisineOptions,
  filterRecipeEntries,
  parseRecipeIndexMetadata,
  recipeEntryFromCollectionItem,
} from "./recipe-library-filtering";

describe("recipe library filtering", () => {
  it("does not infer metadata from whitespace-collapsed and truncated list previews", () => {
    const realisticPreview = {
      id: "soup",
      title: "Tomato Soup",
      contentPreview:
        "Tomato Soup Ingredients 4 tomatoes, 1 tsp salt Method Simmer until tender...",
    };
    expect(parseRecipeIndexMetadata(realisticPreview.contentPreview)).toEqual({
      cuisines: [],
      tags: [],
    });
    expect(cuisineOptions([realisticPreview])).toEqual([]);
    expect(
      filterRecipeEntries([realisticPreview], "vegetarian", "Italian"),
    ).toEqual([]);
  });

  it("does not infer cuisine from ambiguous or truncated bounded search snippets", () => {
    const snippetOnlyRecipes = [
      {
        id: "prose-hit",
        title: "Japanese-inspired Bowl",
        snippet: "...The cuisine: Japanese is discussed in this note...",
      },
      {
        id: "truncated-field",
        title: "Family Roast",
        snippet: "...Cuisine: British Tags: family, sund...",
      },
    ];
    expect(cuisineOptions(snippetOnlyRecipes)).toEqual([]);
  });

  it("reads structured metadata from live collection row properties and legacy metadata from full bodies", () => {
    const soup = recipeEntryFromCollectionItem({
      document: { id: "soup-row", title: "Tomato Soup" },
      properties: [
        { definition: { name: "Cuisine" }, value: "Italian" },
        { definition: { name: "Tags" }, value: '["weeknight","vegetarian"]' },
      ],
    });
    const bread = recipeEntryFromCollectionItem({
      document: { id: "bread-row", title: "Sourdough" },
      properties: [
        { definition: { name: "Cuisine" }, value: "French" },
        { definition: { name: "Tags" }, value: ["baking", "vegetarian"] },
      ],
    });
    const legacy = {
      id: "legacy-page",
      title: "Family Roast",
      contentPreview: "Ingredients roast potatoes...",
      fullContent:
        "# Sunday Roast\n\nA family recipe passed along.\n\nCuisine: British\nTags: sunday, family\n\n## Ingredients\n- 2 potatoes\n\n## Method\nRoast until golden.",
    };
    const created = {
      id: "created-page",
      title: "Roasted Vegetables",
      fullContent:
        "Servings: 2\nTags: rustic\nCuisine: Italian\n## Ingredients\n\n**Vegetables**\n- 2 carrots\n\n## Instructions\n\n1. Roast until tender.",
    };
    const entries = [soup, bread, legacy, created];

    expect(cuisineOptions(entries)).toEqual(["British", "French", "Italian"]);
    expect(
      filterRecipeEntries(entries, "vegetarian", "Italian").map(
        (item) => item.id,
      ),
    ).toEqual(["soup-row"]);
    expect(
      filterRecipeEntries(entries, "", "", "family").map((item) => item.id),
    ).toEqual(["legacy-page"]);
  });

  it("builds the supported full-document and collection property queries", () => {
    expect(
      buildRecipeDocumentSearchQuery("tomato", "Italian", "vegetarian"),
    ).toBe('tomato vegetarian "Cuisine: Italian"');
    expect(
      buildRecipeCollectionTableQuery({
        search: "tomato",
        cuisine: "Italian",
        tag: "vegetarian",
        cuisineProperty: { id: "cuisine-id", name: "Cuisine", type: "text" },
        tagsProperty: { id: "tags-id", name: "Tags", type: "text" },
      }),
    ).toEqual({
      search: "tomato",
      filters: [
        {
          key: "cuisine-id",
          label: "Cuisine",
          operator: "equals",
          value: "Italian",
        },
        {
          key: "tags-id",
          label: "Tags",
          operator: "contains",
          value: "vegetarian",
        },
      ],
      sorts: [],
      filterMode: "and",
    });
    expect(
      buildRecipeCollectionTableQuery({
        search: "",
        cuisine: "Italian",
        tag: "",
        cuisineProperty: {
          id: "cuisine-id",
          name: "Cuisine",
          type: "multi_select",
        },
      }).filters,
    ).toEqual([
      {
        key: "cuisine-id",
        label: "Cuisine",
        operator: "contains",
        value: "Italian",
      },
    ]);
  });
});
