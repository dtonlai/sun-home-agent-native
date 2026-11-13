# Content backed recipe creation contract

**Status:** Revised draft for technical review. No implementation or live Content changes are included.

**Evidence version:** `@agent-native/core` 0.226.0, pinned by `package.json` and `pnpm-lock.yaml`. Evidence below was read from the installed package docs/source and this repository's registered Content actions. No database was opened or modified.

## Recommendation

Keep the requested Recipes collection/table in scope. In the existing authorized `Recipes` Content space, create new recipes as rows in one ordinary Content collection. Each row is itself a Content page: `documents.content` remains the canonical complete Content NFM recipe, while collection properties provide structured metadata and tag filtering. Existing ordinary recipe pages remain readable and searchable as a fallback; do not move, rewrite, migrate, or require them to be collection rows.

The existing public actions do not provide one idempotent body-plus-property create: `submit-content-database-form` is atomic but has no idempotency receipt, while `add-database-item` has a durable receipt but starts with an empty body. The currently supported retryable fallback is a two-operation saga:

1. Call `add-database-item` with the exact target and current schema revision, property values, and a stable idempotency key. It creates the row and properties transactionally and returns a durable receipt with stable item/document IDs, read-back values, payload digest, and `applied`/`replayed` outcome.
2. Read the returned row with `get-document`. Only when its body is literally empty, call `edit-document` with the returned `baseRevision`, a stable second idempotency key derived from the same creation intent, and `initializeContent` containing the complete serialized Content NFM recipe. `initializeContent` is the supported body initialization operation for an empty page; its receipt is independently replayable. Read the row again and verify both body and properties before reporting completion.

This safely reconciles a lost response or retry without making a duplicate row or overwriting an intervening edit, but it is **not atomic across the two actions**: between operations the row exists with properties and an empty body. On retry, the row-create key must be reused with exactly the same payload. If the body is still empty, initialize it; if it already equals the intended body, treat it as complete; if it is different and nonempty, stop and report a conflict for review. Never replace a changed body to make the create retry pass.

Technical recommendation for Michael: for one shared `create-recipe` action with one atomic receipt, extract the current `submit-content-database-form` transaction into a repository-owned service and add idempotency there. The action already validates the live form, checks editor access, writes the row/body/properties in one transaction, and verifies read-back. After authentication, exact target resolution, and editor authorization, check/replay an existing receipt before current form/property validation; for a new key, validate the live form and property schema. Then write a canonical request digest and receipt in the same transaction as the row using the existing `content_database_row_mutation_receipts` table and its unique `(database_id, idempotency_key)` index. Bind target, stable form view, title, body, and submitted properties in the digest. Store a create-time body hash in the receipt result. A new registered `create-recipe` action can call this service with the recipe-specific schema; the UI and agent both dispatch that one action. Keep `submit-content-database-form` on the same service. This reuses repository-owned code and existing SQL schema; it does not modify Agent Native framework internals or require a migration. It needs focused review for replay ordering, form/schema drift, receipt payload binding, and result compatibility.

Do not use the generic `databaseRowRevision()` as the body integrity check: it hashes row ID, document ID, title, and properties only. `databaseMutationPayloadDigest()` currently hashes only row-create inputs, which do not contain body content. The form-service receipt must bind the full form/recipe intent and record a separate body hash without changing the meaning of later row revisions.

## Proposed create-recipe contract

The exact action schema depends on the write-seam review, but the domain input and output should be:

