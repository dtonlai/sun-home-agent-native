import { describe, expect, it } from "vitest";

import {
  createRecipeInputSchema,
  serializeRecipeContent,
} from "./recipe-creation.js";

const sharedTarget = {
  target: {
    spaceId: "recipes-space",
    databaseId: "recipes-database",
    databaseDocumentId: "recipes-collection-page",
  },
  formViewId: "recipe-form",
  expectedSchemaRevision: "schema-revision-1",
  idempotencyKey: "recipe-intent-1",
};

describe("recipe creation input and Content NFM serialization", () => {
  it("preserves free-text servings and independent named groups", () => {
    const input = createRecipeInputSchema.parse({
      ...sharedTarget,
      title: "Supper",
      servings: "2-3 servings",
      ingredientGroups: [
        { name: "Beef Marinade", entries: ["1 tablespoon soy sauce"] },
        { name: "Stir Fry", entries: ["1 onion, sliced"] },
      ],
      instructionGroups: [
        { name: "Stir Fry", entries: ["Cook the onion until soft."] },
        { name: "Beef Marinade", entries: ["Marinate for 20 minutes."] },
      ],
      tags: ["weeknight", "family favorite"],
    });

    const body = serializeRecipeContent(input);
    expect(body).toContain("Servings: 2-3 servings");
    expect(body).toContain("Tags: weeknight, family favorite");
    expect(body).toContain(
      "## Ingredients\n\n**Beef Marinade**\n- 1 tablespoon soy sauce",
    );
    expect(body).toContain("**Stir Fry**\n- 1 onion, sliced");
    expect(body).toContain(
      "## Instructions\n\n**Stir Fry**\n1. Cook the onion until soft\\.",
    );
    expect(body).toContain("**Beef Marinade**\n1. Marinate for 20 minutes\\.");
  });

  it("retains repeated titled notes and source links, cuisine, and arbitrary NFM", () => {
    const input = createRecipeInputSchema.parse({
      ...sharedTarget,
      title: "Kitchen notes",
      ingredientGroups: [{ entries: ["1 cup flour"] }],
      instructionGroups: [{ entries: ["Mix well."] }],
      notes: [
        { title: "Tip", nfm: "Keep the dough cool." },
        { title: "Tip", nfm: "Rest before shaping." },
      ],
      sourceLinks: [
        { title: "Original recipe", url: "https://example.test/recipe" },
        { url: "https://example.test/notes" },
      ],
      cuisine: "Free-form cuisine",
      tags: [],
      additionalNfm: "Preserve this <callout>exactly</callout>.",
    });

    const body = serializeRecipeContent(input);
    expect(body).toContain("Cuisine: Free-form cuisine");
    expect(body).toContain("- [Original recipe](https://example.test/recipe)");
    expect(body).toContain(
      "- [https://example\\.test/notes](https://example.test/notes)",
    );
    expect(body.match(/### Tip/g)).toHaveLength(2);
    expect(body).toContain("Preserve this <callout>exactly</callout>.");
  });

  it("rejects unsafe source schemes and empty or multi-line recipe entries", () => {
    const valid = {
      ...sharedTarget,
      title: "Recipe",
      ingredientGroups: [{ entries: ["1 cup flour"] }],
      instructionGroups: [{ entries: ["Mix."] }],
      tags: [],
    };

    expect(
      createRecipeInputSchema.safeParse({
        ...valid,
        sourceLinks: [{ url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(() =>
      createRecipeInputSchema.safeParse({
        ...valid,
        sourceLinks: [{ url: "not a valid URL" }],
      }),
    ).not.toThrow();
    expect(
      createRecipeInputSchema.safeParse({
        ...valid,
        sourceLinks: [{ url: "not a valid URL" }],
      }).success,
    ).toBe(false);
    expect(
      createRecipeInputSchema.safeParse({
        ...valid,
        ingredientGroups: [{ entries: ["  "] }],
      }).success,
    ).toBe(false);
    expect(
      createRecipeInputSchema.safeParse({
        ...valid,
        instructionGroups: [{ entries: ["step one\nstep two"] }],
      }).success,
    ).toBe(false);
  });
});
