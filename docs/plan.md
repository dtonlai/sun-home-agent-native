# Sun Home v2 — Development Plan

**Project:** Sun Home v2  
**Framework:** Agent Native  
**Development Environment:** JSM HQ  
**Target Hosting:** Netlify  
**Database:** PostgreSQL / Supabase  
**Authentication:** Better Auth / Google OAuth  
**AI Provider:** OpenRouter  
**Status:** Planning

---

## 1. Project Objective

Build Sun Home v2 as a standalone, web-accessible Agent Native application.

Sun Home v1 currently operates through OpenClaw. Version 2 aims to improve accessibility, usability, and household collaboration while preserving the benefits of an integrated AI agent.

The initial release will focus on:

- Content as the central knowledge repository.
- Recipes as a dedicated interface over Content.
- Agent-assisted recipe scaling.
- Responsive desktop and mobile interfaces.
- Persistent recipe storage.
- General agent chat.
- Preparation for secure online deployment.

Future capabilities will include meal planning, shopping lists, Google Calendar, and n8n integrations.

These are not part of the initial development scope.

### Guiding Principle

**Build the smallest usable application first, while preserving a supported path to future expansion.**

---

# 2. Team Structure

| Agent | Role | Primary Responsibility |
|---|---|---|
| Michael | CTO / Technical Lead | Architecture, task assignment, branch/PR review, integration governance, quality gates and release recommendations; not routine feature implementation |
| Dwight | Backend Developer | Agent Native/Content backend integration, PostgreSQL/Drizzle, OpenRouter agent tools, scaling logic, Better Auth and Netlify server configuration |
| Jim | Frontend Developer | Recipes module UI, Content-facing recipe views, responsive comparison, scaling controls, chat integration and UI verification |

### Working Agreement

- **Michael leads and reviews; Dwight and Jim implement.** Michael may make a narrowly scoped emergency integration fix only when necessary, documenting why and returning normal feature work to the developers.
- Michael establishes the supported standalone architecture, task boundaries, interface contracts and integration order. Dwight and Jim propose changes through separate feature branches/PRs.
- Every developer PR goes to Michael. Michael reviews code, documentation alignment, tests, security, upstream compatibility and integration risk. If deficient, Michael returns actionable findings to its author; the developer revises and resubmits until Michael approves.
- Michael owns merge decisions and integrated acceptance. **User approval** remains required for Netlify deployment, paid resources, production data changes, destructive cleanup and unsupported framework modifications.
- Dwight owns backend/API contracts and migration/configuration changes; Jim owns the UI and consumes agreed contracts. Cross-cutting changes require coordination before implementation.
- Only one active development server and one coordinated integration-test runtime where feasible. Avoid parallel Playwright/browser sessions and redundant sandboxes; manual user browser testing is preferred.
- Make small, reviewable commits and preserve a known-good integration branch. Do not merge failing or unverified work.

### Branch and Review Loop

1. Michael defines a bounded task, owner, acceptance criteria and relevant upstream references.
2. Dwight or Jim implements on a dedicated branch, commits, runs lightweight checks and submits a PR or reviewable diff.
3. Michael reviews against the task and returns concrete corrections or approves.
4. The author fixes findings on the same branch and resubmits. Repeat until approved.
5. Michael integrates in dependency order, coordinates a single shared runtime for smoke tests, records evidence and marks the phase gate.

---

# 3. Development Principles

## 3.1 Upstream-First

Use official Agent Native packages, applications, and extension mechanisms.

Do not modify framework internals unless:

1. A specific incompatibility is reproduced.
2. Official documentation and source code are reviewed.
3. Supported configuration alternatives are exhausted.
4. The proposed modification is documented.
5. The user explicitly approves the change.

Keep custom Recipes functionality isolated from upstream Content.

## 3.2 Documentation-Driven

Consult official documentation before implementing framework-specific behavior.

Primary references:

