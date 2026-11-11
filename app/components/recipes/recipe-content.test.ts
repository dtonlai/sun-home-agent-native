import { describe, expect, it } from "vitest";

import { parseRecipeContent } from "./recipe-content";

describe("parseRecipeContent", () => {
  it("parses a Pad See Ew shaped recipe with grouped components and freeform servings", () => {
    const parsed = parseRecipeContent(`Pad See Ew — Thai
Serving Size
2-3 servings

Components
Sauce + Stir Fry

Ingredients
Sauce
- 2 tbsp soy sauce
Stir Fry
- noodles

Instructions
Sauce — Instructions
Mix sauce.
Stir Fry — Instructions
Cook in a hot wok.

Source: Family notes
Related links: [Technique](https://example.com)`);

    expect(parsed.servings).toBe("2-3 servings");
    expect(parsed.components).toEqual([
      {
        name: "Sauce",
        ingredients: "- 2 tbsp soy sauce",
        instructions: "Mix sauce.",
      },
      {
        name: "Stir Fry",
        ingredients: "- noodles",
        instructions: "Cook in a hot wok.",
      },
    ]);
    expect(parsed.additional).toContain("Source: Family notes");
    expect(parsed.additional).toContain("Sauce + Stir Fry");
    expect(parsed.additional).toContain("Related links:");
  });

  it("keeps Beef and Beef Marinade as separate top-level Markdown groups", () => {
    const parsed = parseRecipeContent(`Beef Chow Fun — Cantonese
Serving Size: 4-5 people

Components
Beef + Marinade

## Ingredients
Beef
- 1 lb flank steak
Beef Marinade
- beef
- soy sauce

## Instructions
Beef — Instructions
Slice the beef thinly.
Beef Marinade — Instructions
Marinate the beef.

Source: Cookbook`);

    expect(parsed.servings).toBe("4-5 people");
    expect(parsed.components).toEqual([
      {
        name: "Beef",
        ingredients: "- 1 lb flank steak",
        instructions: "Slice the beef thinly.",
      },
      {
        name: "Beef Marinade",
        ingredients: "- beef\n- soy sauce",
        instructions: "Marinate the beef.",
      },
    ]);
    expect(parsed.instructions).toBe("");
    expect(parsed.additional).toBe(
      "Beef Chow Fun — Cantonese\nComponents\nBeef + Marinade\nSource: Cookbook",
    );
  });

  it("keeps the common Markdown heading form and other Markdown visible", () => {
    expect(
      parseRecipeContent(
        "Servings: 4\n\n## Ingredients\n- 2 apples\n\n## Method\nBake until soft.\n\n## Notes\nServe warm.",
      ),
    ).toEqual({
      servings: "4",
      ingredients: "- 2 apples",
      instructions: "Bake until soft.",
      components: [],
      additional: "## Notes\nServe warm.",
      hasNamedSections: true,
    });
  });

  it("merges repeated component names ignoring case and spacing", () => {
    const parsed = parseRecipeContent(
      `Ingredients\nStir Fry:\n- noodles\nstir   fry:\n- greens`,
    );
    expect(parsed.components).toEqual([
      {
        name: "Stir Fry",
        ingredients: "- noodles\n- greens",
        instructions: "",
      },
    ]);
  });

  it("supports arbitrary component labels and ungrouped lines", () => {
    const parsed = parseRecipeContent(
      `Ingredients\n- salt\nTopping / Finish:\n- scallions\n\nInstructions\nHeat pan.`,
    );
    expect(parsed.ingredients).toBe("- salt");
    expect(parsed.instructions).toBe("Heat pan.");
    expect(parsed.components[0]).toEqual({
      name: "Topping / Finish",
      ingredients: "- scallions",
      instructions: "",
    });
  });

  it("keeps an unstructured Content body visible as additional details", () => {
    expect(parseRecipeContent("Mix well and cook until set.")).toEqual({
      servings: null,
      ingredients: "",
      instructions: "",
      components: [],
      additional: "Mix well and cook until set.",
      hasNamedSections: false,
    });
  });
});
