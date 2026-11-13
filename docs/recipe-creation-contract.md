# Content backed recipe creation contract

**Status:** Draft for Michael and product owner review. No implementation or live Content changes are included.

**Evidence version:** `@agent-native/core` 0.226.0, pinned by `package.json` and `pnpm-lock.yaml`. Evidence was read from the installed package docs/source in `node_modules/.pnpm/@agent-native+core@0.226.0_.../node_modules/@agent-native/core`, the repository's registered Content actions, and the existing Recipes library. No database was opened or modified for this contract.

### Version-matched references

| Reference | Evidence used |
|---|---|
| Core 0.226.0 `docs/content/actions-overview.mdx` | `defineAction()` is one operation exposed to UI hooks and agent tools; callers use action surfaces rather than importing another action's `run()`. |
| Core 0.226.0 `docs/content/client-data.mdx` and `actions-access-control.mdx` | UI uses `useActionMutation`/`callAction`; access policies and authorization run on normal dispatch surfaces. |
| Core 0.226.0 `docs/content/actions-defining.mdx` | Direct `action.run()` receives schema validation only, not the normal dispatch wrappers. |
| Core 0.226.0 `docs/content/template-content-databases.mdx` | Collection rows are full Content pages; forms validate fields and write title/body/properties as a single submission. |
| Repository `actions/create-document.ts` | Supported page creation accepts a caller-supplied ID, exact space target, title/body and preserves replay by request digest; returns `urlPath`. |
| Repository `actions/submit-content-database-form.ts` | Current form action checks editor access, validates live form schema, writes page/membership/properties in one transaction, verifies the saved row, and has no caller idempotency key. |
| Repository `actions/list-documents.ts`, `actions/_document-discovery-query.ts`, `app/components/recipes/RecipesLibrary.tsx` | Current page discovery and Recipes selection/read path; collection root exclusion is not collection-row exclusion. |
| Repository `.agents/skills/document-editing/references/databases.md` | Current Content collection property semantics, form submission, row identities, retries for the row mutation action, and property read/query surfaces. |

## Recommendation

For the first creation contract, create ordinary Content pages in the caller-authorized `Recipes` space and keep the full recipe in the page body. Do not introduce a collection until the supported write path can atomically and idempotently create a page, body, and metadata properties. The currently registered form action writes the row/body/properties atomically but has no idempotency key; a response lost after commit can produce a duplicate on retry. The ordinary `create-document` action already supports a caller-supplied ID and rejects a replay with a different request digest.

Use an explicit open `additionalMarkdown` field for recipe content the structured fields do not model. Keep named groups independent for ingredients and instructions: they may have different names and counts. A free-text serving value such as `2-3 servings` stays text; it must not be coerced to a number. All source links, notes, tags, cuisine, groups, and extra details are serialized into the Content body, so there is no second canonical store and old pages remain readable through the existing recipe path. Search can match the saved body; structured filtering on tags/cuisine is deferred until its schema and write semantics are approved.

If the owner later approves a manually configured ordinary Content collection in the existing authorized `Recipes` space, each row remains a full Content page. Candidate properties are `Servings` (text), `Cuisine` (text), and `Tags` (owner choice; see Open decisions). Do not create the collection, alter its schema, move existing pages, or migrate data automatically.

The current library uses `list-documents` for its list and `get-document` for the selected full body. `list-documents` with `documentType: "page"` excludes collection root pages, but its current query does not exclude active collection row documents; rows are documents too. That compatibility expectation is source-backed but not yet proven end-to-end for this library. Add a regression proving both legacy plain pages and future row pages appear before relying on it.

## Proposed create operation

The product-facing operation should be one registered action named `create-recipe`, called by both the Recipes UI and the in-app agent. It must return the stable Content document identity and link. It must not scale, rewrite, or otherwise mutate any other recipe.

### Input

```ts
type CreateRecipeInput = {
  title: string;                 // required, trimmed, 1–500 characters
  servings?: string | null;      // optional free text/ranges, e.g. "2-3 servings"
  ingredientGroups: Array<{      // zero or more, independently named/repeatable
    name?: string | null;        // absent/empty means ungrouped
    items: string[];
  }>;
  instructionGroups: Array<{     // independent from ingredient group names/count
    name?: string | null;
    steps: string[];
  }>;
  notes?: Array<{ title: string; markdown: string }>;
  tags?: string[];
  cuisine?: string | null;       // free text, not a fixed taxonomy
  sourceLinks?: Array<{ title?: string; url: string }>;
  additionalMarkdown?: string;   // complete extra content, appended unchanged
  idempotencyKey: string;        // stable value mapped to create-document.id
};

type CreateRecipeResult = {
  documentId: string;            // stable Content document ID
  spaceId: string;
  collectionId: null;            // plain-page v1 contract
  itemId: null;
  urlPath: string;               // returned Content page path, normally /page/<id>
};
```