- https://www.agent-native.com/docs/
- https://www.agent-native.com/docs/deployment/
- https://www.agent-native.com/docs/deploy-an-app/

Also inspect generated project documentation, particularly `AGENTS.md`.

Verify all commands against the installed framework version.

## 3.3 Incremental Delivery

Each phase must have:

- Defined scope.
- Assigned ownership.
- Concrete deliverables.
- Acceptance criteria.
- A Git checkpoint.
- A completion report.

Do not advance to the next phase when critical acceptance criteria remain unmet.

## 3.4 Resource Conservation

JSM HQ development environments have previously experienced significant disk and memory pressure.

Therefore:

- Limit concurrent development processes.
- Avoid unnecessary sandbox creation.
- Do not run Playwright unless approved.
- Prefer unit, integration, and HTTP-level tests.
- Use manual browser verification where appropriate.
- Monitor disk usage during development.
- Do not delete sandbox data or Docker volumes without approval.

## 3.5 Deployment Conservation

Netlify credits are limited.

- Do not enable continuous deployment.
- Do not trigger remote builds during routine development.
- Prefer local production builds.
- Deploy only validated release candidates.
- Request approval before production deployment.

---

# Phase 1 — Project Foundation

**Accountable / Final Reviewer:** Michael (CTO)  
**Implementation Owner:** Dwight (backend/foundation)  
**Frontend Support:** Jim

## Objective

Create a clean standalone Agent Native application and establish a reproducible development environment.

## Tasks

### 1.1 Framework Initialization

- Review current official Agent Native initialization instructions.
- Confirm the supported standalone application creation command.
- Initialize a new application.
- Inspect generated `AGENTS.md`.
- Review package versions and application configuration.
- Identify the supported Content integration approach.

### 1.2 Version Control

- Initialize Git.
- Create an appropriate `.gitignore`.
- Commit the clean application baseline.
- Establish a consistent commit convention.

### 1.3 Development Environment

- Install dependencies.
- Configure local environment variables.
- Start the development server.
- Verify the application loads through a browser.
- Confirm that only one development server is active.

### 1.4 Technical Review

Dwight implements and documents framework initialization, package compatibility, local backend/runtime configuration, database requirements and upstream conventions.

Jim validates the frontend scaffold and initial UI entry points without creating another application runtime.

Michael reviews the generated configuration, `AGENTS.md`, source-backed decisions, resource budget and both developers' branches before accepting the foundation.

## Deliverables

- Initialized standalone application.
- Working local development server.
- Clean Git baseline.
- Verified framework configuration.
- Initial architecture notes.

## Acceptance Criteria

- [ ] Application initializes using supported tooling.
- [ ] Development server starts successfully.
- [ ] Application loads locally.
- [ ] Generated `AGENTS.md` has been reviewed.
- [ ] No unnecessary framework modifications.
- [ ] Clean baseline committed to Git.

**Exit Gate:** Dwight demonstrates the running standalone application; Jim verifies the frontend entry point; Michael reviews evidence and approves the foundation.

---

# Phase 2 — Content Foundation

**Accountable / Final Reviewer:** Michael (CTO)  
**Implementation Owner:** Dwight (backend/foundation)  
**Frontend Support:** Jim

## Objective

Establish Content as the functional knowledge repository.

## Tasks

### 2.1 Content Integration

- Use official Content functionality.
- Preserve upstream document editing capabilities.
- Confirm supported application configuration.
- Avoid recreating the Content editor.

### 2.2 Document Management

Verify:

- Document creation.
- Document editing.
- Document retrieval.
- Document persistence.
- Document organization where supported.

### 2.3 Database

Dwight implements and validates:

- Local persistence mechanism.
- Drizzle configuration.
- Migration workflow.
- PostgreSQL compatibility.
- Future Supabase migration requirements.

Jim verifies that Content's existing document interface remains usable; Michael reviews backend changes and test evidence.

Use the officially supported local development database.

