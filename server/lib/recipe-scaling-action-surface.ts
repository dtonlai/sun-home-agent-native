import { fail } from "@agent-native/core/action";
import { getRequestUserEmail, getThread } from "@agent-native/core/server";
import { z } from "zod";

import { resolveDocumentAccess } from "../../actions/_document-access.js";
import { bindRecipeScalingGrant } from "./recipe-scaling-grants.js";
export const RECIPE_SCALING_ACTION_NAME =
  "submit-recipe-scaling-result" as const;

export const recipeScalingActionScopeSchema = z
  .object({
    kind: z.literal("sun-home-recipe-scaling"),
    grantToken: z.string().min(40).max(100),
  })
  .strict();

export type RecipeScalingActionScope = z.infer<
  typeof recipeScalingActionScopeSchema
>;

type RecipeScalingSurfaceDetails = {
  ownerEmail: string | null;
  orgId?: string | null;
  threadId?: string;
  requestedTurnId?: string;
  queuedMessageId?: string;
  mode?: "act" | "plan";
  actionScope?: Readonly<Record<string, unknown>>;
  availableActionNames?: readonly string[];
};

function declaresRecipeScalingScope(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "sun-home-recipe-scaling"
  );
}

export async function resolveRecipeScalingActionSurface(
  details: RecipeScalingSurfaceDetails,
) {
  if (!declaresRecipeScalingScope(details.actionScope)) return null;

  const parsed = recipeScalingActionScopeSchema.safeParse(details.actionScope);
  if (!parsed.success) {
    fail("This recipe scaling scope is invalid", {
      statusCode: 409,
      errorCode: "recipe_scaling_binding_invalid",
    });
  }

  const requested = parsed.data;
  const authenticatedUser = getRequestUserEmail();
  if (
    !details.ownerEmail ||
    !authenticatedUser ||
    authenticatedUser.toLowerCase() !== details.ownerEmail.toLowerCase()
  ) {
    fail("This recipe scaling scope is unavailable", {
      statusCode: 404,
      errorCode: "recipe_scaling_scope_unavailable",
    });
  }
  if (details.mode !== "act") {
    fail("Recipe scaling requires an active agent turn", {
      statusCode: 409,
      errorCode: "recipe_scaling_turn_invalid",
    });
  }

  const thread = details.threadId ? await getThread(details.threadId) : null;
  if (
    !thread ||
    thread.ownerEmail.toLowerCase() !== details.ownerEmail.toLowerCase()
  ) {
    fail("This recipe scaling conversation is unavailable", {
      statusCode: 404,
      errorCode: "recipe_scaling_thread_unavailable",
    });
  }

  // The opaque token identifies only a SQL grant. Its owner and recipe data
  // are loaded from the server-owned row, never from caller actionScope.
  const grant = await bindRecipeScalingGrant(requested.grantToken, {
    ownerEmail: details.ownerEmail,
    threadId: thread.id,
    turnId: details.requestedTurnId,
    messageId: details.queuedMessageId,
  });

  // Use Content's effective read authorization path, which includes the
  // Content-space authority fallback that generic Core access checks omit.
  const document = await resolveDocumentAccess(grant.documentId);
  if (!document || document.resource.trashedAt) {
    fail("The selected recipe is unavailable", {
      statusCode: 404,
      errorCode: "recipe_scaling_document_unavailable",
    });
  }

  const available = new Set(details.availableActionNames ?? []);
  if (
    !available.has("get-document") ||
    !available.has(RECIPE_SCALING_ACTION_NAME)
  ) {
    fail("Recipe scaling actions are unavailable", {
      statusCode: 409,
      errorCode: "recipe_scaling_actions_unavailable",
    });
  }

  return {
    allowedActionNames: ["get-document", RECIPE_SCALING_ACTION_NAME],
    actionScope: {
      kind: "sun-home-recipe-scaling",
      grantToken: requested.grantToken,
    } satisfies RecipeScalingActionScope,
  };
}
