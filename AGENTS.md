# Sun Home v2 — Agent Guide and Team Rules

Sun Home v2 is a standalone Agent Native application built around upstream **Content** and a small **Recipes** module. Content owns documents; Recipes reads and presents recipe documents and offers agent-assisted scaling. The first release targets local validation, then an explicitly approved Netlify deployment with PostgreSQL/Supabase and Better Auth. JSM HQ supplies each agent's task, tools, and workflow context.

## Source of truth and reading order

1. Read this `AGENTS.md` before working.
2. Read the assigned task (use JSM HQ `get_my_task` when available).
3. Read relevant sections of `docs/project.md` (charter, scope, constraints) and `docs/plan.md` (phases, ownership, exit gates). Do not assume headings or section numbers from another project.
4. Read the generated Agent Native guidance and the exact relevant `.agents/skills/**/SKILL.md` before changing framework behavior. Confirm that files, actions, and scripts exist in this checkout.
5. For non-trivial framework behavior, use version-matched documentation and source from the installed `@agent-native/core` first. Use `pnpm action framework-search --pattern "<topic>"` **if available**, then focused `docs-search` / `source-search` readers; otherwise inspect `node_modules/@agent-native/core/docs` and package source directly. Confirm scripts and files exist before relying on them. Public official docs can supplement installed evidence; record the framework version and evidence behind a fix.

If these sources conflict, do not silently reconcile them. Raise the conflict to Michael; changes to product scope or approval boundaries require the product owner's decision. Preserve generated Content instructions when they govern Content behavior.

## Team and authority

| Person | Role | Accountable for |
|---|---|---|
| Product owner | Product owner | Scope, external accounts and credentials, spending, production deployment, destructive operations, significant architecture deviations |
| **Michael** | **CTO / technical lead** | Architecture, task breakdown, interface contracts, upstream compatibility, branch and PR review, integration, phase gates, release recommendation |
| **Dwight** | **Backend developer** | Content/action integration, recipe retrieval, OpenRouter agent tools and scaling, database/Drizzle, Better Auth, server-side Netlify configuration |
| **Jim** | **Frontend developer** | Recipe library and viewer, scaling controls, original/scaled comparison, responsive UI, existing chat UI integration, frontend tests |

Michael **does not routinely implement features**. Dwight and Jim implement on separate task branches. Michael reviews their work and returns specific defects to the author until accepted. Michael owns integration and may assign tightly scoped fixes, but must not bypass the review loop. All agents own testing of their changes; Michael is the final technical reviewer, not a substitute for developer tests.

## Work loop in JSM HQ

1. **Assign:** Michael specifies the task, owner, dependencies, affected interfaces, acceptance criteria, and relevant plan phase. Agree on backend/frontend contracts before parallel implementation.
2. **Implement:** Developer starts from the agreed integration branch, uses a dedicated feature branch, commits focused changes, and avoids modifying another developer's files without coordination.
3. **Verify:** Run applicable local checks and record actual results. Do not claim a test passed if it was skipped, blocked, or not run.
4. **Submit:** Open a PR when remote Git/PR tools are configured; otherwise provide a reviewable branch and commit/diff. Include summary, tests, acceptance checklist, upstream references, risks, and any dependency added.
5. **Review:** Michael reviews architecture, correctness, security, regression risk, framework compatibility, and evidence. Return actionable comments to the author. The developer addresses each valid comment **on the same branch** and requests re-review; explain disputed comments with evidence.
6. **Integrate:** Only Michael (or an explicitly delegated maintainer) approves merging. Developers never merge their own changes, push directly to the protected integration branch, or force-push a branch under review. Verify the integrated result and record the phase gate.
7. **Continue:** Start another task only if it is independent of open, unmerged work. If a previous PR needs fixes, return to its branch without disrupting the status of a newer JSM HQ task.

Do not assume that JSM HQ, GitHub PRs, CodeRabbit, or particular status commands are available; use them when actually configured. No automatic preview deployments are permitted.