Avoid unnecessary schema modifications.

### 2.4 Sample Content

Create a small set of test documents.

Include at least one sample recipe.

Do not implement a complex recipe template yet.

## Deliverables

- Functional Content application.
- Persistent documents.
- Sample recipe document.
- Validated database configuration.

## Acceptance Criteria

- [ ] Content opens locally.
- [ ] Documents can be created.
- [ ] Documents can be edited.
- [ ] Documents can be retrieved.
- [ ] Documents persist after restart.
- [ ] Sample recipe is stored in Content.
- [ ] Database migrations are reproducible.
- [ ] No unsupported Content modifications.

**Exit Gate:** Dwight demonstrates Content persistence, Jim verifies the document UI, and Michael approves the reviewed integration.

---

# Phase 3 — Recipes Module

**Accountable / Final Reviewer:** Michael (CTO)  
**Backend Owner:** Dwight  
**Frontend Owner:** Jim

## Objective

Build a focused Recipes interface that reads recipe documents from Content.

Recipes must remain a presentation layer rather than a separate competing knowledge repository.

## Tasks

### 3.1 Module Integration

Dwight supplies the supported Content read interface; Jim implements the Recipes presentation module. Michael approves the interface contract before parallel work.

- Identify the supported mechanism for extending the standalone application.
- Create the Recipes module.
- Connect Recipes to Content.
- Reuse existing document identifiers and retrieval mechanisms.
- Avoid duplicating recipe storage.

### 3.2 Recipe Library

Implement:

- Recipe listing.
- Recipe selection.
- Recipe detail view.
- Basic search or filtering where practical.

### 3.3 Recipe Viewer

Display:

- Recipe title.
- Serving quantity.
- Ingredients.
- Instructions.

Use a minimal recipe structure.

Do not build a comprehensive recipe schema yet.

### 3.4 Responsive Interface

Desktop:

- Recipe viewer.
- Space for a second scaled recipe panel.

Mobile:

- Responsive single-column presentation.
- Readable ingredients and instructions.
- Accessible controls.

### 3.5 Integration Verification

Confirm that:

- Recipes reads Content documents.
- Changes made in Content appear in Recipes.
- Recipes does not create duplicate source records.
- Existing Content functionality remains unaffected.

## Deliverables

- Recipes module.
- Recipe library interface.
- Recipe detail interface.
- Responsive layout.
- Content integration.

## Acceptance Criteria

- [ ] Recipes module loads.
- [ ] Sample recipe appears.
- [ ] Recipe can be opened.
- [ ] Ingredients display correctly.
- [ ] Instructions display correctly.
- [ ] Changes in Content appear in Recipes.
- [ ] No duplicate recipe repository.
- [ ] Desktop and mobile layouts are usable.

**Exit Gate:** Jim demonstrates recipe browsing and responsive viewing against Dwight's Content interface; Michael approves the reviewed feature branches.

---

# Phase 4 — Agent Integration and Intelligent Scaling

**Accountable / Final Reviewer:** Michael (CTO)  
**Backend Owner:** Dwight  
**Frontend Owner:** Jim

## Objective

Integrate the Agent Native agent with Recipes and implement intelligent recipe scaling.

## Tasks

### 4.1 OpenRouter Configuration

Dwight owns provider configuration and backend agent actions. Jim owns controls, rendering and error states. Michael reviews the contract and end-to-end evidence.

- Configure OpenRouter through supported Agent Native mechanisms.
- Evaluate a cost-effective DeepSeek model.
- Verify tool-calling compatibility.
- Verify structured-output support.
- Verify required streaming behavior.
- Store API credentials securely.

Do not expose model credentials to the browser.

### 4.2 Agent Access

Verify that the agent can:

- Access the selected recipe.
- Retrieve recipe content.
- Understand serving quantities.
- Receive scaling instructions.
- Return a structured result.

Use supported Agent Native tools and actions.