```ts
type RecipeGroup<T> = { name?: string | null; entries: T[] };

type CreateRecipeInput = {
  target: {
    spaceId: string;
    databaseId: string;
    databaseDocumentId: string;
  };                              // exact target from authorized collection read
  formViewId: string;             // recipe form view in the live collection schema
  expectedSchemaRevision: string; // fresh get-content-database mutationContract
  idempotencyKey: string;         // stable key for one unchanged create intent
  title: string;                  // required, 1–500 characters
  servings?: string | null;       // free text, e.g. "2-3 servings"
  ingredientGroups: RecipeGroup<string>[];
  instructionGroups: RecipeGroup<string>[];
  notes?: Array<{ title: string; nfm: string }>;
  tags: string[];
  cuisine?: string | null;        // free text unless owner selects a taxonomy
  sourceLinks?: Array<{ title?: string; url: string }>;
  additionalNfm?: string;         // preserve unknown/arbitrary Content body content
};

type CreateRecipeResult = {
  itemId: string;
  documentId: string;
  urlPath: string;
  receiptId: string;
  idempotency: { key: string; result: "applied" | "replayed"; payloadDigest: string };
  readback: { verified: true; title: string; propertyValues: Record<string, unknown>; bodyHash: string };
};
```

Validation rejects empty/overlong titles, malformed or non-HTTP(S) source URLs, empty tag labels, invalid empty groups, stale schema revisions, unknown property options, and reuse of an idempotency key with a different target or payload. Group names are free text: ingredient and instruction groups are independent and may differ in name and count. Servings stays text and preserves ranges/units. Notes are repeatable and titled. The body serializer emits Content's NFM accepted by `edit-document.initializeContent`; `notes[].nfm` and `additionalNfm` are already Content NFM and are retained unchanged. The serializer must never flatten or discard groups, notes, links, tags, cuisine, or `additionalNfm`.

## Storage mapping

| Input | Content storage | Behavior |
|---|---|---|
| `title` | `documents.title` and collection row title | One stable Content page title. |
| `servings` | Text property `Servings` and recipe NFM body | Preserve exact free text, including `2-3 servings`; do not parse to a number. |
| `ingredientGroups` | `documents.content` | Ordered Ingredients section; named subsections stay independently named. |
| `instructionGroups` | `documents.content` | Ordered Instructions section; do not align groups to ingredient groups or require matching names. |
| `notes` | `documents.content` | Repeated titled sections in supplied order; preserve each NFM body. |
| `tags` | Multi-select property `Tags` and recipe NFM body | Property supports collection filters/search; an early body `Tags:` line supports global document search. Values must already exist in the property option catalog unless owner approves a controlled option-creation flow. |
| `cuisine` | Text property `Cuisine` and recipe NFM body | Use text to avoid silently imposing a cuisine taxonomy; option-backed select remains an owner choice. |
| `sourceLinks` | `documents.content` | Serialize as Content NFM links with supplied title or URL as link text; preserve all links. |
| `additionalNfm` | `documents.content` | Append unchanged after generated sections, separated by one NFM blank block; do not parse and rebuild it. |
| access and shares | Content row page and collection | Use exact caller-authorized target and normal collection editor/access checks. Never accept caller-provided owner, org, or visibility. |

The page body is canonical for the recipe's complete content. Properties are indexes; they may not replace the body. Collection setup and option-list changes are separate reviewed Content actions, not side effects of recipe creation.

## Collection discovery and library compatibility

- Resolve the exact authorized `Recipes` space at runtime using `list-content-spaces`; do not hardcode IDs. Discover the existing recipe collection by its stable ID through Content collection actions. If none exists, return setup guidance; do not create a space/collection automatically. If multiple eligible collections exist, require selection among those authorized results.
- Read `get-content-database` immediately before a create and pass its exact mutation target and `schemaRevision` to `add-database-item`. The standard row mutation validates access and schema, normalizes properties, commits row and properties in one transaction, and stores an idempotency receipt. Reusing the same key and exact payload replays; a different payload conflicts.
- Existing ordinary pages remain in their current space and keep their stable IDs. `list-documents(documentType: "page", spaceId)` excludes collection root pages but current source does not exclude active collection-row documents. Therefore list and `get-document` can be the common fallback read path for both, but add a mixed legacy-page/row regression before shipping.
- The current Recipes library lists documents and gets the selected page body; it does not yet query collection properties. The next iteration must read collection rows/properties for structured tags and cuisine while retaining ordinary pages. Do not claim parity from the existing page list alone.

