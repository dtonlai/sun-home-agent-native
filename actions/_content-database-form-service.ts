import { createHash } from "node:crypto";

import { fail } from "@agent-native/core/action";
import { writeAppState } from "@agent-native/core/application-state";
import { buildDeepLink } from "@agent-native/core/server";
import {
  accessFilter,
  assertAccess,
  currentAccess,
  ForbiddenError,
} from "@agent-native/core/sharing";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "../server/db/index.js";
import { documentAttributionActor } from "../server/lib/document-attribution.js";
import type {
  ContentDatabaseView,
  DocumentPropertySystemRole,
  SubmitContentDatabaseFormResponse,
} from "../shared/api.js";
import { contentDatabaseFormQuestions } from "../shared/database-form.js";
import {
  blocksStorageTarget,
  isBlocksPropertyType,
  isEmptyPropertyValue,
  isComputedPropertyType,
  normalizePropertyValue,
  parsePropertyOptions,
  serializePropertyValue,
  type DocumentPropertyOption,
  type DocumentPropertyType,
  type DocumentPropertyValue,
} from "../shared/properties.js";
import type { CreateRecipeResult } from "../shared/recipe-creation.js";
import {
  lockContentDatabaseMutation,
  touchContentDatabase,
} from "./_content-database-mutation-lock.js";
import { ensureDocumentFilesMembership } from "./_content-files.js";
import {
  type DatabaseMutationTargetInput,
  databaseRowRevision,
  digest,
  loadContext,
} from "./_database-row-mutation.js";
import { assertCollectionAcceptsNewRows } from "./_document-source.js";
import { nextAppendPosition } from "./_position-utils.js";
import { nanoid, parseDatabaseViewConfig } from "./_property-utils.js";

type RecipeFormMutation = {
  target: DatabaseMutationTargetInput;
  formViewId: string;
  expectedSchemaRevision: string;
  idempotencyKey: string;
  intent: unknown;
};

function recipeFormPayloadDigest(mutation: RecipeFormMutation) {
  return digest({
    operation: "create_recipe",
    target: mutation.target,
    formViewId: mutation.formViewId,
    intent: mutation.intent,
  });
}

async function replayRecipeFormMutation(
  mutation: RecipeFormMutation,
  payloadDigest: string,
  ownerEmail: string,
  db = getDb(),
): Promise<CreateRecipeResult | null> {
  const [stored] = await db
    .select()
    .from(schema.contentDatabaseRowMutationReceipts)
    .where(
      and(
        eq(schema.contentDatabaseRowMutationReceipts.ownerEmail, ownerEmail),
        eq(
          schema.contentDatabaseRowMutationReceipts.idempotencyKey,
          mutation.idempotencyKey,
        ),
      ),
    );
  if (!stored) return null;
  if (
    stored.operation !== "create_recipe" ||
    stored.databaseId !== mutation.target.databaseId ||
    stored.databaseDocumentId !== mutation.target.databaseDocumentId ||
    stored.spaceId !== mutation.target.spaceId ||
    stored.payloadDigest !== payloadDigest
  ) {
    fail("This idempotency key was already used for a different recipe.", {
      errorCode: "IDEMPOTENCY_KEY_REUSED",
      statusCode: 409,
      details: { idempotencyKey: mutation.idempotencyKey },
    });
  }
  await assertAccess("document", stored.documentId, "viewer");
  const result = JSON.parse(stored.resultJson) as CreateRecipeResult;
  if (
    result.receiptId !== stored.id ||
    result.itemId !== stored.itemId ||
    result.documentId !== stored.documentId ||
    result.idempotency.payloadDigest !== stored.payloadDigest
  ) {
    fail("The stored recipe receipt is inconsistent.", {
      errorCode: "RECEIPT_MISMATCH",
      statusCode: 409,
      details: { receiptId: stored.id },
    });
  }
  return {
    ...result,
    idempotency: { ...result.idempotency, result: "replayed" },
  };
}

type PropertyDefinitionRow =
  typeof schema.documentPropertyDefinitions.$inferSelect;

