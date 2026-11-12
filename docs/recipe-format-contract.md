# Recipe format and scaling-result contract proposal

**Status:** Michael approved the additive grouped scaling-result schema
extension for implementation in B1-T02. The parser and renderer proposals
remain unimplemented. Canonical recipes remain ordinary Content pages.

## Source-page reading model

The Content page title remains the recipe title. The body may use ordinary
Markdown headings or clear standalone labels such as `Serving Size`,
`Components`, `Ingredients`, and `Instructions`. The parser reads structure; it
does not rewrite, move, or normalize the source page.

The proposed read model is:

```ts
type RecipeReadModel = {
  servings: string | null;
  ingredientLines: string[]; // ungrouped ingredients
  instructions: string[]; // ungrouped instructions
  components: Array<{
    name: string;
    ingredientLines: string[];
    instructions: string[];
  }>;
  additionalMarkdown: string;
};
```

`components` is open-ended. Names such as `Sauce`, `Stir Fry`, and `Beef
Marinade` are data from the page, not a fixed enum. Keep source order and the
first source spelling for display. When ingredient and instruction sections
repeat the same component label, associate them by a case-insensitive,
whitespace-normalized exact label match; do not fuzzy-match different names.
A component may have ingredients, instructions, or both. Content that is not
clearly grouped remains in the top-level ungrouped arrays.

Within a `Components` section, named sub-sections introduce ingredient groups.
Nested `Ingredients` and `Instructions` labels may explicitly divide a
component's content. A parallel `Instructions`/`Directions` section may group
steps under the same component labels. Recognize these markers as Markdown
headings or standalone label lines when their position makes the boundary
unambiguous; words inside prose are not section markers. Unrecognized headings,
including cuisine, source, and related-link sections, stay in
`additionalMarkdown` and remain intact in the canonical Content page.

Serving values are display text, never numbers. Recognize `Serving Size`,
`Servings`, `Serves`, `Yield`, and `Makes`; accept a label and value on one line
(`Serving Size: 2-3 servings`) or a standalone label followed by the next
non-empty, non-structural value line. Preserve the trimmed value as text,
including ranges and units such as `2-3 servings`; do not coerce, multiply, or
otherwise reinterpret it during reading.

This model supports the owner's examples: recipe title and source metadata in
the page, a separate `Serving Size` label/value, arbitrary component groups,
and grouped instructions. Recipes without components continue to use the
ungrouped fields. It does not define cuisine or meal-type taxonomy, tags,
filtering, or search; those remain a separate product decision.

## Mapping to the current scale-result action

Before the approved extension, `submit-recipe-scaling-result` accepted a flat
`recipe` with
`servings`, `ingredientLines`, `instructions`, and `adjustmentExplanations`.
Its result renderer displays one flat ingredient list and one flat instruction
list. The `servings` field is already a string, so a value like `2-3 servings`
fits without a numeric conversion. The flat lists cannot represent which
component owns a line; flattening the owner's examples would lose that
relationship.

The smallest compatible extension is additive:

```ts
recipe: {
  servings: string | null;
  ingredientLines: string[]; // ungrouped lines
  instructions: string[]; // ungrouped lines
  components?: Array<{
    name: string;
    ingredientLines: string[];
    instructions: string[];
  }>;
  adjustmentExplanations: string[];
}
```

Keep `components` optional during transition so existing flat results remain
valid and render as before. For grouped results, the top-level arrays contain
only ungrouped lines; either top-level array may be empty when its lines live
in components. Validate ingredient and instruction presence across both
locations, and apply the existing line/total-character bounds across the
combined result, with a finite component-count bound. Render each component
under its own label, keeping its ingredients beside its instructions; render
ungrouped sections only when they contain lines.

## Smallest implementation sequence

1. Add a pure parser for the read model and fixtures from both owner examples.
   Cover grouped and ungrouped lines, matching and one-sided component groups,
   Markdown and standalone labels, range-valued servings, and preservation of
   unrecognized sections.
2. Extend the result action schema additively with optional `components`;
   validate aggregate bounds and keep legacy flat result input valid.
3. Update the agent instructions and native comparison renderer to preserve and
   display group names and line ownership. Keep the original read-only and keep
   the scaled result ephemeral.
4. Verify old flat results, both sample recipes, grouped-only output, and
   ungrouped recipes. No database or Content migration is required because
   source recipes remain ordinary Markdown pages.

The current `parseRecipeContent` is only a flat, heading-based presentation
helper: it recognizes same-line servings/yield labels and common Ingredients
and Instructions headings. It does not yet implement this proposal, including
the owner's standalone `Serving Size` label/value format.