## Upstream-first development

- Use the official standalone Agent Native initialization, Content application, packages, actions, configuration, and extension mechanisms. **Do not invent CLI commands or framework APIs.**
- Keep upstream Content intact where possible. Build Recipes as a focused module/view, **not** a second document store or a replacement editor.
- Before modifying shared contracts, framework internals, application manifests, SSR/build configuration, or dependency versions: reproduce the issue, inspect installed versions and generated guidance, check documented alternatives, propose the smallest supported change, and obtain Michael's review. Framework forks or unsupported internal patches require product-owner approval.
- Do not reapply historical workarounds automatically. Prior Agent Native SSR/runtime findings may not apply to the installed version.
- Before building common agent/workspace UI, read `.agents/skills/agent-native-toolkit/SKILL.md`; for supported customization, read `.agents/skills/customizing-agent-native/SKILL.md`, when present.
- Keep a clean Git baseline and checkpoint stable milestones. Avoid speculative refactors or additional frameworks.

## Content-specific invariants — preserve upstream behavior

The following rules are inherited from Content's original agent guide. They apply when the relevant Content actions/features are present; check action schemas rather than guessing.

- **Use Content actions for document operations.** Call registered actions directly; `ask_app` delegates to Content's agent. Do not bypass authorization with raw SQL or ad hoc HTTP mutations.
- **Preserve user-authored content.** Read the current document with `pull-document` or `get-document` before editing. Live Yjs body writes use supported actions. External agents use revision-aware `edit-document`; use `initializeContent` only when `get-document` confirms the body is literally empty, passing its returned `baseRevision` and a stable `idempotencyKey`. Browser full rewrites use `update-document` only where appropriate. Prefer targeted edits.
- **Use current state, not guessed IDs.** Inspect `<current-screen>` when provided; use `view-screen` to refresh stale context and `navigate` for navigation. `navigation` is UI-owned: do not write it directly. Use `refresh-list` only when an out-of-band mutation leaves the UI stale.
- **Privacy is the default.** Documents are private unless shared through supported sharing actions. Two Google logins do not automatically imply access to the same library; test sharing/authorization explicitly.
- **Avoid destructive Content operations.** Trash is not permanent deletion. Permanent purge requires the supported frozen plan and documented authorization flow. Do not treat navigation, trash filters, or import progress as deletion authority.
- **Respect app-owned state.** `creative-context`, `content-last-location-v1`, `content-trash`, and `content-import` have their own documented ownership and semantics; read the relevant skills before changing them.
- **Use registered action schemas.** Discover actions via `tool-search` when available. Typical actions include `list-documents`, `search-documents`, `get-document`, `pull-document`, `create-document`, `edit-document`, `update-document`, and `navigate`; verify availability and parameters in this version. Collection rows, sharing, imports, Notion, and Trash have separate actions and skills.
- **Recipe scaling is a scoped, read-only workflow.** `start-recipe-scaling` is frontend-only and creates a five-minute, single-use SQL grant for the authenticated owner-email identity, stable document ID, and factor after `resolveDocumentAccess`. Core 0.226.0 accepts caller-supplied `actionScope`, so the scope is only a grant-token reference; `resolveRecipeScalingActionSurface` binds that token atomically to the first owned thread and available turn/message IDs. Only that binding receives `get-document` and `submit-recipe-scaling-result`. The result is validated, access is checked again, and its grant is atomically consumed. Comment-AI scopes remain unchanged. Scaling never calls a model or writes Content.
- **Keep UI responsive.** Acknowledge interactions before network work; upstream target is 100 ms feedback, with 400 ms as the maximum target for acknowledgment—not a promise about model completion.
- **Keep large files outside SQL** and store references. Reuse scoped provider connection mechanisms rather than hardcoded credentials.

