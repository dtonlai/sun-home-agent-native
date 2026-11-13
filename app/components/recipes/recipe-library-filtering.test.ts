import { describe, expect, it } from "vitest";

import {
  cuisineOptions,
  filterRecipeEntries,
  parseRecipeIndexMetadata,
} from "./recipe-library-filtering";

describe("recipe library filtering", () => {
  const recipes = [
    {
      id: "soup",
      title: "Tomato Soup",
      contentPreview:
        "Tags: weeknight, vegetarian\nCuisine: Italian\nServings: 4",
    },
    {
      id: "bread",
      title: "Sourdough",
      contentPreview: "Cuisine: French\nTags: baking; vegetarian",
    },
    {
      id: "legacy",
      title: "Family Roast",
      contentPreview: "Ingredients: potatoes\nInstructions: roast",
    },
  ];

  it("parses metadata while leaving legacy recipes without metadata valid", () => {
    expect(parseRecipeIndexMetadata(recipes[0].contentPreview)).toEqual({
      cuisines: ["Italian"],
      tags: ["weeknight", "vegetarian"],
    });
    expect(parseRecipeIndexMetadata(recipes[2].contentPreview)).toEqual({
      cuisines: [],
      tags: [],
    });
  });

  it("derives cuisine choices and searches tags across ordinary recipe pages", () => {
    expect(cuisineOptions(recipes)).toEqual(["French", "Italian"]);
    expect(
      filterRecipeEntries(recipes, "vegetarian", "").map((item) => item.id),
    ).toEqual(["soup", "bread"]);
    expect(
      filterRecipeEntries(recipes, "", "Italian").map((item) => item.id),
    ).toEqual(["soup"]);
    expect(
      filterRecipeEntries(recipes, "roast", "").map((item) => item.id),
    ).toEqual(["legacy"]);
  });
});
