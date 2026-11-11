# Phase 4 recipe scaling path audit

Research date: 2026-11-10. Installed framework: `@agent-native/core` 0.226.0.
This note began as a source-and-documentation audit. P4A-T05 adds the OpenRouter
AI SDK provider package required by the installed engine; no provider key,
model request, database, app server, or production configuration has been used
yet. It does not claim Phase 3 is complete.

## Recommended contract

Current checkout evidence: `RecipesLibrary` lists and selects recipe
documents, then reads the selected Content page; it has no Scale control or
scale-result action yet. The items below are a proposed Phase 4 contract, not
implemented behavior.

1. Keep the selected Content document ID and selected scale factor as the
   request identity. The Recipes page keeps `recipeId` in the URL; the route
   state hook maps it to `navigation.documentId`. On an explicit Scale click,
   call `sendToAgentChat()` with a visible instruction and only
   `{ documentId, scaleFactor }` as bounded hidden context, with
   `submit: true` and `openSidebar: true`. Bind the same values in a proposed
   `actionScope` for the server resolver to validate. Do not send the whole
   recipe body.
2. The current-screen snapshot gives the agent the selected document ID and a
   bounded preview. For the full saved recipe, the agent should call the
   existing `get-document` action with that exact ID. It resolves document
   access for the current caller, rejects missing/inaccessible/trashed pages,
   and returns the full saved body. No new recipe-fetch action is needed.
3. Keep scaling itself in the AgentSidebar agent turn. Do not call a model from
   a UI handler, action, or server helper. For Phase 4's structured-result
   requirement, use one deterministic result action: accept a small
   Zod-validated payload bound to the selected document ID and scale factor,
   return the same normalized value under a strict `outputSchema`, and render
   it with a native `chatUI` renderer. It should not call a model, write a
   Content document, or persist a scaled copy.
   Keep fields minimal for the existing recipe viewer (for example servings,
   ingredient lines, instructions, and adjustment explanations); defer a
   comprehensive ingredient schema until actual recipe formats justify it.
4. Do not rely on the prompt alone to protect the source. Core supports a
   request-scoped hard action allowlist through `resolveActionSurface`. A
   scale request can expose only `get-document` and the validated result
   action, leaving Content create/edit/update/delete tools unavailable for that
   turn. The app already has a resolver, `resolveCommentAiActionSurface`, which
   is bound to comment-AI scope; the current source does not accept a recipe
   scaling scope. A later implementation must extend/compose that resolver
   with a validated recipe-scaling scope, verify the source ID is accessible
   to the current caller, and keep its existing comment-AI behavior. The app
   leaves Core's `frameworkTools.database` at its documented
   read-only default, so `db-schema`/`db-query` may remain available but
   `db-exec`/`db-patch` are not exposed. Confirm the dev and deployed scale
   surfaces keep that boundary; the plugin config also selects sandboxed
   production code execution. Core requires the resolver to return a
   server-authorized allowlist for a scoped request.

The framework's streaming engine uses AI SDK `streamText` with converted
registered tools, and turns streamed tool-call events into agent events. That
is framework-level tool/stream support, not proof that a particular OpenRouter
model supports tool calls, valid structured arguments, or streaming. The
installed engine call does not set a schema-constrained final assistant output
mode. Therefore, do not treat arbitrary assistant prose/JSON as validated
structured data: require the model to call the result action and validate the
action input and return. If it does not produce that call, show a recoverable
error and do not update the scaled-result view. Core's native action renderer
path validates action results through `outputSchema` and selects a renderer
through `chatUI.renderer`.

## Provider, candidate, and credentials

Core 0.226.0 exposes OpenRouter as the `ai-sdk:openrouter` provider, loads
`@openrouter/ai-sdk-provider`, and uses `OPENROUTER_API_KEY`. Its Settings model
catalog currently includes `deepseek/deepseek-v4.1-flash`,
`deepseek/deepseek-v4-pro`, and `deepseek/deepseek-chat-v3.1`. Provisional
candidate: **`deepseek/deepseek-v4.1-flash`**, because it is an installed
Core-supported DeepSeek Flash model and a reasonable first candidate to price
and test alongside `deepseek/deepseek-v4-pro`. “Flash” is not price evidence;
its current price and model-specific tool, structured-output, and streaming
capabilities remain unverified pending official OpenRouter catalog access.

