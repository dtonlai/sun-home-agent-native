import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";

import type { CreateRecipeResult } from "../shared/recipe-creation.js";
import {
  createRecipeInputSchema,
  serializeRecipeContent,
} from "../shared/recipe-creation.js";
import { submitContentDatabaseFormMutation } from "./_content-database-form-service.js";

export default defineAction({
  description:
    "Create one user-requested recipe in an existing authorized Content collection in the exact Recipes space. Use the formViewId and schema revision from a fresh get-content-database read. Extract from authorized recipe pages or supplied video descriptions only with existing safe tools; never claim to watch a video or scrape a source. Preserve uncertain source facts as titled notes or ask the user. Keep all ingredient and instruction groups, titled notes, source links, free-text servings, cuisine, tags, and additional NFM in the Content body. Retry an ambiguous result with the same idempotencyKey and identical input. This creates one row atomically, returns stable IDs and verified read-back, and never changes the source recipe or provisions a collection.",
  mcpTool: true,
  mcpApp: { structuredContent: true },
  schema: createRecipeInputSchema,
  agentInputSchema: createRecipeInputSchema,
  publicAgent: {
    expose: true,
    readOnly: false,
    requiresAuth: true,
    isConsequential: true,
    title: "Create Recipe",
    description:
      "Save a user-requested recipe as one row in the authorized Recipes Content collection.",
  },
  audit: {
    recordInputs: false,
    target: (args) => ({
      type: "content-database",
      id: args.target.databaseId,
      visibility: "private",
    }),
    summary: (_args, result) => {
      const recipe = result as CreateRecipeResult | null;
      return recipe
        ? `Created recipe Content row ${recipe.itemId}`
        : "Created recipe Content row";
    },
  },
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  run: async (args): Promise<CreateRecipeResult> => {
    const content = serializeRecipeContent(args);
    const propertyValues: Record<string, unknown> = {
      Tags: JSON.stringify(args.tags),
    };
    if (args.cuisine?.trim()) propertyValues.Cuisine = args.cuisine.trim();
    if (args.servings?.trim()) propertyValues.Servings = args.servings.trim();

    const {
      target,
      formViewId,
      expectedSchemaRevision,
      idempotencyKey,
      ...intent
    } = args;
    return submitContentDatabaseFormMutation(
      {
        databaseId: target.databaseId,
        viewId: formViewId,
        title: args.title,
        content,
        propertyValues,
      },
      {
        target,
        formViewId,
        expectedSchemaRevision,
        idempotencyKey,
        intent,
      },
    );
  },
  link: ({ result }) => {
    const recipe = result as CreateRecipeResult | null;
    if (!recipe) return null;
    return {
      url: buildDeepLink({
        app: "content",
        view: "editor",
        params: { documentId: recipe.documentId },
      }),
      label: "Open recipe in Content",
      view: "editor",
    };
  },
});
