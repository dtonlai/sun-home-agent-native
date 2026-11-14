import { z } from "zod";

const MAX_RECIPE_GROUPS = 20;
const MAX_RECIPE_LINES = 100;
const MAX_RECIPE_BODY_CHARACTERS = 60_000;

const recipeLineSchema = z
  .string()
  .max(2_000)
  .refine((value) => value.trim().length > 0, "Recipe lines cannot be empty.")
  .refine(
    (value) => !/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
    "Each recipe line must be a single line of text.",
  );

const recipeGroupSchema = z
  .object({
    name: z.string().max(120).nullable().optional(),
    entries: z.array(recipeLineSchema).min(1).max(MAX_RECIPE_LINES),
  })
  .strict();

const recipeTagSchema = z.string().trim().min(1).max(80);

export const createRecipeInputSchema = z
  .object({
    target: z
      .object({
        spaceId: z.string().min(1).max(256),
        databaseId: z.string().min(1).max(256),
        databaseDocumentId: z.string().min(1).max(256),
      })
      .strict(),
    formViewId: z.string().min(1).max(256),
    expectedSchemaRevision: z.string().min(1).max(256),
    idempotencyKey: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    servings: z.string().max(120).nullable().optional(),
    ingredientGroups: z.array(recipeGroupSchema).min(1).max(MAX_RECIPE_GROUPS),
    instructionGroups: z.array(recipeGroupSchema).min(1).max(MAX_RECIPE_GROUPS),
    notes: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(120),
            nfm: z.string().max(20_000),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    sourceLinks: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200).optional(),
            url: z
              .string()
              .url()
              .max(2_000)
              .refine((value) => {
                try {
                  return ["http:", "https:"].includes(new URL(value).protocol);
                } catch {
                  return false;
                }
              }, "Source URL must use HTTP or HTTPS."),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    cuisine: z.string().max(120).nullable().optional(),
    tags: z.array(recipeTagSchema).max(30),
    additionalNfm: z.string().max(20_000).optional(),
  })
  .strict()
  .superRefine((recipe, context) => {
    const ingredientCount = recipe.ingredientGroups.reduce(
      (count, group) => count + group.entries.length,
      0,
    );
    const instructionCount = recipe.instructionGroups.reduce(
      (count, group) => count + group.entries.length,
      0,
    );
    if (ingredientCount > MAX_RECIPE_LINES) {
      context.addIssue({
        code: "custom",
        path: ["ingredientGroups"],
        message: `A recipe can include at most ${MAX_RECIPE_LINES} ingredient lines.`,
      });
    }
    if (instructionCount > MAX_RECIPE_LINES) {
      context.addIssue({
        code: "custom",
        path: ["instructionGroups"],
        message: `A recipe can include at most ${MAX_RECIPE_LINES} instruction lines.`,
      });
    }
    const body = serializeRecipeContent(recipe);
    if (body.length > MAX_RECIPE_BODY_CHARACTERS) {
      context.addIssue({
        code: "custom",
        path: [],
        message: `Recipe content can include at most ${MAX_RECIPE_BODY_CHARACTERS} characters.`,
      });
    }
  });

export type CreateRecipeInput = z.infer<typeof createRecipeInputSchema>;

export interface CreateRecipeResult {
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
    /** Hash of the body at create time; it does not describe later edits. */
    bodyHash: string;
  };
}

function escapeInlineText(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+.!|<>]/g, "\\$&");
}

function renderGroups(
  groups: Array<{ name?: string | null; entries: string[] }>,
  ordered: boolean,
): string[] {
  return groups.flatMap((group) => {
    const heading = group.name?.trim()
      ? [`**${escapeInlineText(group.name.trim())}**`]
      : [];
    return [
      ...heading,
      ...group.entries.map((entry, index) =>
        ordered
          ? `${index + 1}. ${escapeInlineText(entry)}`
          : `- ${escapeInlineText(entry)}`,
      ),
      "",
    ];
  });
}

/** Build the canonical NFM body without flattening groups or authored notes. */
export function serializeRecipeContent(
  recipe: Pick<
    CreateRecipeInput,
    | "servings"
    | "ingredientGroups"
    | "instructionGroups"
    | "notes"
    | "sourceLinks"
    | "cuisine"
    | "tags"
    | "additionalNfm"
  >,
): string {
  const lines: string[] = [];
  if (recipe.servings?.trim()) {
    lines.push(`Servings: ${escapeInlineText(recipe.servings.trim())}`);
  }
  if (recipe.tags.length > 0) {
    lines.push(`Tags: ${recipe.tags.map(escapeInlineText).join(", ")}`);
  }
  if (recipe.cuisine?.trim()) {
    lines.push(`Cuisine: ${escapeInlineText(recipe.cuisine.trim())}`);
  }
  if (recipe.sourceLinks?.length) {
    lines.push("## Sources", "");
    for (const link of recipe.sourceLinks) {
      const href = new URL(link.url)
        .toString()
        .replaceAll("(", "%28")
        .replaceAll(")", "%29");
      lines.push(
        `- [${escapeInlineText(link.title?.trim() || link.url)}](${href})`,
      );
    }
  }
  lines.push("", "## Ingredients", "");
  lines.push(...renderGroups(recipe.ingredientGroups, false));
  lines.push("## Instructions", "");
  lines.push(...renderGroups(recipe.instructionGroups, true));

  if (recipe.notes?.length) {
    lines.push("## Notes", "");
    for (const note of recipe.notes) {
      lines.push(`### ${escapeInlineText(note.title)}`, "", note.nfm, "");
    }
  }
  if (recipe.additionalNfm?.length) {
    lines.push("## Additional details", "", recipe.additionalNfm);
  }
  return lines.join("\n").trim();
}