Relevant installed skill guides may include `content`, `document-editing`, `actions`, `adding-a-feature`, `agent-native-docs`, `agent-native-toolkit`, `customizing-agent-native`, `reliable-mutations`, `storing-data`, `security`, `secrets`, `sharing`, `frontend-design`, `performance`, `portability`, and `workspace-conventions`. Find with `rg --hidden --follow` and read the exact guide needed; do not assume every guide is installed.

## Recipes v2.0 boundaries

- For the read-only Recipes library workflow, locate the caller-authorized space
  named exactly `Recipes` with `list-content-spaces`. Keep ordinary recipe pages
  as a fallback using `list-documents` (`documentType: "page"`, following
  pagination on demand); read a selected page with `get-document` by its stable
  Content ID. Read collection-backed recipes and their properties through
  `get-content-database` or `query-content-database-items` using the stable
  collection ID. Confirm each selected page/row belongs to the selected Recipes
  space before showing it. Use the Recipes route for navigation and retain the
  stable page ID in its URL. Browsing stays read-only. Never create a Recipes
  space or create, move, or edit Content merely because a recipe was viewed.
- For explicit recipe creation, call the registered `create-recipe` action only
  after the user asks to create or save a recipe. Resolve the authorized
  `Recipes` space and existing collection, then pass the exact collection target,
  `formViewId`, a fresh `schemaRevision`, and a stable idempotency key for that
  unchanged submission. Retry an ambiguous result with the same key and
  identical input; use a new key for a changed recipe. The action writes one row
  and returns its stable Content IDs, receipt, and verified read-back. It never
  provisions a collection or changes a source recipe. The existing collection
  must have a `Tags` property of type `text` so freely entered tags remain
  searchable.
- To create from an existing recipe page, use Content search/list actions to
  locate it and `get-document` to read its stable ID. For a user-provided video
  description, use only description/transcript text already supplied or
  available through existing safe actions; do not claim to watch the video,
  scrape it, or add a bespoke fetcher. Preserve all supplied source links and
  their titles. When measurements, timing, or other source details are
  uncertain, keep that uncertainty in a titled recipe note or ask the user;
  never silently invent a value. Do not edit the source page.
- For explicit scaling, the Recipes UI alone calls `start-recipe-scaling` after
  the user presses Scale; changing a factor is local-only. The UI sends only
  `{ documentId, factor }` as chat context and the opaque grant in `actionScope`.
  The scoped agent turn reads the source with `get-document`, then submits its
  validated bounded result to `submit-recipe-scaling-result`. Do not repeat or
  expose the grant token, send the full source body as context, or write a
  scaled copy to Content. The result action renders an ephemeral comparison.
- Recipes reads Content documents by stable identifiers. Changes to a source document must appear in Recipes; do not silently duplicate canonical recipe data.
- Keep recipe parsing/template requirements minimal for the first proof of functionality. Use a representative sample recipe; defer a comprehensive schema.
- Support 0.5×, 1×, 1.5×, 2×, and custom scaling. **Invoke the model only on an explicit Scale action.**
- Use the Agent Native agent and **OpenRouter** (prefer a compatible cost-effective DeepSeek model). Verify tool calling, structured output, and any needed streaming behavior against the selected model.
- Scaling must account for non-linear cooking factors such as oven temperature, time, seasoning, equipment capacity, and batching. Validate returned data; show useful errors.
- Original recipe is read-only in the comparison workflow. Never overwrite it or automatically save a scaled copy.
- Desktop: original left, scaled right. Mobile: original above, scaled below. Reuse the existing general chat UI rather than recreating it.
- Meal planning, Shopping, Gmail, Calendar, n8n, Dispatch, and headless browser automation are **out of scope** for this release.

## Data, authentication, and security