### 4.3 Scaling Controls

Implement:

- 0.5×
- 1×
- 1.5×
- 2×
- Custom multiplier.
- Explicit Scale action.

Changing the selector must not automatically invoke the model.

### 4.4 Intelligent Scaling

The agent must consider:

- Ingredient quantities.
- Serving yields.
- Seasonings.
- Cooking temperatures.
- Cooking times.
- Equipment capacity.
- Batch preparation.
- Practical adjustments.

Avoid blindly multiplying every numeric value.

### 4.5 Comparison Interface

Desktop:

Original recipe on the left.

Scaled recipe on the right.

Mobile:

Original recipe above.

Scaled recipe below.

The scaled result should include explanations for meaningful non-linear adjustments.

### 4.6 Data Protection

- Preserve the original recipe.
- Do not automatically save scaled versions.
- Do not permit unapproved source document modifications.
- Validate structured AI responses.
- Handle model errors gracefully.

### 4.7 General Chat

Retain Agent Native's supported general chat interface.

Avoid unnecessary customization.

Verify that chat and recipe-specific agent actions coexist.

## Deliverables

- Working OpenRouter integration.
- Functional agent chat.
- Recipe scaling action.
- Structured scaling output.
- Responsive comparison interface.

## Acceptance Criteria

- [ ] OpenRouter model responds.
- [ ] Agent can retrieve selected recipe.
- [ ] Scaling factor is passed correctly.
- [ ] Scaled ingredients are generated.
- [ ] Cooking instructions are adjusted intelligently.
- [ ] Original recipe remains unchanged.
- [ ] Desktop comparison works.
- [ ] Mobile comparison works.
- [ ] General chat remains functional.
- [ ] Errors do not corrupt recipe data.

**Exit Gate:** Dwight demonstrates agent scaling and validation; Jim demonstrates comparison UI; Michael approves the integrated workflow.

---

# Phase 5 — Quality and Stability

**Accountable / Final Reviewer:** Michael (CTO)  
**Backend Tests / Fixes:** Dwight  
**Frontend Tests / Fixes:** Jim

## Objective

Validate functionality, upstream compatibility, and application stability before deployment preparation.

## Tasks

### 5.1 Framework Review

Review:

- Package versions.
- Application configuration.
- Agent tool integration.
- Content extension mechanisms.
- Custom Recipes code.
- Any deviations from upstream.

### 5.2 Functional Tests

Verify:

- Content document operations.
- Recipes retrieval.
- Recipe display.
- Scaling controls.
- Agent execution.
- Structured output validation.
- Error handling.

### 5.3 Regression Tests

Confirm that Recipes changes have not broken:

- Content editing.
- Content persistence.
- Agent chat.
- Authentication-related configuration.
- Database operations.

### 5.4 Resource Review

Dwight inspects backend/runtime memory, database storage, sandbox usage and build caches; Jim inspects frontend build/runtime overhead. Michael reviews the combined resource report and coordinates a single test runtime.

Do not perform destructive cleanup without approval.

### 5.5 Manual Verification

The user may perform browser-based testing.

Automated browser testing should remain limited unless explicitly authorized.

## Deliverables

- Quality review.
- Functional test results.
- Known issues.
- Stable Git checkpoint.

## Acceptance Criteria

- [ ] Critical functionality passes.
- [ ] No unresolved data-loss issues.
- [ ] No unsupported framework changes.
- [ ] No major regressions.
- [ ] Resource usage is documented.
- [ ] Stable version committed.

**Exit Gate:** Michael accepts the stable local release after reviewing Dwight's backend tests, Jim's UI tests and the integrated smoke-test evidence.

---

# Phase 6 — Production Configuration and Deployment Readiness

**Accountable / Final Reviewer:** Michael (CTO)  
**Backend / Deployment Configuration Owner:** Dwight  
**Frontend Verification Owner:** Jim

## Objective