Validation rejects an empty title, non-HTTP(S) URLs, overlong text, invalid empty groups, or a missing idempotency key. Do not impose an ingredient/instruction grammar or finite group-name enum. `additionalMarkdown` preserves extra authored content that has no typed field. The create action formats all accepted fields into ordinary Markdown once; later reads use the stored Content body, not a reserialization of the input.

### Storage mapping

| Input | Content storage | Notes |
|---|---|---|
| `title` | `documents.title` | Content page title; not copied into another recipe record. |
| `servings` | `documents.content` | Serialize as a Serving Size/Servings label with the value unchanged, including ranges and units. |
| `ingredientGroups` | `documents.content` | Preserve input order. Each named group is a Markdown subsection under Ingredients; ungrouped items remain in the Ingredients section. Group names are arbitrary strings. |
| `instructionGroups` | `documents.content` | Preserve input order independently of ingredient groups. Do not align/fuzzy-match different names or require a matching group. |
| `notes` | `documents.content` | Each item becomes a titled subsection with its Markdown content preserved. Repeated titles remain separate and ordered. |
| `sourceLinks` | `documents.content` | Serialize as Markdown links using the supplied title or URL as link text; validate URL protocol and preserve every supplied link. |
| `tags`, `cuisine` | `documents.content` | Preserve each authored label as readable metadata in the page body. They are searchable as body text, not structured collection properties in v1. Controlled taxonomy and exact filtering remain deferred. |
| `additionalMarkdown` | `documents.content` | Append the exact supplied Markdown after the generated recipe sections, separated only by a Markdown blank line. Never discard unknown content. |
| Content ownership and visibility | Content document in the selected space | Use Content's normal owner/org/visibility and access rules. Do not widen visibility to make household recipes appear. |

The selected Recipes space ID is resolved from the caller-authorized `list-content-spaces` result; never hardcode an ID. A missing or ambiguous exact-name `Recipes` space returns setup guidance/selection instead of provisioning or moving anything. The create action must use the caller's access scope and preserve Content's default-private behavior.

## Action surface, authorization, and write failure

Agent Native 0.226.0 documents that one `defineAction()` is the single implementation exposed to the UI hooks and agent tool. The Recipes UI should call the same `create-recipe` action with `useActionMutation`; the agent should receive its schema as a tool. The action checks that the caller can create in the exact authorized `Recipes` space and, for a collection row, has editor access to that collection. It accepts no caller-supplied owner, visibility, or share list. Content continues to enforce owner/share access; a guessed, inaccessible, or wrong-space ID must fail closed.

There is an unresolved framework seam: the version-matched Actions docs describe `callAction()` as a client API and advise callers to use action surfaces rather than import another action's `run()` implementation. They do not document server-side action-to-action dispatch. The Actions docs also say a direct `action.run()` call gets schema validation only, not the normal dispatch wrappers. Therefore a `create-recipe` wrapper must not be implemented by importing `create-document.run`, `submit-content-database-form.run`, or by making an undocumented HTTP self-call. Before implementation, Michael must select one supported seam:

1. Use the existing registered `create-document` action directly from both UI and agent, with the recipe-to-Markdown mapping performed before the action call; or
2. Approve a small Content-owned shared write service exposed through a registered `create-recipe` action, with the same access checks, attribution, transaction, receipts, and retry guarantees as the existing Content actions.

Do not add a second write path that manipulates Content tables while this seam is undecided.

The registered `submit-content-database-form` action is an attractive collection-row primitive: it validates the live form and writes title, body, and property values in one database transaction, then reads the row back. It inherits collection access and shares. But its current input has no idempotency key; a lost response followed by retry can create a duplicate. `add-database-item` has a stable idempotency receipt but does not provide the same atomic full-body plus property form contract. Thus the collection path cannot claim safe retry with current actions. Add idempotency to the supported write boundary before adopting it. A failed transaction leaves no partial row; a response lost after commit remains an ambiguous outcome and must be looked up/reconciled before retry.

The plain-page `create-document` action accepts an optional pre-generated `id`, explicit `spaceId`/`spaceName`, title, and Markdown content. Its implementation stores a digest of the creation request: replaying the same caller-supplied ID and same request returns the same page; reusing the ID with a different request returns a conflict. Pass `preserveLeadingTitleHeading: true` when the body includes a matching leading H1, so the action does not strip it. A dedicated recipe action should expose equivalent caller-stable retry behavior and return the created document ID even when a later projection step is pending.

## Library compatibility, tags, and search

