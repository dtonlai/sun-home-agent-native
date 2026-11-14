import { describe, expect, it } from "vitest";

import {
  buildRecipeCollectionTableQuery,
  buildRecipeDocumentSearchQuery,
  cuisineOptions,
  cuisineFromSearchSnippet,
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

  it("extracts cuisine choices from full-document search snippets rather than list previews", () => {
    expect(
      cuisineFromSearchSnippet("...Cuisine: British Tags: family, sunday..."),
    ).toBe("British");
    expect(
      cuisineFromSearchSnippet("...Cuisine: Japanese Ingredients: rice..."),
    ).toBe("Japanese");
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
        "Cuisine: British\nTags: sunday, family\nIngredients: potatoes",
    };
    const entries = [soup, bread, legacy];

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