Prepare Sun Home v2 for Netlify without initiating unnecessary remote builds.

## Tasks

### 6.1 PostgreSQL and Supabase

- Review official PostgreSQL requirements.
- Confirm Drizzle migration compatibility.
- Prepare Supabase setup instructions.
- Document required database credentials.
- Verify migration procedures.
- Identify production connection requirements.

Use a dedicated Sun Home database.

Do not modify unrelated databases.

### 6.2 Better Auth

Prepare:

- Production authentication configuration.
- Google OAuth provider settings.
- Callback URLs.
- Session configuration.
- Authentication secrets.
- Authorized household access.

Verify that two authorized accounts can access the intended shared recipe library.

Do not assume authentication automatically provides shared document permissions.

### 6.3 Netlify

Dwight prepares the server-side deployment configuration; Jim checks frontend assets, responsive behavior and client-side secret exposure; Michael reviews readiness.

Review official Agent Native deployment documentation.

Prepare:

- Supported Nitro preset.
- Build command.
- Publish configuration.
- Serverless function configuration.
- Required environment variables.
- Database connection.
- Authentication URLs.
- Model-provider configuration.

### 6.4 Environment Configuration

Create and maintain:

`.env.example`

Document all required variables.

Never commit secrets.

Ensure server-only secrets are not exposed in client bundles.

### 6.5 Local Production Build

Run a local production build using the supported deployment preset.

Verify:

- Build completes.
- No unresolved imports.
- No missing runtime dependencies.
- Required environment variables are documented.
- Generated artifacts are appropriate for Netlify.

A successful build does not automatically establish runtime compatibility.

### 6.6 Deployment Checklist

Produce a checklist covering:

- Supabase readiness.
- Database migrations.
- Better Auth.
- Google OAuth.
- OpenRouter.
- Netlify environment variables.
- DNS and HTTPS.
- Rollback procedure.
- Expected costs.

## Deliverables

- Supabase migration plan.
- Better Auth configuration.
- Netlify deployment configuration.
- Local production build results.
- Deployment checklist.
- Rollback plan.

## Acceptance Criteria

- [ ] Local production build succeeds.
- [ ] PostgreSQL migration path verified.
- [ ] Supabase configuration documented.
- [ ] Better Auth requirements documented.
- [ ] Google OAuth configuration prepared.
- [ ] OpenRouter secrets handled securely.
- [ ] Netlify configuration follows official guidance.
- [ ] Deployment checklist complete.
- [ ] No remote deployment initiated.

**Exit Gate:** Michael signs off technical readiness and presents the deployment checklist; the user separately authorizes the first controlled Netlify deployment.

---

# Phase 7 — Controlled Deployment and Acceptance

**Accountable / Release Reviewer:** Michael (CTO)  
**Backend / Deployment Executor:** Dwight  
**Frontend / UX Verification:** Jim

**Prerequisite:** Explicit user approval.

## Objective

Deploy one validated release candidate to Netlify and verify real-world functionality.

## Tasks

### 7.1 Deployment

After user authorization, Dwight executes the controlled deployment; Jim verifies the deployed UI; Michael reviews release evidence and coordinates rollback if necessary.

- Configure production environment variables.
- Connect the dedicated Supabase database.
- Apply approved migrations.
- Configure Better Auth.
- Configure Google OAuth.
- Deploy the validated release candidate.

Do not enable continuous deployment.

### 7.2 Production Verification

Verify:

- Application opens over HTTPS.
- Authentication works.
- Content loads.
- Recipes loads.
- Sample recipes appear.
- Agent chat works.
- AI scaling works.
- Data persists.
- Original recipes remain unchanged.

### 7.3 Household Access

Verify:

- Primary user can sign in.
- Second authorized user can sign in.
- Both users can access the intended shared recipe library.
- Unauthorized users cannot access private data.

### 7.4 Responsive Testing

Verify desktop and mobile layouts using real browsers.

