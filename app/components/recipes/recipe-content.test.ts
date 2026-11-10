import { describe, expect, it } from "vitest";

import { parseRecipeContent } from "./recipe-content";

describe("parseRecipeContent", () => {
  it("splits a minimal recipe while preserving other Markdown", () => {
    expect(
      parseRecipeContent(
        "Servings: 4\n\n## Ingredients\n- 2 apples\n\n## Method\nBake until soft.\n\n## Notes\nServe warm.",
      ),
    ).toEqual({
      servings: "4",
      ingredients: "- 2 apples",
      instructions: "Bake until soft.",
      additional: "## Notes\nServe warm.",
      hasNamedSections: true,
    });
  });

  it("keeps an unstructured Content body visible as additional details", () => {
    expect(parseRecipeContent("Mix well and cook until set.")).toEqual({
      servings: null,
      ingredients: "",
      instructions: "",
      additional: "Mix well and cook until set.",
      hasNamedSections: false,
    });
  });
});