P4A-T05 dependency evidence: Core 0.226.0 declares
`@openrouter/ai-sdk-provider >=2` as an optional peer and dynamically imports
that package for `ai-sdk:openrouter`. This app uses AI SDK 7, so the compatible
provider line is 3.x: `@openrouter/ai-sdk-provider` 3.1.0 declares peer
`ai: ^7.0.0`. The 2.10.0 line instead requires AI SDK 6 and is not used. The
provider is now a direct app dependency at `^3.1.0`; the existing
`@ai-sdk/openai` dependency remains unchanged. `pnpm install
--frozen-lockfile` passes, and Core's OpenRouter engine constructs a model
without the prior missing-package error. A provider request and the end-to-end
recipe-scaling check remain pending explicit owner authorization.

OpenRouter's official public model catalog request to
`https://openrouter.ai/api/v1/models` returned HTTP 403 with “Approval required
for openrouter.ai”. Access was requested through HQ on 2026-11-10. No provider
docs/catalog claim is made from memory or an alternate source. After access is
granted, compare the exact IDs above in the official catalog for input/output
pricing and listed tool-calling/structured-output capabilities, and read
OpenRouter's official tool-calling, structured-output, and streaming docs.
Replace or confirm the provisional candidate with the observed prices and
capabilities, recording the lookup date and exact model IDs.

Use the existing Core credential path; do not add a second key form or register
another copy of the Core key. Core 0.226.0 registers optional
`OPENROUTER_API_KEY` as a user-scoped secret and resolves credentials through
the shared provider/secret resolver. Prefer the caller's existing personal
key, or an organization-scoped key when that is the household's approved
ownership model. A server-side `OPENROUTER_API_KEY` is only the self-hosted
deployment fallback; scoped keys take precedence and provider usage then bills
the deployment account. In local development, Core documents `.env` as the
local fallback source. Do not put a key in client code, messages, action
arguments/results, app state, logs, or this note. No secret was requested or
handled for this audit.

## Verification required before selecting a model

- After official catalog access, compare current pricing for the listed
  DeepSeek IDs and record their listed tool-calling, structured-output, and
  streaming support. Treat catalog metadata as provider claims, not runtime
  proof.
- With an explicitly configured, authorized OpenRouter key and the chosen
  Settings model, make one controlled test on a representative recipe. Verify
  the submitted factor and exact Content ID, the `get-document` tool call, the
  result-action tool call, and stream completion/error behavior.
- Test the result Zod schema with valid and malformed payloads, including a
  mismatched source ID/factor. Confirm invalid results do not reach the viewer.
- Verify the scale request's resolved action allowlist excludes Content write
  actions and that database tools stay read-only; confirm production
  code-execution remains sandboxed.
- Exercise 0.5×, 1×, 1.5×, 2×, and a custom factor only from the explicit Scale
  control; selector changes alone must not start inference.
- Compare the source document ID, body, and revision before/after. Confirm the
  scaled result stays ephemeral and no Content write action is available to the
  scoped scale turn. Keep original/scaled comparison and mobile behavior as a
  separate UI acceptance check.

## Evidence consulted

- Installed Core version: `node_modules/@agent-native/core/package.json`
  (`0.226.0`).
- Handoff, context, and screen behavior: installed
  `docs/content/context-awareness.mdx` (view-screen and
  `sendToAgentChat()` sections), `docs/content/using-your-agent.mdx`, and
  `docs/content/agent-surfaces.mdx` (request-scoped action surfaces).
- Framework database/code-execution boundaries:
  `docs/content/actions-agent-tools.mdx`.
- Action schema, output validation, and UI rendering:
  `docs/content/actions-defining.mdx`, `docs/content/native-chat-ui.mdx`,
  `dist/action.js`, and `dist/agent/engine/translate-ai-sdk.js`.
- Provider/model selection, tool streaming, and key handling:
  `docs/content/environment-variables.mdx`, `dist/agent/model-config.js`,
  `dist/agent/provider-model-selection.js`,
  `dist/agent/engine/provider-env-vars.js`,
  `dist/agent/engine/ai-sdk-engine.js`,
  `dist/secrets/register-framework-secrets.js`, and
  `dist/server/credential-provider.js`; client handoff fields are typed in
  `dist/client/agent-chat.d.ts`.
- Requested local skills: `.agents/skills/agent-native-docs/SKILL.md`,
  `.agents/skills/delegate-to-agent/SKILL.md`,
  `.agents/skills/actions/SKILL.md`, `.agents/skills/secrets/SKILL.md`,
  `.agents/skills/context-awareness/SKILL.md`, and
  `.agents/skills/security/SKILL.md`.
- Current app flow: `app/components/recipes/RecipesLibrary.tsx`,
  `app/hooks/use-navigation-state.ts`, `actions/view-screen.ts`,
  `actions/get-document.ts`, `actions/list-documents.ts`,
  `server/plugins/agent-chat.ts`, and `server/lib/comment-ai.ts`.
- Phase scope: `docs/plan.md`, “Phase 4 — Agent Integration and Intelligent
  Scaling”.