## Search: verified behavior

The prior draft's broad claim that recipe body/tag text is indexed needs this distinction:

- **Recipe body and tags written in the body:** `server/db/index.ts` registers Content's document search resource and projects each document's `title`, `description`, and `content` into the Core index as title, summary, and body. `actions/search-documents.ts` uses that index when ready and has a SQL fallback against those same document columns. Its action description states that title/description match anywhere and body terms match from word starts. Thus body text, including an early visible `Tags: ...` line, is searchable by `search-documents` for ordinary pages and collection row pages, subject to access and `hideFromSearch`. This is not an unlimited-body guarantee: Core 0.226.0 `buildSearchVector()` applies Postgres position and vector-size budgets and may collapse positions or omit excess distinct words. Keeping tags near the start of the body and in the collection property avoids relying on a late-body tag for structured search.
- **Tag values stored only as collection properties:** they are not part of `documentSearchIndex` and are not searched by `search-documents`. Collection `tableQuery.search` does search row title and property values: `shared/database-query.ts` `itemSearchText()` concatenates the row title with each property value, and `applyContentDatabaseTableQuery()` applies that text match. It does not include the recipe body. For the requested searchable tags, store tags both as the `Tags` multi-select property (structured filtering/table search) and in the recipe body (global search), then verify through both actions.
- **Legacy recipes:** body tags/cuisine are found by `search-documents`; existing plain pages have no collection property values, so they cannot satisfy structured `Tags` filters without parsing or backfill. No backfill is proposed. Search must make this distinction visible rather than silently dropping legacy recipes.
- **Unknown tags:** the current form action rejects unknown select/status/multi-select options. Use a preconfigured option set or an owner-approved option-management flow. Do not append an option and then submit a row as if that multi-action sequence were atomic.

## Action composition and partial-failure alternatives

Agent Native Core 0.226.0's `docs/content/actions-overview.mdx` says actions are the shared UI/agent operation, but its documented `callAction()` is a client surface. `docs/content/actions-defining.mdx` says direct `action.run()` gets schema validation only, not normal dispatch wrappers. Do not implement a server wrapper that imports and calls `add-database-item.run()` or `edit-document.run()`, and do not make an undocumented self-HTTP request.

| Route | Guarantees | Limits and recovery |
|---|---|---|
| Existing `submit-content-database-form` plus idempotent service extraction | Smallest atomic seam: preserve its live form validation/access/transaction/read-back; add key/digest replay and write a body-hash receipt in the same transaction using the existing `content_database_row_mutation_receipts` table. A dedicated `create-recipe` action and the existing form action can call the shared service. | Requires recipe form/property configuration and careful replay-before-current-schema-validation behavior. Result must bind exact target, intent, current form selection, and body hash; reuse of a key for a changed payload must conflict. No migration is expected from the existing table, but confirm against installed schema before implementation. |
| `add-database-item` then `edit-document` | Both are registered actions with separate idempotent receipts. `add-database-item` binds target/schema/payload and stable item/document IDs; `edit-document` uses `get-document`'s base revision plus stable key and only initializes an empty body. It can reconcile after a handoff/retry without duplicating a row or overwriting a changed body. | Two commits can leave a visible incomplete row. `edit-document` has `http: false`; Core 0.226.0 says only the agent and CLI can call it. This is not a shared browser UI path or a single `create-recipe` operation. |
| Extend the app-owned row-create service with body content | Alternate single-transaction seam: extend `createDatabaseRow()`/`createInsideTransaction()` to create the row, properties, and initial body under its existing idempotency receipt, and include a body hash in the receipt read-back. No framework internals need modification. | Broader generic row-mutation change than extracting the existing form transaction. `databaseRowRevision()` currently excludes body; do not silently redefine it. Review body revision/history/collaboration invariants and compatibility with existing `add-database-item` callers. |

