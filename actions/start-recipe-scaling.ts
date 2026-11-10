import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { createRecipeScalingGrant } from "../server/lib/recipe-scaling-grants.js";
import { resolveDocumentAccess } from "./_document-access.js";

const schema = z
  .object({
    documentId: z.string().trim().min(1).max(256),
    factor: z.number().finite().min(0.01).max(100),
  })
  .strict();

const outputSchema = z
  .object({
    grantToken: z.string().min(40).max(100),
    documentId: z.string(),
    factor: z.number(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export default defineAction({
  description:
    "Start one explicit recipe scaling turn. Creates a short-lived, single-use local grant for an accessible Content document and scale factor; it does not call a model or change Content.",
  schema,
  outputSchema,
  agentTool: false,
  mcpTool: false,
  run: async ({ documentId, factor }) => {
    const ownerEmail = getRequestUserEmail()?.trim().toLowerCase();
    if (!ownerEmail) {
      fail("Sign in before scaling a recipe", {
        statusCode: 401,
        errorCode: "recipe_scaling_auth_required",
      });
    }
    const document = await resolveDocumentAccess(documentId);
    if (!document || document.resource.trashedAt) {
      fail("The selected recipe is unavailable", {
        statusCode: 404,
        errorCode: "recipe_scaling_document_unavailable",
      });
    }
    const grant = await createRecipeScalingGrant({
      ownerEmail,
      documentId,
      factor,
    });
    return {
      grantToken: grant.token,
      documentId,
      factor,
      expiresAt: grant.expiresAt,
    };
  },
});