- Existing Recipes pages remain in the exact authorized space and keep their stable IDs. Do not move, rewrite, or require migration of them.
- `list-documents` returns document IDs and metadata, not collection property values. Its `documentType: "page"` filter excludes collection root documents, not row memberships, so new collection row pages should be listable alongside old ordinary pages. This is supported by the current query implementation; cover it with an action-level regression before shipping.
- The current Recipes library can read either kind by the same stable ID with `get-document`. Metadata chips and filtering need an explicit collection read path; `query-content-database-items` supports row properties and table constraints, while `list-documents` alone does not expose those values. The UI work must merge/present legacy page results and collection rows without dropping either class.
- `search-content-database-rows` is title-only. Collection property filtering belongs to `query-content-database-items` with property definitions and typed filters. Plain legacy pages have no recipe properties, so `Tags`/`Cuisine` filters cannot be complete across old and new records without a body parser/search policy or a backfill. Do not silently claim tag search over legacy pages.
- A fixed multi-select tag catalog makes filtering reliable but an unrecognized tag is rejected by `submit-content-database-form`; adding options is a separate collection-schema mutation and can succeed before a later create fails. Do not dynamically append a tag and then claim one atomic create. If owner wants arbitrary user-defined tags, either use a free-text property with explicitly weaker filtering or design an idempotent schema-plus-row workflow with recovery.

## Risks and compatibility limits

1. **Action composition/idempotency:** No documented server-side action chaining; current form submission lacks an idempotency receipt. This is the primary implementation blocker for the preferred collection-backed path.
2. **Legacy discovery:** Current code indicates row documents pass `documentType: "page"`, but the full Recipes library behavior must be proven with a mixed fixture before the assumption ships.
3. **Search consistency:** Adding structured properties to new rows does not classify old pages. Search needs an agreed rule for tags/cuisine found only in body text versus metadata properties.
4. **Tag vocabulary:** Multi-select requires configured options; a free-text field offers less exact filtering. Product owner must choose the intended semantics.
5. **Non-loss guarantee:** If a form or parser constructs the body from known fields, unknown source content can be lost. `additionalMarkdown` must be appended unchanged, and the serializer must retain every supplied group, note, tag, cuisine value, and source link.
6. **Space permissions:** Two users do not automatically share a private personal space. The action must use the caller's authorized space and existing Content sharing; it must not widen visibility to make household recipes appear.
7. **Setup and migrations:** Creating a collection, modifying live collection schema, backfilling old pages, or changing production DB state is not part of this contract and needs separate review/approval.

## Verification plan for implementation

1. Action schema: title bounds, exact Markdown preservation, free-text servings such as `2-3 servings`, arbitrary repeated component names, repeatable titled notes, tag/source-link bounds, and required idempotency key.
2. Write behavior: one successful create returns stable `documentId` and `/page/<id>` path; retrying the exact intent returns/reconciles the same document; changed payload with reused key fails; no duplicate rows after a simulated lost response.
3. Atomicity: force property validation/transaction failure and verify no page, membership, or partial property values remain; verify successful body and properties by Content read-back.
4. Library compatibility: with a legacy plain recipe page and a new collection row in the same authorized Recipes space, paginate `list-documents(documentType: "page")`, select each stable ID, and `get-document`; both bodies must be readable and unchanged.
5. Privacy: caller with no authorized Recipes space sees setup guidance; inaccessible IDs and a row from another space are rejected; private space access stays private; authorized sharing remains governed by Content.
6. Search: verify title/body search for legacy pages; verify collection tag/cuisine filters for rows; verify and document whether legacy tags/cuisine are searchable without a migration.
7. Parity: call the same registered create action through UI and agent with equivalent input and assert identical validation, permissions, storage mapping, and output shape.

## Follow-on implementation tasks

| Task | Owner | Depends on |
|---|---|---|
| Decide the write seam, idempotency behavior, and tag semantics; approve this contract | Michael + product owner | This review |
| Implement one registered create operation using the approved Content write boundary; validate and return stable ID/link | Dwight | Contract approval; action composition seam |
| Add mixed legacy-page/collection-row retrieval and property-backed search only if the collection path is approved | Dwight + Jim | Collection choice, idempotent write support, approved search semantics |
| Build create UI using the same action and preserve body as supplied; show useful permission/validation errors | Jim | Shared action schema |
| Add action and UI tests for validation, atomicity/retries, access, mixed library discovery, tags, and UI/agent parity | Dwight + Jim | Stable action and read contracts |

## Open decisions for owner

1. **Structured collection properties:** Recommended to defer. Should v1 stay as ordinary pages until Content exposes a supported idempotent body-plus-properties action? This needs no setup and preserves current library behavior, with weaker structured tag/cuisine filtering. Approving a collection now adds setup, retrieval/UI work, and an idempotency gap.
2. **Tags:** Should tags be a controlled multi-select vocabulary (unknown tags rejected), free-form text (weaker filtering), or arbitrary tags with a separately designed idempotent schema update? Recommended interim choice: free text or body-only until an owner-owned vocabulary is provided.
3. **Cuisine:** Is cuisine free text (recommended, no taxonomy lock-in) or a controlled option list?
4. **Write action seam:** May implementation extend/promote a Content-owned registered action to `create-recipe`, or must the Recipes action remain separate? Core 0.226.0 docs do not establish server-side action chaining, so this must be settled before implementation.
