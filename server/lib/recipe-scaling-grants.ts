import { createHash, randomBytes } from "node:crypto";

import { fail } from "@agent-native/core/action";
import { and, eq, gt, isNull } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export const RECIPE_SCALING_GRANT_TTL_MS = 5 * 60 * 1000;

export type RecipeScalingGrantBinding = {
  ownerEmail: string;
  documentId: string;
  factor: number;
  threadId: string;
  turnId?: string;
  messageId?: string;
};

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function unavailable() {
  fail("This recipe scaling grant is unavailable", {
    statusCode: 404,
    errorCode: "recipe_scaling_grant_unavailable",
  });
}

function matchesBinding(
  row: typeof schema.recipeScalingGrants.$inferSelect,
  binding: Pick<
    RecipeScalingGrantBinding,
    "ownerEmail" | "threadId" | "turnId" | "messageId"
  > &
    Partial<Pick<RecipeScalingGrantBinding, "documentId" | "factor">>,
) {
  return (
    row.ownerEmail === normalizedEmail(binding.ownerEmail) &&
    (binding.documentId === undefined ||
      row.documentId === binding.documentId) &&
    (binding.factor === undefined || row.factor === String(binding.factor)) &&
    row.boundThreadId === binding.threadId &&
    row.boundTurnId === (binding.turnId ?? null) &&
    row.boundMessageId === (binding.messageId ?? null)
  );
}

export async function createRecipeScalingGrant(
  input: Pick<
    RecipeScalingGrantBinding,
    "ownerEmail" | "documentId" | "factor"
  >,
  now = new Date(),
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    now.getTime() + RECIPE_SCALING_GRANT_TTL_MS,
  ).toISOString();
  await getDb()
    .insert(schema.recipeScalingGrants)
    .values({
      tokenHash: hashToken(token),
      ownerEmail: normalizedEmail(input.ownerEmail),
      documentId: input.documentId,
      factor: String(input.factor),
      expiresAt,
      createdAt: now.toISOString(),
    });
  return { token, expiresAt };
}

/** Atomically binds an unbound grant; subsequent resolutions must match exactly. */
export async function bindRecipeScalingGrant(
  token: string,
  binding: Pick<
    RecipeScalingGrantBinding,
    "ownerEmail" | "threadId" | "turnId" | "messageId"
  > &
    Partial<Pick<RecipeScalingGrantBinding, "documentId" | "factor">>,
  now = new Date(),
) {
  const tokenHash = hashToken(token);
  const ownerEmail = normalizedEmail(binding.ownerEmail);
  const db = getDb();
  const [bound] = await db
    .update(schema.recipeScalingGrants)
    .set({
      boundThreadId: binding.threadId,
      boundTurnId: binding.turnId ?? null,
      boundMessageId: binding.messageId ?? null,
    })
    .where(
      and(
        eq(schema.recipeScalingGrants.tokenHash, tokenHash),
        eq(schema.recipeScalingGrants.ownerEmail, ownerEmail),
        ...(binding.documentId === undefined
          ? []
          : [eq(schema.recipeScalingGrants.documentId, binding.documentId)]),
        ...(binding.factor === undefined
          ? []
          : [eq(schema.recipeScalingGrants.factor, String(binding.factor))]),
        gt(schema.recipeScalingGrants.expiresAt, now.toISOString()),
        isNull(schema.recipeScalingGrants.consumedAt),
        isNull(schema.recipeScalingGrants.boundThreadId),
      ),
    )
    .returning();
  if (bound) return bound;

  const [existing] = await db
    .select()
    .from(schema.recipeScalingGrants)
    .where(
      and(
        eq(schema.recipeScalingGrants.tokenHash, tokenHash),
        eq(schema.recipeScalingGrants.ownerEmail, ownerEmail),
        ...(binding.documentId === undefined
          ? []
          : [eq(schema.recipeScalingGrants.documentId, binding.documentId)]),
        ...(binding.factor === undefined
          ? []
          : [eq(schema.recipeScalingGrants.factor, String(binding.factor))]),
        gt(schema.recipeScalingGrants.expiresAt, now.toISOString()),
        isNull(schema.recipeScalingGrants.consumedAt),
      ),
    )
    .limit(1);
  if (!existing || !matchesBinding(existing, binding)) unavailable();
  return existing;
}

/** Consume only after result input has passed its complete schema validation. */
export async function consumeRecipeScalingGrant(
  token: string,
  binding: RecipeScalingGrantBinding,
  now = new Date(),
) {
  const tokenHash = hashToken(token);
  const ownerEmail = normalizedEmail(binding.ownerEmail);
  const boundTurnCondition = binding.turnId
    ? eq(schema.recipeScalingGrants.boundTurnId, binding.turnId)
    : isNull(schema.recipeScalingGrants.boundTurnId);
  const [consumed] = await getDb()
    .update(schema.recipeScalingGrants)
    .set({ consumedAt: now.toISOString() })
    .where(
      and(
        eq(schema.recipeScalingGrants.tokenHash, tokenHash),
        eq(schema.recipeScalingGrants.ownerEmail, ownerEmail),
        eq(schema.recipeScalingGrants.documentId, binding.documentId),
        eq(schema.recipeScalingGrants.factor, String(binding.factor)),
        eq(schema.recipeScalingGrants.boundThreadId, binding.threadId),
        boundTurnCondition,
        gt(schema.recipeScalingGrants.expiresAt, now.toISOString()),
        isNull(schema.recipeScalingGrants.consumedAt),
      ),
    )
    .returning({ tokenHash: schema.recipeScalingGrants.tokenHash });
  if (!consumed) unavailable();
}