function propertyDefinitionFingerprint(definitions: PropertyDefinitionRow[]) {
  return JSON.stringify(
    definitions
      .map((definition) => ({
        id: definition.id,
        name: definition.name,
        type: definition.type,
        systemRole: definition.systemRole,
        visibility: definition.visibility,
        optionsJson: definition.optionsJson,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

function resolveFormView(
  views: ContentDatabaseView[],
  activeViewId: string,
  requestedViewId?: string,
) {
  const requested = requestedViewId
    ? views.find((view) => view.id === requestedViewId)
    : (views.find((view) => view.id === activeViewId && view.type === "form") ??
      views.find((view) => view.type === "form"));
  if (!requested) throw new Error("This database does not have a form view.");
  if (requested.type !== "form") {
    throw new Error(`Database view "${requested.id}" is not a form view.`);
  }
  return requested;
}

function optionCandidates(value: unknown, multiple: boolean): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((candidate): candidate is string => typeof candidate === "string")
      .map((candidate) => candidate.trim())
      .filter(Boolean);
  }
  if (value === null || value === undefined || value === "") return [];
  const text = (
    typeof value === "string" ? value : (JSON.stringify(value) ?? "")
  ).trim();
  if (!text) return [];
  return multiple
    ? text
        .split(/[\n,]/)
        .map((candidate) => candidate.trim())
        .filter(Boolean)
    : [text];
}

function resolveOption(
  candidate: string,
  options: DocumentPropertyOption[],
  propertyName: string,
) {
  const exactId = options.find((option) => option.id === candidate);
  if (exactId) return exactId.id;
  const normalized = candidate.toLocaleLowerCase();
  const labelMatches = options.filter(
    (option) => option.name.trim().toLocaleLowerCase() === normalized,
  );
  if (labelMatches.length === 1) return labelMatches[0].id;
  if (labelMatches.length > 1) {
    throw new Error(
      `Value "${candidate}" is ambiguous for "${propertyName}". Use an option ID.`,
    );
  }
  const allowed = options.map((option) => option.name).join(", ");
  throw new Error(
    `Unknown option "${candidate}" for "${propertyName}".${allowed ? ` Choose one of: ${allowed}.` : " This property has no options."}`,
  );
}

function isValidSubmittedDatePart(value: unknown): boolean {
  if (typeof value === "number") {
    return (
      Number.isFinite(value) &&
      value % 60_000 === 0 &&
      !Number.isNaN(new Date(value).getTime())
    );
  }
  if (typeof value !== "string") return false;
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (hour > 23 || minute > 59) return false;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

function normalizeSubmittedPropertyValue(
  definition: PropertyDefinitionRow,
  value: unknown,
): DocumentPropertyValue {
  const type = definition.type as DocumentPropertyType;
  const explicitlyEmpty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);
  let normalized: DocumentPropertyValue;
  if (type === "select" || type === "status" || type === "multi_select") {
    if (Array.isArray(value)) {
      const invalidCandidates = value.filter(
        (candidate) => typeof candidate !== "string" || candidate.trim() === "",
      );
      const nonEmptyCandidates = value.filter(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim() !== "",
      );
      if (
        invalidCandidates.length > 0 ||
        (type !== "multi_select" && nonEmptyCandidates.length > 1)
      ) {
        throw new Error(
          `Invalid value for "${definition.name}"; every supplied option must be preserved exactly once.`,
        );
      }
    }
    const options = parsePropertyOptions(definition.optionsJson).options ?? [];
    const scalarOption =
      type === "multi_select" && typeof value === "string" ? value.trim() : "";
    const exactScalarOption =
      scalarOption &&
      options.some(
        (option) =>
          option.id === scalarOption ||
          option.name.trim().toLocaleLowerCase() ===
            scalarOption.toLocaleLowerCase(),
      );
    const values = (
      exactScalarOption
        ? [scalarOption]
        : optionCandidates(value, type === "multi_select")
    ).map((candidate) => resolveOption(candidate, options, definition.name));
    normalized =
      type === "multi_select" ? [...new Set(values)] : (values[0] ?? null);
  } else {
    if (
      ["person", "relation", "files_media"].includes(type) &&
      Array.isArray(value) &&
      value.some((candidate) => typeof candidate !== "string")
    ) {
      throw new Error(
        `Invalid value for "${definition.name}"; every supplied item must be preserved exactly once.`,
      );
    }
    if (type === "date") {
      const dateParts =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? [
              (value as { start?: unknown }).start,
              ...("end" in value ? [(value as { end?: unknown }).end] : []),
            ]
          : [value];
      const explicitIncludeTime =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as { includeTime?: unknown }).includeTime
          : undefined;
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        dateParts.some((part) => typeof part === "number")
      ) {
        throw new Error(
          `Invalid value for "${definition.name}"; numeric dates are only supported as scalar values.`,
        );
      }
      if (
        typeof explicitIncludeTime === "boolean" &&
        dateParts.some((part) => {
          if (
            part === undefined ||
            part === null ||
            (typeof part === "string" && part.trim() === "")
          ) {
            return false;
          }
          const hasTime =
            typeof part === "number" ||
            (typeof part === "string" && part.includes("T"));
          return hasTime !== explicitIncludeTime;
        })
      ) {
        throw new Error(
          `Invalid value for "${definition.name}"; includeTime must match the supplied date precision.`,
        );
      }
      if (
        dateParts.some(
          (part) =>
            part !== undefined &&
            part !== null &&
            !(typeof part === "string" && part.trim() === "") &&
            !isValidSubmittedDatePart(part),
        )
      ) {
        throw new Error(
          `Invalid value for "${definition.name}"; use a real ISO calendar date.`,
        );
      }
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        explicitIncludeTime === undefined &&
        dateParts.some((part) => typeof part === "string" && part.includes("T"))
      ) {
        throw new Error(
          `Invalid value for "${definition.name}"; includeTime is required for timed date ranges.`,
        );
      }
    }
    normalized = normalizePropertyValue(type, value);
  }
  const rawDateEnd =
    type === "date" &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "end" in value
      ? (value as { end?: unknown }).end
      : undefined;
  const hasSuppliedDateEnd =
    rawDateEnd !== undefined &&
    rawDateEnd !== null &&
    (typeof rawDateEnd !== "string" || rawDateEnd.trim() !== "");
  if (
    hasSuppliedDateEnd &&
    (typeof normalized !== "object" ||
      normalized === null ||
      Array.isArray(normalized) ||
      !("end" in normalized) ||
      !normalized.end)
  ) {
    throw new Error(
      `Invalid value for "${definition.name}"; the supplied date end could not be preserved.`,
    );
  }
  if (
    type === "date" &&
    typeof normalized === "object" &&
    normalized !== null &&
    !Array.isArray(normalized) &&
    "includeTime" in normalized &&
    normalized.includeTime === true &&
    "end" in normalized &&
    typeof normalized.end === "string" &&
    "start" in normalized &&
    typeof normalized.start === "string" &&
    normalized.end < normalized.start
  ) {
    throw new Error(
      `Invalid value for "${definition.name}"; the supplied date end is before the start.`,
    );
  }
  if (!explicitlyEmpty && isEmptyPropertyValue(normalized)) {
    throw new Error(
      `Invalid value for "${definition.name}"; the supplied value could not be preserved as ${type}.`,
    );
  }
  return normalized;
}

