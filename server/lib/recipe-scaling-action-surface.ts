import { fail } from "@agent-native/core/action";
import { getRequestUserEmail, getThread } from "@agent-native/core/server";
import { assertAccess } from "@agent-native/core/sharing";
import { z } from "zod";

export const RECIPE_SCALING_ACTION_NAME =
  "submit-recipe-scaling-result" as const;

export const recipeScalingActionScopeSchema = z
  .object({
    kind: z.literal("sun-home-recipe-scaling"),
    ownerEmail: z.string().email().max(320),
    documentId: z.string().min(1).max(256),
    factor: z.number().finite().positive(),
  })
  .strict();

export type RecipeScalingActionScope = z.infer<
  typeof recipeScalingActionScopeSchema
>;

type RecipeScalingSurfaceDetails = {
  ownerEmail: string | null;
  orgId?: string | null;
  threadId?: string;
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
    authenticatedUser.toLowerCase() !== details.ownerEmail.toLowerCase() ||
    details.ownerEmail.toLowerCase() !== requested.ownerEmail.toLowerCase()
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

  // Resolve Content access with the signed-in request identity. This is the
  // same Core sharing boundary used by app actions; a client-supplied ID never
  // becomes authority by appearing in actionScope.
  await assertAccess("document", requested.documentId, "viewer", {
    userEmail: details.ownerEmail,
    ...(details.orgId ? { orgId: details.orgId } : {}),
  });

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
      ...requested,
      ownerEmail: details.ownerEmail,
    } satisfies RecipeScalingActionScope,
  };
}