The two-action route is a supported recovery fallback for callers able to use the agent action surface. It is not the final UI/agent parity path: `edit-document` declares `http: false`, so Core 0.226.0 docs say only the agent and CLI can call it; browser `useActionMutation`/`callAction` cannot dispatch it over HTTP. The single registered `create-recipe` action backed by the extracted idempotent form service is the recommended UI/agent path. Do not label the current form action idempotent or the two-operation saga atomic.

## Authorization and failure rules

- Creation requires an authenticated caller with editor/create permission on the exact Recipes collection. The agent and UI use the same registered action schema and receive the same access failures.
- Do not bypass Content actions/access checks with direct SQL in the UI, agent, or a new parallel recipe store. Any app-owned mutation service must reuse the checked row-target, schema-revision, share inheritance, attribution, and receipt behavior already in the row mutation code.
- A failed single-transaction mutation creates no row. A successful receipt is verified before reporting success. A two-action saga may leave a row with properties and an empty body; retry it with the same keys, and do not report a complete recipe until body and properties are read back.
- If an intervening edit makes the row body nonempty/different before initialization, preserve it and return a conflict for review. Never auto-overwrite the source or delete the partial row as cleanup.
- Private-by-default remains intact. Two household users sharing no Content space do not gain access from recipe membership alone; existing Content sharing and authorized-space rules decide access.

## Risks and limits

1. `submit-content-database-form` has good transaction boundaries but lacks retry receipts. Extracting its transaction and reusing the existing receipt table is the recommended smallest atomic seam; replay must happen after authorization but before current form/property validation so an already committed intent survives later schema changes.
2. Composing the two public actions is recoverable for agent/CLI callers but not one transaction and can expose incomplete rows. Because `edit-document` has `http: false`, it cannot by itself provide browser UI and agent parity.
3. Extending the local generic row receipt to include body state must avoid claiming that later user edits invalidate the original create receipt; store the create-time body hash and leave current-body verification to read-back. The existing `databaseRowRevision()` deliberately omits body content, so the revision contract must be reviewed before changing it.
4. Collection `tableQuery.search` searches property values and title, not body; global `search-documents` searches indexed body and not property values, with Core search-vector size/position limits. Recipe search needs both semantics.
5. Tags multi-select depends on a product-owned vocabulary. Arbitrary tag onboarding is not currently atomic with row creation.
6. Existing-page migration/backfill, production schema changes, collection provisioning, and option-list changes remain out of scope without separate review/owner approval.

## Implementation verification plan

1. Row action: same exact idempotency key/payload replays the same item/document IDs and receipt; same key with a changed target/property/body conflicts.
2. Single-transaction path: replay a stored receipt before revalidating a changed live form; same key and same input returns the same row, same key and changed target/body/properties conflicts. Inject a transaction failure and prove no row, body, properties, or receipt persist; successful response includes verified property values and the create-time body hash.
3. If shipping the two-action fallback: simulate loss after row creation and after body initialization; retry both keys and prove no duplicate, then read row/body/property values. Simulate a third-party body edit between steps and prove initialization fails without overwriting it.
4. Search evidence: find tags written only in body using `search-documents`; find property tags via `query-content-database-items` table search; prove `search-documents` alone does not promise property-only matches and table search does not include body text.
5. Library compatibility: paginate the exact Recipes space with one existing ordinary page and one collection row, then open both by stable ID and read their full bodies. Verify property metadata is loaded for the row and is absent-but-not-failing for the ordinary page.
6. Privacy/parity: unauthorized collection/space and inaccessible IDs fail closed; UI and agent use same action and return identical IDs/receipt/error behavior.

## Follow-on task boundaries