function resolveSubmittedProperties(
  definitions: PropertyDefinitionRow[],
  enabledPropertyIds: Set<string>,
  submitted: ReadonlyArray<readonly [string, unknown]>,
) {
  const byId = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const byName = new Map<string, PropertyDefinitionRow[]>();
  for (const definition of definitions) {
    const key = definition.name.trim().toLocaleLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), definition]);
  }

  const resolved = new Map<string, DocumentPropertyValue>();
  for (const [inputKey, inputValue] of submitted) {
    const exact = byId.get(inputKey);
    const named = byName.get(inputKey.trim().toLocaleLowerCase()) ?? [];
    if (exact && named.some((definition) => definition.id !== exact.id)) {
      throw new Error(
        `Property identifier "${inputKey}" matches one property ID and another property name. Use an unambiguous property name or ID.`,
      );
    }
    if (!exact && named.length > 1) {
      throw new Error(
        `Property name "${inputKey}" is ambiguous. Use a property definition ID.`,
      );
    }
    const definition = exact ?? named[0];
    if (!definition) throw new Error(`Unknown form property "${inputKey}".`);
    if (definition.systemRole) {
      throw new Error(
        `System property "${definition.name}" cannot be submitted.`,
      );
    }
    if (!enabledPropertyIds.has(definition.id)) {
      throw new Error(
        `Property "${definition.name}" is not enabled in this form.`,
      );
    }
    const type = definition.type as DocumentPropertyType;
    if (isComputedPropertyType(type)) {
      throw new Error(
        `Computed property "${definition.name}" cannot be submitted.`,
      );
    }
    if (resolved.has(definition.id)) {
      throw new Error(
        `Property "${definition.name}" was submitted more than once.`,
      );
    }
    resolved.set(
      definition.id,
      normalizeSubmittedPropertyValue(definition, inputValue),
    );
  }
  return resolved;
}