### 7.5 Deployment Monitoring

Review:

- Netlify function errors.
- Database connection errors.
- Authentication failures.
- AI API failures.
- Resource usage.
- Unexpected costs.

### 7.6 Release Documentation

Record:

- Deployed version.
- Git commit.
- Deployment date.
- Environment configuration.
- Known issues.
- Rollback instructions.

## Deliverables

- Accessible Sun Home v2 application.
- Verified authentication.
- Persistent Content and Recipes.
- Functional agent scaling.
- Production acceptance report.

## Acceptance Criteria

- [ ] Application accessible without Tailscale.
- [ ] HTTPS works.
- [ ] Authentication works.
- [ ] Two authorized household users can access shared recipes.
- [ ] Content persists.
- [ ] Recipes displays correctly.
- [ ] Agent scaling works.
- [ ] Original recipe remains unchanged.
- [ ] Mobile interface is usable.
- [ ] No critical production errors.
- [ ] Rollback procedure documented.

**Exit Gate:** Michael reviews deployment evidence and recommends acceptance; the user accepts Sun Home v2.0 as the first usable web release.

---

# 4. Future Roadmap

The following phases are intentionally excluded from the current implementation.

## v2.1 — Intelligent Meal Planning

Enable the agent to:

- Search available recipes.
- Consider available ingredients.
- Propose weekly meal plans.
- Allow user adjustments.
- Save approved plans.

## v2.2 — n8n and Google Calendar

Introduce n8n as an external automation layer.

Enable approved meal plans to create Google Calendar events containing recipe links.

## v2.3 — Shopping Lists

Generate consolidated ingredient lists from approved meal plans.

Support manual editing and household collaboration.

## v2.4 — Additional Content Workflows

Expand Content to support:

- Household notes.
- Veterinary records.
- Appointments.
- Personal documents.
- Automation SOPs.

## Future — Agent Orchestration

Evaluate approval workflows, additional integrations, and Dispatch-style orchestration only after the core application is established.

---

# 5. Project Governance

## Phase Completion

Michael is the final technical reviewer for every phase. Developers must submit reviewable changes and resolve Michael’s findings before merge. A phase is not complete until integration evidence is reviewed.

Each phase requires a short completion report containing:

1. Work completed.
2. Evidence of successful tests.
3. Known issues.
4. Relevant Git commits.
5. Remaining risks.
6. Recommendation to proceed.

Do not mark a phase complete solely because code has been written.

## Change Control

Any proposed deviation from the architecture must identify:

- Reason for the change.
- Official documentation supporting it.
- Alternatives considered.
- Impact on upstream compatibility.
- Impact on deployment.
- Rollback strategy.

## Blocker Management

When blocked:

1. Reproduce the issue.
2. Collect evidence.
3. Identify the responsible component.
4. Consult official documentation.
5. Propose the smallest supported fix.
6. Request approval if required.
7. Retest.

Do not repeatedly apply speculative changes.

## Resource Management

Agents must avoid unnecessary concurrent runtimes.

Browser automation requires approval.

Do not delete persistent sandbox storage, Docker volumes, or project data without authorization.

## Deployment Management

Netlify deployments are manual and approval-gated.

Do not enable continuous deployment.

Do not use remote builds for speculative troubleshooting.

---

# 6. Final Project Definition of Done

Sun Home v2.0 is complete when:

- A standalone Agent Native application is deployed.
- Content functions as the knowledge repository.
- Recipes provides a dedicated interface over Content.
- The agent can intelligently scale recipes.
- Original and scaled recipes can be compared.
- The interface works on desktop and mobile.
- PostgreSQL persistence works.
- Google authentication works for authorized household users.
- The application is accessible over HTTPS without Tailscale.
- The implementation follows supported upstream patterns.
- The application can be maintained and extended without rebuilding its foundation.

**Project priority: Deliver a stable, usable Sun Home application before expanding the ecosystem.**