import { defineAction, embedApp } from "@agent-native/core";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import type { SubmitContentDatabaseFormResponse } from "../shared/api.js";
import { submitContentDatabaseFormMutation } from "./_content-database-form-service.js";

const submitContentDatabaseFormSchema = z.object({
  databaseId: z.string().min(1).describe("Content collection ID"),
  viewId: z
    .string()
    .min(1)
    .optional()
    .describe("Form view ID; defaults to the active or first form view"),
  title: z.string().max(500).optional().describe("Row page title"),
  content: z
    .string()
    .optional()
    .describe(
      "Row page body for narrative request details that are not represented by an enabled form property. Omit when a primary Blocks form field already carries the body.",
    ),
  propertyEntries: z
    .array(
      z.object({
        property: z
          .string()
          .min(1)
          .describe("Property definition ID or exact property name"),
        value: z.unknown().describe("Value to submit for this property"),
      }),
    )
    .min(1)
    .optional()
    .describe(
      "Form values as explicit property/value entries. Include every enabled field value the user supplied. Select, status, and multi-select values may use option IDs or labels.",
    ),
  propertyValues: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Compatibility map for programmatic callers. Agents should use propertyEntries because dynamic object keys may be discarded by model tool schemas. Omit both arguments only for a deliberately title-only submission.",
    ),
});

export default defineAction({
  description:
    "Submit one row through a Content collection form. Validates that form's required questions, resolves option labels safely, writes the title, Blocks, and property values atomically, verifies the saved row, and returns its exact page link.",
  publicAgent: {
    expose: true,
    readOnly: false,
    requiresAuth: true,
    isConsequential: true,
    title: "Submit Content Database Form",
    description:
      "Delegate a validated, atomic submission to an existing Content collection form.",
  },
  schema: submitContentDatabaseFormSchema,
  mcpApp: {
    compactCatalog: true,
    resource: embedApp({
      title: "Open submitted page",
      description: "Open the new collection row in Content.",
      iframeTitle: "Agent-Native Content",
      openLabel: "Open in Content",
      height: 900,
    }),
  },
  run: async (args) => submitContentDatabaseFormMutation(args),
  link: ({ result }) => {
    const documentId = (result as SubmitContentDatabaseFormResponse | null)
      ?.createdDocumentId;
    if (!documentId) return null;
    return {
      url: buildDeepLink({
        app: "content",
        view: "editor",
        params: { documentId },
      }),
      label: "Open submitted page",
      view: "editor",
    };
  },
});