/** Shared Content form writer used by the public form action and create-recipe. */
export function submitContentDatabaseFormMutation(
  args: SubmitContentDatabaseFormRequest,
): Promise<SubmitContentDatabaseFormResponse>;
export function submitContentDatabaseFormMutation(
  args: SubmitContentDatabaseFormRequest,
  recipeMutation: RecipeFormMutation,
): Promise<CreateRecipeResult>;
export async function submitContentDatabaseFormMutation(
  args: SubmitContentDatabaseFormRequest,
  recipeMutation?: RecipeFormMutation,
): Promise<SubmitContentDatabaseFormResponse | CreateRecipeResult> {
  const {
    databaseId,
    viewId,
    title,
    content,
    propertyEntries,
    propertyValues,
  } = args;
  if (propertyEntries && propertyValues) {
    throw new Error("Provide propertyEntries or propertyValues, not both.");
  }
  let submittedEntries: ReadonlyArray<readonly [string, unknown]> =
    propertyEntries
      ? propertyEntries.map(({ property, value }) => [property, value])
      : Object.entries(propertyValues ?? {});
  const db = getDb();
  const [database] = await db
    .select()
    .from(schema.contentDatabases)
    .where(
      and(
        eq(schema.contentDatabases.id, databaseId),
        isNull(schema.contentDatabases.deletedAt),
      ),
    );
  if (!database) throw new Error(`Database "${databaseId}" not found.`);
  if (!database.spaceId) {
    throw new Error("Database does not belong to a Content space.");
  }

  const accessContext = currentAccess();
  const access = await assertAccess(
    "document",
    database.documentId,
    "editor",
    accessContext,
  );
  const databaseDocument = access.resource;
  if (databaseDocument.spaceId !== database.spaceId) {
    throw new Error(
      "Database page and database belong to different Content spaces.",
    );
  }
  let payloadDigest: string | undefined;
  let recipeSpaceId: string | undefined;
  let recipeSourceManagedPropertyIds: Set<string> | undefined;
  if (recipeMutation) {
    if (
      recipeMutation.target.databaseId !== database.id ||
      recipeMutation.target.spaceId !== database.spaceId ||
      recipeMutation.target.databaseDocumentId !== database.documentId ||
      recipeMutation.formViewId !== viewId
    ) {
      fail(
        "The recipe target or form view does not match the selected collection.",
        {
          errorCode: "recipe_target_mismatch",
          statusCode: 409,
        },
      );
    }
    const [space] = await db
      .select({ id: schema.contentSpaces.id, name: schema.contentSpaces.name })
      .from(schema.contentSpaces)
      .where(
        and(
          eq(schema.contentSpaces.id, database.spaceId),
          isNull(schema.contentSpaces.archivedAt),
        ),
      );
    if (space?.name !== "Recipes") {
      fail("Choose an authorized collection in the exact Recipes space.", {
        errorCode: "recipe_space_required",
        statusCode: 404,
      });
    }
    recipeSpaceId = space.id;
    payloadDigest = recipeFormPayloadDigest(recipeMutation);
    const replay = await replayRecipeFormMutation(
      recipeMutation,
      payloadDigest,
      database.ownerEmail,
    );
    if (replay) return replay;

    const lockedReplay = await db.transaction(async (tx) => {
      await lockContentDatabaseMutation(
        tx as unknown as ReturnType<typeof getDb>,
        database.id,
      );
      return replayRecipeFormMutation(
        recipeMutation,
        payloadDigest!,
        database.ownerEmail,
        tx as unknown as ReturnType<typeof getDb>,
      );
    });
    if (lockedReplay) return lockedReplay;

    const currentContext = await loadContext(recipeMutation.target, "editor");
    if (
      currentContext.schemaRevision !== recipeMutation.expectedSchemaRevision
    ) {
      fail("The Recipes collection schema changed. Read it again and retry.", {
        errorCode: "SCHEMA_REVISION_CONFLICT",
        statusCode: 409,
        details: {
          expected: recipeMutation.expectedSchemaRevision,
          actual: currentContext.schemaRevision,
        },
      });
    }
    recipeSourceManagedPropertyIds = currentContext.sourceManagedPropertyIds;
  }
  await assertCollectionAcceptsNewRows(database.id, db);
  const definitions = await db
    .select()
    .from(schema.documentPropertyDefinitions)
    .where(
      and(
        eq(schema.documentPropertyDefinitions.databaseId, databaseId),
        eq(schema.documentPropertyDefinitions.ownerEmail, database.ownerEmail),
      ),
    );
  if (recipeMutation) {
    const names = new Set(
      definitions.map((definition) =>
        definition.name.trim().toLocaleLowerCase(),
      ),
    );
    submittedEntries = submittedEntries.filter(([property]) => {
      const name = property.trim().toLocaleLowerCase();
      return (name !== "cuisine" && name !== "servings") || names.has(name);
    });
  }
  const definitionsFingerprint = propertyDefinitionFingerprint(definitions);
  const viewConfig = parseDatabaseViewConfig(database.viewConfigJson);
  const formView = resolveFormView(
    viewConfig.views,
    viewConfig.activeViewId,
    viewId,
  );
  if (recipeMutation && formView.id !== recipeMutation.formViewId) {
    fail("The selected recipe form view is no longer available.", {
      errorCode: "recipe_form_view_changed",
      statusCode: 409,
    });
  }
  if (recipeMutation) {
    for (const propertyName of ["Tags", "Cuisine", "Servings"]) {
      const matches = definitions.filter(
        (definition) =>
          definition.name.trim().toLocaleLowerCase() ===
          propertyName.toLocaleLowerCase(),
      );
      if (
        matches.length > 1 ||
        (propertyName === "Tags" && matches.length !== 1)
      ) {
        fail(
          `The Recipes collection needs one unambiguous "${propertyName}" property.`,
          {
            errorCode: "recipe_collection_schema_ambiguous",
            statusCode: 409,
            details: { propertyName },
          },
        );
      }
      if (matches.length === 1 && matches[0].type !== "text") {
        fail(
          `The Recipes collection property "${propertyName}" must use the Text type.`,
          {
            errorCode: "recipe_collection_schema_mismatch",
            statusCode: 409,
            details: {
              propertyName,
              propertyId: matches[0].id,
              actualType: matches[0].type,
              requiredType: "text",
            },
          },
        );
      }
      if (
        matches.length === 1 &&
        recipeSourceManagedPropertyIds?.has(matches[0].id)
      ) {
        fail(
          `The Recipes collection property "${propertyName}" is source-managed.`,
          {
            errorCode: "recipe_collection_schema_mismatch",
            statusCode: 409,
            details: { propertyName, propertyId: matches[0].id },
          },
        );
      }
    }
  }
  const properties = definitions.map((definition) => ({
    definition: {
      id: definition.id,
      type: definition.type as DocumentPropertyType,
      systemRole: definition.systemRole as DocumentPropertySystemRole | null,
    },
  }));
  const questions = contentDatabaseFormQuestions(formView, properties);
  const enabledQuestions = questions.filter((question) => question.enabled);
  const enabledPropertyIds = new Set(
    enabledQuestions
      .filter((question) => question.key !== "name")
      .map((question) => question.key),
  );
  const values = resolveSubmittedProperties(
    definitions,
    enabledPropertyIds,
    submittedEntries,
  );
  const normalizedTitle = title?.trim() ?? "";
  const definitionById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );

  const missing = enabledQuestions.flatMap((question) => {
    if (!question.required) return [];
    if (question.key === "name") return normalizedTitle ? [] : ["Name"];
    const definition = definitionById.get(question.key);
    if (!definition) return [`Missing property (${question.key})`];
    return isEmptyPropertyValue(values.get(question.key) ?? null)
      ? [definition.name]
      : [];
  });
  if (missing.length > 0) {
    throw new Error(`Required form fields are missing: ${missing.join(", ")}.`);
  }

  const documentId = nanoid();
  const itemId = nanoid();
  const now = new Date().toISOString();
  const primaryBlocks = definitions.find((definition) => {
    const type = definition.type as DocumentPropertyType;
    return (
      isBlocksPropertyType(type) &&
      blocksStorageTarget(parsePropertyOptions(definition.optionsJson)) ===
        "document_body"
    );
  });
  const primaryContent = primaryBlocks
    ? values.get(primaryBlocks.id)
    : undefined;
  if (
    typeof primaryContent === "string" &&
    content !== undefined &&
    primaryContent !== content
  ) {
    throw new Error(
      "Provide narrative body content either through the primary Blocks form field or content, not both.",
    );
  }
  const documentContent =
    typeof primaryContent === "string" ? primaryContent : (content ?? "");
  const standardValues = [...values.entries()].filter(([propertyId]) => {
    const definition = definitionById.get(propertyId);
    return (
      definition &&
      !isBlocksPropertyType(definition.type as DocumentPropertyType)
    );
  });
  const additionalBlocks = [...values.entries()].filter(([propertyId]) => {
    const definition = definitionById.get(propertyId);
    return (
      definition &&
      isBlocksPropertyType(definition.type as DocumentPropertyType) &&
      propertyId !== primaryBlocks?.id
    );
  });
  const actor = documentAttributionActor();
  const shareCreatedBy = actor ?? database.ownerEmail;

  const createdRecipe = await db.transaction(async (tx) => {
    await lockContentDatabaseMutation(
      tx as unknown as ReturnType<typeof getDb>,
      databaseId,
    );
    if (recipeMutation && payloadDigest) {
      const lockedReplay = await replayRecipeFormMutation(
        recipeMutation,
        payloadDigest,
        database.ownerEmail,
        tx as unknown as ReturnType<typeof getDb>,
      );
      if (lockedReplay) return lockedReplay;
    }
    const [lockedDatabase] = await tx
      .select({
        viewConfigJson: schema.contentDatabases.viewConfigJson,
        deletedAt: schema.contentDatabases.deletedAt,
      })
      .from(schema.contentDatabases)
      .where(eq(schema.contentDatabases.id, databaseId));
    if (
      !lockedDatabase ||
      lockedDatabase.deletedAt !== null ||
      lockedDatabase.viewConfigJson !== database.viewConfigJson
    ) {
      throw new Error(
        "The database form changed before form submission completed.",
      );
    }
    if (recipeMutation && payloadDigest) {
      const lockedRecipeContext = await loadContext(
        recipeMutation.target,
        "editor",
        tx as unknown as ReturnType<typeof getDb>,
        true,
      );
      if (
        lockedRecipeContext.schemaRevision !==
        recipeMutation.expectedSchemaRevision
      ) {
        fail("The Recipes collection schema changed during submission.", {
          errorCode: "SCHEMA_REVISION_CONFLICT",
          statusCode: 409,
          details: {
            expected: recipeMutation.expectedSchemaRevision,
            actual: lockedRecipeContext.schemaRevision,
          },
        });
      }
      if (lockedRecipeContext.database.spaceId !== recipeSpaceId) {
        fail("The recipe collection changed spaces during submission.", {
          errorCode: "recipe_target_mismatch",
          statusCode: 409,
        });
      }
      const [lockedRecipeSpace] = await tx
        .select({
          id: schema.contentSpaces.id,
          name: schema.contentSpaces.name,
          archivedAt: schema.contentSpaces.archivedAt,
        })
        .from(schema.contentSpaces)
        .where(eq(schema.contentSpaces.id, recipeSpaceId!));
      if (
        !lockedRecipeSpace ||
        lockedRecipeSpace.archivedAt !== null ||
        lockedRecipeSpace.name !== "Recipes"
      ) {
        fail("The selected Recipes space changed during submission.", {
          errorCode: "recipe_space_required",
          statusCode: 409,
        });
      }
    }
    await tx
      .update(schema.documentShares)
      .set({ role: sql`${schema.documentShares.role}` })
      .where(eq(schema.documentShares.resourceId, database.documentId))
      .returning({ id: schema.documentShares.id });
    const lockedDocuments = await tx
      .update(schema.documents)
      .set({ updatedAt: sql`${schema.documents.updatedAt}` })
      .where(eq(schema.documents.id, database.documentId))
      .returning({ id: schema.documents.id });
    if (lockedDocuments.length !== 1) {
      throw new Error("Database page not found.");
    }
    const [lockedAccess] = await tx
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, database.documentId),
          accessFilter(
            schema.documents,
            schema.documentShares,
            accessContext,
            "editor",
          ),
        ),
      );
    if (!lockedAccess) {
      throw new ForbiddenError(
        `Requires editor role on document ${database.documentId}`,
      );
    }
    await touchContentDatabase(
      tx as unknown as ReturnType<typeof getDb>,
      databaseId,
      now,
    );
    const lockedDefinitions = await tx
      .select()
      .from(schema.documentPropertyDefinitions)
      .where(
        and(
          eq(schema.documentPropertyDefinitions.databaseId, databaseId),
          eq(
            schema.documentPropertyDefinitions.ownerEmail,
            database.ownerEmail,
          ),
        ),
      );
    if (
      propertyDefinitionFingerprint(lockedDefinitions) !==
      definitionsFingerprint
    ) {
      throw new Error(
        "Database properties changed before form submission completed.",
      );
    }
    const [maxDocumentPosition] = await tx
      .select({ max: sql<unknown>`COALESCE(MAX(position), -1)` })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.ownerEmail, database.ownerEmail),
          eq(schema.documents.parentId, database.documentId),
        ),
      );
    const [maxItemPosition] = await tx
      .select({ max: sql<unknown>`COALESCE(MAX(position), -1)` })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, databaseId));
    const inheritedShares = await tx
      .select({
        principalType: schema.documentShares.principalType,
        principalId: schema.documentShares.principalId,
        role: schema.documentShares.role,
      })
      .from(schema.documentShares)
      .where(eq(schema.documentShares.resourceId, database.documentId));

    await tx.insert(schema.documents).values({
      id: documentId,
      spaceId: database.spaceId,
      ownerEmail: database.ownerEmail,
      orgId: database.orgId,
      parentId: database.documentId,
      title: normalizedTitle,
      content: documentContent,
      icon: null,
      position: nextAppendPosition(maxDocumentPosition?.max),
      isFavorite: 0,
      hideFromSearch: databaseDocument.hideFromSearch ?? 0,
      visibility: databaseDocument.visibility ?? "private",
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(schema.contentDatabaseItems).values({
      id: itemId,
      ownerEmail: database.ownerEmail,
      orgId: database.orgId,
      databaseId,
      documentId,
      position: nextAppendPosition(maxItemPosition?.max),
      createdAt: now,
      updatedAt: now,
    });
    if (inheritedShares.length > 0) {
      await tx.insert(schema.documentShares).values(
        inheritedShares.map((share) => ({
          id: nanoid(),
          resourceId: documentId,
          principalType: share.principalType,
          principalId: share.principalId,
          role: share.role,
          createdBy: shareCreatedBy,
          createdAt: now,
        })),
      );
    }
    if (standardValues.length > 0) {
      await tx.insert(schema.documentPropertyValues).values(
        standardValues.map(([propertyId, value]) => ({
          id: nanoid(),
          ownerEmail: database.ownerEmail,
          documentId,
          propertyId,
          valueJson: serializePropertyValue(value),
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    if (additionalBlocks.length > 0) {
      await tx.insert(schema.documentBlockFieldContents).values(
        additionalBlocks.map(([propertyId, value]) => ({
          id: nanoid(),
          ownerEmail: database.ownerEmail,
          documentId,
          propertyId,
          content: typeof value === "string" ? value : "",
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    await ensureDocumentFilesMembership(tx, documentId, now);

    const [savedDocument] = await tx
      .select({
        id: schema.documents.id,
        title: schema.documents.title,
        content: schema.documents.content,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId));
    const [savedItem] = await tx
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(
        and(
          eq(schema.contentDatabaseItems.id, itemId),
          eq(schema.contentDatabaseItems.documentId, documentId),
          eq(schema.contentDatabaseItems.databaseId, databaseId),
        ),
      );
    const savedPropertyValues =
      standardValues.length === 0
        ? []
        : await tx
            .select({
              propertyId: schema.documentPropertyValues.propertyId,
              valueJson: schema.documentPropertyValues.valueJson,
            })
            .from(schema.documentPropertyValues)
            .where(
              and(
                eq(schema.documentPropertyValues.documentId, documentId),
                inArray(
                  schema.documentPropertyValues.propertyId,
                  standardValues.map(([propertyId]) => propertyId),
                ),
              ),
            );
    const savedByPropertyId = new Map(
      savedPropertyValues.map((value) => [value.propertyId, value.valueJson]),
    );
    const standardValuesVerified = standardValues.every(
      ([propertyId, value]) =>
        savedByPropertyId.get(propertyId) === serializePropertyValue(value),
    );
    const savedAdditionalBlocks =
      additionalBlocks.length === 0
        ? []
        : await tx
            .select({
              propertyId: schema.documentBlockFieldContents.propertyId,
              content: schema.documentBlockFieldContents.content,
            })
            .from(schema.documentBlockFieldContents)
            .where(
              and(
                eq(schema.documentBlockFieldContents.documentId, documentId),
                inArray(
                  schema.documentBlockFieldContents.propertyId,
                  additionalBlocks.map(([propertyId]) => propertyId),
                ),
              ),
            );
    const savedBlockByPropertyId = new Map(
      savedAdditionalBlocks.map((value) => [value.propertyId, value.content]),
    );
    const additionalBlocksVerified = additionalBlocks.every(
      ([propertyId, value]) =>
        savedBlockByPropertyId.get(propertyId) ===
        (typeof value === "string" ? value : ""),
    );
    if (
      !savedDocument ||
      !savedItem ||
      savedDocument.title !== normalizedTitle ||
      savedDocument.content !== documentContent ||
      !standardValuesVerified ||
      !additionalBlocksVerified
    ) {
      throw new Error(
        "The form submission could not be verified; no row was saved.",
      );
    }

    if (recipeMutation && payloadDigest) {
      const propertyValuesReadback = Object.fromEntries(
        savedPropertyValues.map(({ propertyId, valueJson }) => [
          propertyId,
          JSON.parse(valueJson) as unknown,
        ]),
      );
      const bodyHash = `sha256:${createHash("sha256")
        .update(savedDocument.content)
        .digest("hex")}`;
      const rowRevision = databaseRowRevision({
        itemId,
        documentId,
        title: savedDocument.title,
        values: standardValues.map(([propertyId, value]) => ({
          propertyId,
          value,
        })),
      });
      const result: CreateRecipeResult = {
        itemId,
        documentId,
        urlPath: `/page/${encodeURIComponent(documentId)}?${new URLSearchParams({ databaseId, databaseDocumentId: database.documentId }).toString()}`,
        receiptId: nanoid(),
        idempotency: {
          key: recipeMutation.idempotencyKey,
          result: "applied",
          payloadDigest,
        },
        readback: {
          verified: true,
          title: savedDocument.title,
          propertyValues: propertyValuesReadback,
          bodyHash,
        },
      };
      await tx.insert(schema.contentDatabaseRowMutationReceipts).values({
        id: result.receiptId,
        ownerEmail: database.ownerEmail,
        orgId: database.orgId,
        spaceId: database.spaceId!,
        databaseId,
        databaseDocumentId: database.documentId,
        operation: "create_recipe",
        itemId,
        documentId,
        idempotencyKey: recipeMutation.idempotencyKey,
        payloadDigest,
        schemaRevision: recipeMutation.expectedSchemaRevision,
        preRowRevision: null,
        postRowRevision: rowRevision,
        resultJson: JSON.stringify(result),
        createdAt: now,
        updatedAt: now,
      });
      return result;
    }
    return null;
  });

  if (createdRecipe) {
    await writeAppState("refresh-signal", { ts: Date.now() });
    return createdRecipe;
  }

  await writeAppState("refresh-signal", { ts: Date.now() });
  const deepLink = buildDeepLink({
    app: "content",
    view: "editor",
    params: { documentId },
  });
  return {
    databaseId,
    viewId: formView.id,
    createdItemId: itemId,
    createdDocumentId: documentId,
    urlPath: `/page/${documentId}`,
    deepLink,
    submittedProperties: [...values.keys()].map((propertyId) => ({
      propertyId,
      name: definitionById.get(propertyId)?.name ?? propertyId,
    })),
    submittedContent: documentContent !== "",
    verified: true,
  };
}
