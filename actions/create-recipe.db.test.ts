import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withMigrationRuntime } from "@agent-native/core/db";
import { runWithRequestContext } from "@agent-native/core/server";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_PATH = join(
  tmpdir(),
  `content-create-recipe-${process.pid}-${Date.now()}.pglite`,
);
const OWNER = "recipe-owner@example.com";
const OTHER = "other-user@example.com";

type Schema = typeof import("../server/db/schema.js");
let getDb: () => any;
let schema: Schema;
let createRecipe: typeof import("./create-recipe.js").default;
let searchDocuments: typeof import("./search-documents.js").default;
let recipesSpaceId: string;
let recipesDatabaseId: string;
let recipesDocumentId: string;
let tagPropertyId: string;
let cuisinePropertyId: string;
let servingsPropertyId: string;
let fixtureCounter = 0;

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const dbModule = await import("../server/db/index.js");
  getDb = dbModule.getDb;
  schema = dbModule.schema;
  createRecipe = (await import("./create-recipe.js")).default;
  searchDocuments = (await import("./search-documents.js")).default;
  const database = await import("../server/plugins/db.js");
  await withMigrationRuntime(async () => {
    await database.runContentMigrations(null);
    await database.runContentSourceMigrations(null);
  });
}, 60_000);

async function seedRecipesCollection() {
  const suffix = `${process.pid}_${Date.now()}_${++fixtureCounter}`;
  recipesSpaceId = `recipes_space_${suffix}`;
  recipesDatabaseId = `recipes_database_${suffix}`;
  recipesDocumentId = `recipes_database_page_${suffix}`;
  tagPropertyId = `recipe_tags_${suffix}`;
  cuisinePropertyId = `recipe_cuisine_${suffix}`;
  servingsPropertyId = `recipe_servings_${suffix}`;
  const now = new Date().toISOString();
  await getDb()
    .insert(schema.contentSpaces)
    .values({
      id: recipesSpaceId,
      name: "Recipes",
      kind: "personal",
      ownerEmail: OWNER,
      filesDatabaseId: `recipes_files_database_${suffix}`,
      createdBy: OWNER,
      createdAt: now,
      updatedAt: now,
    });
  await getDb().insert(schema.documents).values({
    id: recipesDocumentId,
    spaceId: recipesSpaceId,
    ownerEmail: OWNER,
    title: "Recipe collection",
    content: "",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });
  await getDb()
    .insert(schema.contentDatabases)
    .values({
      id: recipesDatabaseId,
      spaceId: recipesSpaceId,
      ownerEmail: OWNER,
      documentId: recipesDocumentId,
      title: "Recipe collection",
      viewConfigJson: JSON.stringify({
        activeViewId: "recipe-form",
        views: [
          {
            id: "recipe-form",
            name: "Recipe form",
            type: "form",
            formQuestions: [
              { key: "name", enabled: true, required: true },
              { key: tagPropertyId, enabled: true, required: false },
              { key: cuisinePropertyId, enabled: true, required: false },
              { key: servingsPropertyId, enabled: true, required: false },
            ],
          },
        ],
      }),
      createdAt: now,
      updatedAt: now,
    });
  await getDb()
    .insert(schema.documentPropertyDefinitions)
    .values([
      {
        id: tagPropertyId,
        ownerEmail: OWNER,
        databaseId: recipesDatabaseId,
        name: "Tags",
        type: "text",
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: cuisinePropertyId,
        ownerEmail: OWNER,
        databaseId: recipesDatabaseId,
        name: "Cuisine",
        type: "text",
        position: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: servingsPropertyId,
        ownerEmail: OWNER,
        databaseId: recipesDatabaseId,
        name: "Servings",
        type: "text",
        position: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);
}

beforeEach(seedRecipesCollection);

afterAll(() => {
  rmSync(TEST_DB_PATH, { force: true, recursive: true });
});

function asUser<T>(userEmail: string, run: () => Promise<T>) {
  return runWithRequestContext({ userEmail }, run);
}

async function input(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const { loadContext } = await import("./_database-row-mutation.js");
  const target = {
    spaceId: recipesSpaceId,
    databaseId: recipesDatabaseId,
    databaseDocumentId: recipesDocumentId,
  };
  const current = await asUser(OWNER, () => loadContext(target, "editor"));
  return {
    target,
    formViewId: "recipe-form",
    expectedSchemaRevision: current.schemaRevision,
    idempotencyKey: `recipe-create-${Math.random().toString(36).slice(2)}`,
    title: "Weeknight stir fry",
    servings: "2-3 servings",
    ingredientGroups: [
      { name: "Beef Marinade", entries: ["1 tablespoon soy sauce"] },
      { name: "Stir Fry", entries: ["1 onion, sliced"] },
    ],
    instructionGroups: [
      { name: "Stir Fry", entries: ["Cook the onion until soft."] },
      { name: "Beef Marinade", entries: ["Marinate for 20 minutes."] },
    ],
    notes: [
      { title: "Source details to confirm", nfm: "Check the pan size." },
      { title: "Serving", nfm: "Serve while hot." },
    ],
    sourceLinks: [
      { title: "Recipe source", url: "https://example.test/stir-fry" },
    ],
    cuisine: "Weeknight kitchen",
    tags: ["quick", "family favorite"],
    additionalNfm: "Retain this author's extra note.",
    ...overrides,
  };
}

describe("create-recipe", () => {
  it("creates one private Content row with complete body, metadata, and verified receipt", async () => {
    const args = await input();
    const result = await asUser(OWNER, () => createRecipe.run(args as any));
    const [document] = await getDb()
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, result.documentId));
    const body = document.content;

    expect(result).toMatchObject({
      idempotency: { result: "applied", key: args.idempotencyKey },
      readback: { verified: true, title: args.title },
    });
    expect(result.readback.bodyHash).toBe(
      `sha256:${createHash("sha256").update(body).digest("hex")}`,
    );
    expect(document).toMatchObject({
      title: args.title,
      content: expect.stringContaining("## Ingredients"),
      visibility: "private",
      ownerEmail: OWNER,
    });
    expect(body).toContain("Servings: 2-3 servings");
    expect(body).toContain("Tags: quick, family favorite");
    expect(body).toContain("**Beef Marinade**");
    expect(body).toContain("**Stir Fry**");
    expect(body).toContain("### Source details to confirm");
    expect(body).toContain("[Recipe source](https://example.test/stir-fry)");
    expect(body).toContain("Retain this author's extra note.");
    expect(result.readback.propertyValues[tagPropertyId]).toBe(
      JSON.stringify(args.tags),
    );
    expect(result.readback.propertyValues[cuisinePropertyId]).toBe(
      args.cuisine,
    );
    expect(result.readback.propertyValues[servingsPropertyId]).toBe(
      args.servings,
    );
    expect(result.urlPath).toContain(encodeURIComponent(result.documentId));

    const search = await asUser(OWNER, () =>
      searchDocuments.run({
        query: "family favorite",
        spaceId: recipesSpaceId,
        limit: 20,
        offset: 0,
      }),
    );
    expect(search.documents.map((document) => document.id)).toContain(
      result.documentId,
    );
  });

  it("replays the same intent and rejects a changed recipe under the same key", async () => {
    const args = await input();
    const first = await asUser(OWNER, () => createRecipe.run(args as any));
    const replay = await asUser(OWNER, () => createRecipe.run(args as any));

    expect(replay.itemId).toBe(first.itemId);
    expect(replay.documentId).toBe(first.documentId);
    expect(replay.receiptId).toBe(first.receiptId);
    expect(replay.idempotency.result).toBe("replayed");

    await expect(
      asUser(OWNER, () =>
        createRecipe.run({
          ...args,
          ingredientGroups: [{ name: "Changed", entries: ["2 cups flour"] }],
        } as any),
      ),
    ).rejects.toMatchObject({ errorCode: "IDEMPOTENCY_KEY_REUSED" });

    const rows = await getDb()
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, recipesDatabaseId));
    expect(rows).toHaveLength(1);
  });

  it("replays an already-created intent before validating a changed property schema", async () => {
    const args = await input();
    const first = await asUser(OWNER, () => createRecipe.run(args as any));
    await getDb()
      .update(schema.documents)
      .set({ content: "An editor's later body change." })
      .where(eq(schema.documents.id, first.documentId));
    await getDb()
      .update(schema.documentPropertyDefinitions)
      .set({ name: "Recipe labels" })
      .where(eq(schema.documentPropertyDefinitions.id, tagPropertyId));

    const replay = await asUser(OWNER, () => createRecipe.run(args as any));
    expect(replay.receiptId).toBe(first.receiptId);
    expect(replay.idempotency.result).toBe("replayed");
    expect(replay.readback.bodyHash).toBe(first.readback.bodyHash);
    const [currentDocument] = await getDb()
      .select({ content: schema.documents.content })
      .from(schema.documents)
      .where(eq(schema.documents.id, first.documentId));
    expect(currentDocument.content).toBe("An editor's later body change.");
    expect(replay.readback.bodyHash).not.toBe(
      `sha256:${createHash("sha256").update(currentDocument.content).digest("hex")}`,
    );

    const rows = await getDb()
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, recipesDatabaseId));
    expect(rows).toHaveLength(1);
  });

  it("rejects a stale schema revision for a new recipe", async () => {
    const args = await input();
    await getDb()
      .update(schema.documentPropertyDefinitions)
      .set({ name: "Recipe labels" })
      .where(eq(schema.documentPropertyDefinitions.id, tagPropertyId));

    await expect(
      asUser(OWNER, () => createRecipe.run(args as any)),
    ).rejects.toMatchObject({ errorCode: "SCHEMA_REVISION_CONFLICT" });
    const rows = await getDb()
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, recipesDatabaseId));
    expect(rows).toHaveLength(0);
  });

  it("requires Tags to be one unambiguous Text property", async () => {
    await getDb()
      .update(schema.documentPropertyDefinitions)
      .set({ type: "multi_select" })
      .where(eq(schema.documentPropertyDefinitions.id, tagPropertyId));
    const args = await input();
    await expect(
      asUser(OWNER, () => createRecipe.run(args as any)),
    ).rejects.toMatchObject({ errorCode: "recipe_collection_schema_mismatch" });
    const rows = await getDb()
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, recipesDatabaseId));
    expect(rows).toHaveLength(0);
  });

  it("requires the exact Recipes space and an editor role on the collection", async () => {
    const args = await input();
    await expect(
      asUser(OTHER, () => createRecipe.run(args as any)),
    ).rejects.toMatchObject({ statusCode: 403 });

    const now = new Date().toISOString();
    const otherSpaceId = `not_recipes_${Date.now()}`;
    const otherDocumentId = `not_recipes_document_${Date.now()}`;
    const otherDatabaseId = `not_recipes_database_${Date.now()}`;
    await getDb()
      .insert(schema.contentSpaces)
      .values({
        id: otherSpaceId,
        name: "Kitchen notes",
        kind: "personal",
        ownerEmail: OWNER,
        filesDatabaseId: `not_recipes_files_${Date.now()}`,
        createdBy: OWNER,
        createdAt: now,
        updatedAt: now,
      });
    await getDb().insert(schema.documents).values({
      id: otherDocumentId,
      spaceId: otherSpaceId,
      ownerEmail: OWNER,
      title: "Other collection",
      content: "",
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(schema.contentDatabases).values({
      id: otherDatabaseId,
      spaceId: otherSpaceId,
      ownerEmail: OWNER,
      documentId: otherDocumentId,
      title: "Other collection",
      createdAt: now,
      updatedAt: now,
    });
    await getDb()
      .insert(schema.documentPropertyDefinitions)
      .values({
        id: `other_tags_${Date.now()}`,
        ownerEmail: OWNER,
        databaseId: otherDatabaseId,
        name: "Tags",
        type: "text",
        createdAt: now,
        updatedAt: now,
      });
    const { loadContext } = await import("./_database-row-mutation.js");
    const target = {
      spaceId: otherSpaceId,
      databaseId: otherDatabaseId,
      databaseDocumentId: otherDocumentId,
    };
    const otherContext = await asUser(OWNER, () =>
      loadContext(target, "editor"),
    );
    await expect(
      asUser(OWNER, () =>
        createRecipe.run({
          ...args,
          target,
          expectedSchemaRevision: otherContext.schemaRevision,
        } as any),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_space_required" });
  });

  it("rejects malformed URLs and empty tags before creating a row", async () => {
    const args = await input({
      idempotencyKey: `invalid-${Date.now()}`,
      sourceLinks: [{ url: "not a valid URL" }],
      tags: [" "],
    });
    await expect(
      asUser(OWNER, () => createRecipe.run(args as any)),
    ).rejects.toThrow();
    const rows = await getDb()
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, recipesDatabaseId));
    expect(rows).toHaveLength(0);
  });

  it("rolls back the row, body, properties, and receipt if receipt insertion fails", async () => {
    const args = await input({ idempotencyKey: `rollback-${Date.now()}` });
    await getDb().execute(
      sql.raw(`
      CREATE OR REPLACE FUNCTION fail_recipe_receipt_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW.operation = 'create_recipe' THEN
          RAISE EXCEPTION 'injected recipe receipt failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `),
    );
    await getDb().execute(
      sql.raw(`
      CREATE TRIGGER fail_recipe_receipt_insert
      BEFORE INSERT ON content_database_row_mutation_receipts
      FOR EACH ROW EXECUTE FUNCTION fail_recipe_receipt_insert();
    `),
    );

    await expect(
      asUser(OWNER, () => createRecipe.run(args as any)),
    ).rejects.toThrow("injected recipe receipt failure");

    const items = await getDb()
      .select({ id: schema.contentDatabaseItems.id })
      .from(schema.contentDatabaseItems)
      .where(eq(schema.contentDatabaseItems.databaseId, recipesDatabaseId));
    const childDocuments = await getDb()
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(eq(schema.documents.parentId, recipesDocumentId));
    const receipts = await getDb()
      .select({ id: schema.contentDatabaseRowMutationReceipts.id })
      .from(schema.contentDatabaseRowMutationReceipts)
      .where(
        eq(
          schema.contentDatabaseRowMutationReceipts.idempotencyKey,
          args.idempotencyKey,
        ),
      );
    expect(items).toHaveLength(0);
    expect(childDocuments).toHaveLength(0);
    expect(receipts).toHaveLength(0);
    await getDb().execute(
      sql.raw(
        "DROP TRIGGER fail_recipe_receipt_insert ON content_database_row_mutation_receipts",
      ),
    );
    await getDb().execute(
      sql.raw("DROP FUNCTION fail_recipe_receipt_insert()"),
    );
  });
});
