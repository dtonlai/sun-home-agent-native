# Content persistence and Recipes read contract

This note audits the merged standalone Content app for the Phase 2/3 Recipes
integration. The persistence/migration review was checked against installed
`@agent-native/core` 0.226.0 docs/source and the repository's schema, plugins,
scripts, and action definitions. A later isolated local PGlite CRUD/restart
verification is recorded below; it did not use the product owner's database.

## Persistence and schema

Content documents are canonical SQL records, not repository Markdown files.
The `documents` table in `server/db/schema.ts` has a text primary-key `id`,
Markdown `content`, `title`, `description`, and the ownership/sharing columns
from Core's `ownableColumns()`. The Content developer guide says the SQL row is
the canonical Markdown representation; the editor's Tiptap model is in-memory.
The schema has no Recipes-specific document table. A recipe should remain a
normal Content page and Recipes should keep a reference to its Content document
ID, not a second copy of the recipe body.

Core 0.226.0's database client normally falls back to in-process PGlite at
`pglite:./data/pglite` when no usable URL is configured. B1-T01 deliberately
disables that fallback at this app's local startup boundary: manual local runs
must provide `DATABASE_URL` with a PostgreSQL URL for the shared database.
`SUN_HOME_AGENT_NATIVE_DATABASE_URL`, which Core prioritizes over
`DATABASE_URL`, must be unset or match it. `@electric-sql/pglite` remains a
dependency for isolated tests; it is not a local app state store for this
workflow.

App wiring:

- `server/db/schema.ts` defines the PostgreSQL Drizzle tables, including
  `documents` and `content_spaces`.
- `server/db/index.ts` calls `createGetDb(schema)` and registers documents as
  shareable/searchable Content resources.
- `server/plugins/db.ts` owns the app's handwritten Content migrations:
  `content_migrations` (through version 135) and the separate
  `content_source_migrations` ledger (through version 5). The default Nitro
  plugin validates the local PostgreSQL URL and intentionally performs no
  migration or startup maintenance.
- `server/lib/startup-maintenance.ts` still contains additive-column checks and
  legacy data repairs, but the local startup plugin no longer schedules them.
  Any needed legacy repair must get a separately reviewed explicit procedure;
  none is run by B1-T01.
- `drizzle.config.ts` delegates to Core's `createDrizzleConfig()` for the
  repository's Drizzle schema/migration tooling configuration.

## Migration commands and hosted PostgreSQL

- **Local startup:** `pnpm dev` runs `agent-native dev --inspect`. Local startup
  now fails clearly if `DATABASE_URL` is missing, invalid, or non-PostgreSQL.
  It does not apply Content/source migrations, additive-column ensures, or
  startup data repairs. This prevents an app restart from changing an
  unreviewed shared schema.
- **Release/production:** `pnpm migrate:production` is the explicit script in
  `package.json`. `scripts/migrate-production.ts` loads the release environment
  and runs Core framework release migrations, Creative Context migrations,
  Content migrations, and Content source migrations, then closes the DB
  executor. It runs inside Core 0.226.0's `withMigrationRuntime()` and validates
  that both the configured runtime `DATABASE_URL` and Core's selected migration
  URL are PostgreSQL before connecting. `pnpm migrate:shared` is the local
  shared-database alias for the same reviewable operation. The migration URL
  comes from `DATABASE_URL_UNPOOLED` (or its app-prefixed counterpart) when
  configured, so use a direct or session connection for migrations if the
  runtime URL is Supabase's transaction pooler. Migration execution remains a
  deliberate reviewed step; it is not a build or startup side effect.
- `pnpm dev:database` is a local environment helper that updates `.env.local`
  and starts dev; it is not a separate schema migration command. Although
  `drizzle.config.ts` and `drizzle-kit` are present, this package has no
  `db:generate`/`db:push` scripts or `server/db/migrations.ts` wiring. The
  current Content migration owner is `server/plugins/db.ts`; Core's installed
  Database guide's generated-migration workflow is not wired into this app.
  Never use `drizzle-kit push` against production.

For Supabase, Core's installed `docs/content/supabase.mdx` says to copy a
PostgreSQL URL from Supabase Connect. Use its transaction pooler for app
runtime traffic, and supply a direct or session connection as
`DATABASE_URL_UNPOOLED` for explicit migrations. Transaction pooling does not
support prepared statements. The local owner workflow, Better Auth variables,
login steps, and recovery guidance are in `docs/local-development.md`. No
Supabase account, database, URL, credentials, or migration was contacted or
used by B1-T01; all validation must use isolated disposable test databases.

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
pages. For Recipes v1, the lead-approved discovery convention is a dedicated
Content space whose name is exactly `Recipes` (case-sensitive). Resolve the
current caller's authorized spaces with `list-content-spaces` at runtime and
use the matching space ID returned for that installation; never hardcode an
ID. If the caller has no exact match, show setup guidance without provisioning
the space or moving documents. If multiple authorized spaces have that exact
name, let the caller choose between those returned spaces. This is a discovery
convention only: all documents remain ordinary Content pages and the stable-ID
retrieval contract is unchanged.

## Local CRUD and restart verification

