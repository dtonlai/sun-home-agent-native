# Content persistence and Recipes read contract

This note audits the merged standalone Content app for the Phase 2/3 Recipes
integration. Evidence was checked against installed `@agent-native/core`
0.226.0 docs/source and the repository's current schema, plugins, scripts, and
action definitions. No database was opened or changed.

## Persistence and schema

Content documents are canonical SQL records, not repository Markdown files.
The `documents` table in `server/db/schema.ts` has a text primary-key `id`,
Markdown `content`, `title`, `description`, and the ownership/sharing columns
from Core's `ownableColumns()`. The Content developer guide says the SQL row is
the canonical Markdown representation; the editor's Tiptap model is in-memory.
The schema has no Recipes-specific document table. A recipe should remain a
normal Content page and Recipes should keep a reference to its Content document
ID, not a second copy of the recipe body.

The local default is Core's in-process PGlite PostgreSQL database at
`pglite:./data/pglite`, which resolves to the app-root `data/pglite` directory.
This applies when no usable `DATABASE_URL` or supported app/provider database
URL is configured. PGlite is local development storage; deployed/shared use
needs persistent hosted PostgreSQL. The package includes `@electric-sql/pglite`
and `.gitignore` excludes `**/data/`.

App wiring:

- `server/db/schema.ts` defines the PostgreSQL Drizzle tables, including
  `documents` and `content_spaces`.
- `server/db/index.ts` calls `createGetDb(schema)` and registers documents as
  shareable/searchable Content resources.
- `server/plugins/db.ts` owns the app's handwritten Content migrations:
  `content_migrations` (through version 134) and the separate
  `content_source_migrations` ledger (through version 5). Its default Nitro
  plugin awaits both lists during local app startup.
- `drizzle.config.ts` delegates to Core's `createDrizzleConfig()` for the
  repository's Drizzle schema/migration tooling configuration.

## Migration commands and hosted PostgreSQL

- **Local startup:** `pnpm dev` runs `agent-native dev --inspect`; the Content
  Nitro plugin applies pending Content/source migrations on startup using the
  same configured database. Core's default database URL is PGlite when no
  hosted URL is set. No migration or server command was run for this audit.
- **Release/production:** `pnpm migrate:production` is the explicit script in
  `package.json`. `scripts/migrate-production.ts` loads the release environment
  and runs Core framework release migrations, Creative Context migrations,
  Content migrations, and Content source migrations, then closes the DB
  executor. Production migration execution remains a deliberate reviewed
  release step requiring the applicable product-owner approval; it is not a
  build step.
- `pnpm dev:database` is a local environment helper that updates `.env.local`
  and starts dev; it is not a separate schema migration command. Although
  `drizzle.config.ts` and `drizzle-kit` are present, this package has no
  `db:generate`/`db:push` scripts or `server/db/migrations.ts` wiring. The
  current Content migration owner is `server/plugins/db.ts`; Core's installed
  Database guide's generated-migration workflow is not wired into this app.
  Never use `drizzle-kit push` against production.

For Supabase, Core's installed `docs/content/supabase.mdx` says to copy a
PostgreSQL URL from Supabase Connect and supply it to the server environment.
Use Supabase's transaction pooler for short-lived serverless runtime requests;
it does not support prepared statements. Use a direct or session connection
for release migrations. If runtime and migration traffic use different
connection modes, supply the appropriate URL to each environment. Required
prerequisites are a provisioned PostgreSQL database, server-side connection
credentials, and the approved release migration step; no Supabase account,
database, URL, or credentials are configured or verified by this audit. Keep
credentials out of source and client configuration.

## Recipes read contract

The smallest supported contract is:

1. Discover/select ordinary Content pages through the registered read-only
   `list-documents` action (`actions/list-documents.ts`). Its schema is
   `limit` (integer 1–200, default 50), `offset` (integer ≥0, default 0),
   optional case-sensitive `exactTitle`, nullable `parentId` (`null` means
   roots), optional `spaceId`, and `documentType: "page" | "database"`.
   Recipes should pass `documentType: "page"`. Each result includes the stable
   `id` and display metadata; its `contentPreview` is truncated, not the
   canonical body. The response is
   `{ documents, pagination: { offset, limit, totalItems, returnedItems,
   hasMore, nextOffset } }`; continue with `nextOffset` until `hasMore` is
   false.
2. Retain the returned Content `id` as the selected recipe reference and fetch
   full content through `get-document` (`actions/get-document.ts`) with
   `{ id }`. The action resolves access by ID and returns the same stable `id`,
   `title`, `description`, and full Markdown `content`. Its schema marks `id`
   optional, but the implementation rejects a missing ID; Recipes must always
   pass it. Its other optional arguments are `databaseId`,
   `databaseDocumentId`, and `includePreviewDraft`. Omit the preview-draft flag
   so Recipes reads the saved canonical document, and omit database-context
   arguments for an ordinary recipe page.

Both actions are read-only, access-scoped Content operations. Listing excludes
trashed pages and limits results to documents visible in the caller's current
user/org/share context; `get-document` returns not-found for missing,
trashed, or inaccessible IDs. Recipes must use these registered actions in the
same authenticated app context, not query `documents` directly. Re-fetch the
same ID to reflect edits made in Content; do not key the record by title or
copy the body into a Recipes table.

Content currently has no recipe-specific document type or list filter. The
available `documentType` only distinguishes ordinary pages from collection
pages. A recipe-specific space, title convention, or other discovery policy
needs product/lead agreement before the Recipes UI claims to list only recipes;
the stable-ID retrieval contract does not depend on that choice.

## Evidence checked

- Installed framework: `node_modules/@agent-native/core/package.json`
  (`0.226.0`); bundled docs:
  `node_modules/@agent-native/core/docs/content/server-database.mdx`,
  `node_modules/@agent-native/core/docs/content/supabase.mdx`, and
  `node_modules/@agent-native/core/docs/content/template-content-developers.mdx`.
- Runtime/schema/migration source: `node_modules/@agent-native/core/dist/db/
  client.js`, `server/db/schema.ts`, `server/db/index.ts`,
  `server/plugins/db.ts`, `scripts/migrate-production.ts`,
  `drizzle.config.ts`, `package.json`, and `.gitignore`.
- Read API source: `actions/list-documents.ts`,
  `actions/_document-discovery-query.ts`, and `actions/get-document.ts`.
- Discovery commands were `pnpm action framework-search --pattern "PGlite"
  --scope docs`, `--pattern "runMigrations" --scope docs`, and
  `--pattern "list-documents" --scope source`; focused source reads then
  verified the exact code paths and schemas above.