- Follow the **installed Agent Native database stack**, including its supported Drizzle schema and migration workflow. Prefer a lightweight supported local database for development; prepare an evidenced migration path to **Supabase PostgreSQL**. Do not import Askwell's `supabase-js`/Clerk/RLS client assumptions or its migration directory layout.
- Make migrations reproducible and reviewable. Do not rewrite already-merged migrations. Destructive schema changes, shared contracts, and production migrations require review and the applicable owner approval. Preserve existing data and consider additive transitions.
- Use Agent Native's supported **Better Auth** integration. Prepare Google OAuth for two authorized household users; explicitly validate server-side access checks and shared Content permissions.
- Keep OpenRouter keys, database credentials, OAuth secrets, and session secrets server-side. Never commit `.env` or keys; maintain `.env.example` with placeholders. Do not expose secrets through client/public environment variables, logs, browser bundles, or PRs.
- Validate external input at trust boundaries, prefer shared types/schemas already present in the project, and avoid unsafe rendering of agent output as HTML.
- Never bypass Content actions, access checks, or ownership verification to make integration easier.

## Testing and resource limits

- Use the project's **actual** scripts; inspect `package.json` before running commands. Typical checks are typecheck, lint, unit/integration tests, and local build **if defined**. Use Vitest where already configured; do not add a test framework solely to mimic Askwell.
- Run `pnpm agent-native:doctor` when that script is present; resolve or document findings before marking a phase done.
- Prefer unit tests, action-level integration tests, HTTP checks, and product-owner manual browser testing. **No Playwright or automated browser sessions without explicit approval.**
- Only **one active application development server** across the team. Coordinate runtime access. Avoid redundant sandbox containers, builds, and browser processes. Inspect CPU, RAM, and disk usage before expensive work.
- Colima/Docker sandboxes, images, and volumes may contain valuable state. Do not prune, reset, delete virtual disks, or clear persistent caches without authorization.
- Distinguish a framework defect from sandbox memory/disk exhaustion. Report evidence and resource usage; do not mask infrastructure failure with speculative app changes.

## Deployment policy — Netlify credits are limited

- **Netlify is the preferred target, not an automatic deployment destination.** Build and test locally first; no continuous deployment, per-PR preview builds, or remote build loops.
- Follow the official Agent Native Netlify/Nitro deployment guidance for the **installed version**. A local build is useful evidence but does not prove serverless runtime compatibility.
- Dwight prepares server configuration, database connectivity, migrations, and auth; Jim verifies responsive UI and browser-facing behavior; Michael reviews release readiness.
- Do not create external resources, connect a production database, apply production migrations, configure paid services, or deploy without product-owner approval.
- Before requesting a deployment, provide a release candidate commit, passing local checks, environment-variable checklist, Supabase/Better Auth/Google OAuth setup steps, rollback plan, and the specific remaining runtime risks.
- The first production deployment is **one controlled, manually approved test**, followed by explicit verification of HTTPS, auth, two-user sharing, Content persistence, recipe retrieval, chat, scaling, and mobile layout.

## Stop and ask

| Situation | Required action |
|---|---|
| Task is ambiguous, conflicts with `docs/project.md` or `docs/plan.md`, or changes scope | Ask Michael; Michael escalates product decisions to the owner. |
| Need an account, API key, OAuth sign-in, paid service, or external access | Explain exactly what is needed and where to configure it; product owner supplies/authorizes it. |
| Need an unsupported upstream patch, framework fork, destructive migration, or shared infrastructure change | Stop; present evidence, minimal proposal, risks, and rollback; obtain required approval. |
| Need Playwright, a second runtime, sandbox reset, Docker prune, or remote Netlify build | Stop and request approval. |
| Existing data, credentials, or authorization behavior may be at risk | Stop; preserve state and report the risk. |

When asking the owner to choose, present a small number of clear options with a recommendation and the trade-off. State observed facts separately from hypotheses.

## Communication and completion

- Lead with the result or blocker. Keep updates concise, specific, and evidence-based.
- For each task or PR, report: changes, tests actually run, acceptance criteria passed/blocked, upstream documentation used, commits, and remaining risks.
- Michael records phase completion only when `docs/plan.md` acceptance criteria and integration checks pass. No phase is complete merely because code was written.
- Before release, confirm Content actions remain functional, original documents are unchanged by scaling, and there are no unapproved framework deviations.