Verified 2026-11-10 with the registered Content actions and the Core action
CLI. Runtime was Node `v24.22.2`, pnpm `10.14.0`, and
`@agent-native/core` `0.226.0`. The only database setting was the task-isolated
local URL `pglite:/tmp/p2c-t02-content-crud-20261110`; no non-local database
URL was configured. The CLI used Core's documented local developer identity
setting `AGENT_USER_EMAIL=dwight-p2c-t02@localhost` (not a credential). No
browser automation was used.

Successful commands run, with the same `DATABASE_URL` and `AGENT_USER_EMAIL`
on every action invocation (the first create attempt omitted
`AGENT_USER_EMAIL` and correctly failed `Not authenticated` before creating a
document):

```sh
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 pnpm dev
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 \
  AGENT_USER_EMAIL=dwight-p2c-t02@localhost \
  pnpm action create-document '{"title":"P2C-T02 Local Persistence Sample Recipe","content":"## Ingredients\n- 1 cup flour\n- 1 cup milk\n\n## Method\nWhisk the flour and milk until smooth.","contextModeOverride":"off"}'
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 \
  AGENT_USER_EMAIL=dwight-p2c-t02@localhost \
  pnpm action get-document '{"id":"9iPVcgcPHu97"}'
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 \
  AGENT_USER_EMAIL=dwight-p2c-t02@localhost \
  pnpm action edit-document '{"id":"9iPVcgcPHu97","baseRevision":"body:0:sha256:03243f5146bed19de6cf5c4cba89a1d68565d1e3628a124ea22d1dbc60b93c07","idempotencyKey":"p2c-t02-recipe-edit-20261110-1","find":"Whisk the flour and milk until smooth.","replace":"Whisk the flour and milk until smooth; rest for 5 minutes before cooking.","contextModeOverride":"off"}'
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 \
  AGENT_USER_EMAIL=dwight-p2c-t02@localhost \
  pnpm action get-document '{"id":"9iPVcgcPHu97"}'
# Stop pnpm dev with Ctrl-C, then start the same command again.
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 pnpm dev
DATABASE_URL=pglite:/tmp/p2c-t02-content-crud-20261110 \
  AGENT_USER_EMAIL=dwight-p2c-t02@localhost \
  pnpm action get-document '{"id":"9iPVcgcPHu97"}'
```

`pnpm dev` served `GET /` with HTTP 200 both before and after restart. Create
returned Content ID `9iPVcgcPHu97`; the initial get returned the same ID and
the saved ingredient/method body at revision 0. `edit-document` applied one
revision-guarded edit and reported `readback.verified: true`, moving the body
revision from 0 to 1. The following get returned the same ID, revision 1, and
the edited method. After stopping the server and restarting against the same
PGlite directory, get again returned ID `9iPVcgcPHu97`, revision 1, and the
edited method. The sample exists only in that isolated sandbox database; the
directory was retained. This validates local action persistence across an app
restart, not the product owner's database, hosted PostgreSQL, multi-user
sharing, or browser behavior.

During both starts Nitro reported its existing watcher-limit `ENOSPC` fallback
to polling for filesystem watches. The server still served HTTP 200 and all
Content actions completed; no watcher or OS settings were changed.

## Evidence checked

- Installed framework: `node_modules/@agent-native/core/package.json`
  (`0.226.0`); bundled docs:
  `node_modules/@agent-native/core/docs/content/server-database.mdx`,
  `node_modules/@agent-native/core/docs/content/supabase.mdx`, and
  `node_modules/@agent-native/core/docs/content/template-content-developers.mdx`.
- Runtime/schema/migration source: `node_modules/@agent-native/core/dist/db/
-  client.js`, `migration-runtime.js`, `migrations.js`,
  `migration-policy.js`, `server/release-migrations.js`, the bundled
  `docs/content/server-database.mdx` and `docs/content/supabase.mdx`,
  `server/db/schema.ts`, `server/db/index.ts`, `server/plugins/db.ts`,
  `scripts/migrate-production.ts`, `drizzle.config.ts`, `package.json`, and
  `.gitignore`.
- Read API source: `actions/list-documents.ts`,
  `actions/_document-discovery-query.ts`, and `actions/get-document.ts`.
- Discovery commands were `pnpm action framework-search --pattern "PGlite"
  --scope docs`, `--pattern "runMigrations" --scope docs`, and
  `--pattern "list-documents" --scope source`; focused source reads then
  verified the exact code paths and schemas above.

For B1-T01, the same Core 0.226.0 package source confirms that
`getRuntimeDatabaseUrl()` checks an app-prefixed URL, then `DATABASE_URL`, then
`NETLIFY_DATABASE_URL`, and accepts a caller-supplied fallback. The generated
Content app passes `pglite:./data/pglite` as that fallback. Core's
`getMigrationDatabaseUrl()` prefers the configured unpooled URL before the
runtime URL, and `withMigrationRuntime()` is the supported migration
authorization wrapper. `runMigrations()` only defers startup migrations for a
hosted serverless request when release migrations are configured; a manual
local Node dev run would apply pending entries from the app plugin. The app
now checks its explicit PostgreSQL `DATABASE_URL` before local startup and
does not invoke migrations or startup maintenance there. The explicit
`migrate:shared`/`migrate:production` script preflights both URLs and retains
the framework release migration sequence.