| Task | Owner | Depends on |
|---|---|---|
| Review the recommended single-transaction seam vs supported two-action recovery route | Michael | This contract revision |
| Extract the form transaction into an app-owned service, add durable idempotent receipts/body hash, and define the `create-recipe` action | Dwight | Michael's technical approval; collection target/property contract |
| Add Recipes collection row/property reads and searchable tag UI while retaining ordinary page fallback | Dwight + Jim | Stable collection identity and approved tag semantics |
| Build creation UI using the same action schema and Content collection setup guidance | Jim | Shared action contract |
| Add DB/action/UI tests for idempotency, failure recovery, search paths, access, and legacy-page compatibility | Dwight + Jim | Implementation contracts |

## Product choices still open

1. **Tag vocabulary:** Should `Tags` be a fixed controlled multi-select list, or should users be allowed to add arbitrary tags? Recommendation: begin with a short owner-approved vocabulary; adding options during recipe creation needs its own idempotent design.
2. **Cuisine:** Use a free-text property by default; confirm whether the owner wants a controlled cuisine list.
3. **Collection selection/setup:** Confirm the intended existing collection if more than one authorized collection is present, and who performs one-time collection/property setup. No automatic provisioning or migration is proposed.

## Source evidence index

Installed Core 0.226.0 docs/source: `docs/content/actions-overview.mdx` (shared action surface), `docs/content/client-data.mdx` (UI action calls), `docs/content/actions-access-control.mdx` (dispatch authorization), `docs/content/actions-defining.mdx` (direct `run()` behavior), `docs/content/template-chat-developers.mdx` (the `http: false` endpoint exclusion), `docs/content/template-content-databases.mdx` (document-backed rows/forms), and `dist/search/tokenize.js` `buildSearchVector()` (Postgres position and vector-size limits).

Repository source evidence and exact implementation points (line numbers refer to this revision):

- `actions/add-database-item.ts:74` calls `createDatabaseRow()`; `shared/api.ts` `ContentDatabaseRowMutationReceipt` defines target, schema revision, stable row IDs, digest, outcome, and property read-back.
- `actions/_database-row-mutation.ts:1013-1027` computes the row-create digest without body content; `:1081-1122` builds receipt read-back; `:1142-1193` replays only matching digests; `:1195-1224` inserts the receipt; `:1245-1253` defines create inputs; `:1543-1610` checks replay before schema validation and creates the row plus receipt in a transaction. `createInsideTransaction()` writes an empty document body at `:1281-1297`; `databaseRowRevision()` at `:254-268` hashes row/document IDs, title, and property values only.
- `actions/submit-content-database-form.ts:42-85` declares form input without an idempotency key; `:420-430` registers an authenticated agent-visible action; `:471-480` checks editor access; `:586-606` begins a transaction and rejects form drift; `:686-710` creates body/title and row; `:825-855` verifies persisted body/properties and returns stable IDs/link. Its live form and options are processed at `:490-579`, before the transaction.
- `server/db/schema.ts:902-940` defines `contentDatabaseRowMutationReceipts` with target, key, payload digest, schema revision, row IDs, and `resultJson`, plus unique `(databaseId, idempotencyKey)` index; no new table is required for a form-service receipt if the stored result remains compatible.
- `actions/edit-document.ts:129-139,298-304` defines `initializeContent`, requires `baseRevision` and a caller key in its description, and sets `http: false`. `actions/_document-edit-mutation.ts:230-405` implements replay and empty-body initialization behavior.
- `server/db/index.ts:69-92` `documentSearchIndex.load()` projects document title/description/content as title/summary/body. `actions/search-documents.ts:159-171` SQL fallback matches title/description/content (or title-only when requested); `:217-234` selects the registered index when ready and falls back to direct SQL when unavailable.
- `shared/database-query.ts:707-723,1155-1169` shows `itemSearchText()` concatenating row title and property values and `applyContentDatabaseTableQuery()` using that for `tableQuery.search`; it does not add row body text.
- `actions/_document-discovery-query.ts` `documentDiscoveryWhere()` filters `documentType: "page"` by excluding active collection root documents, not collection membership rows.
