# Sun Home v2 — Project Charter

## Mission

Build the first usable web-based version of Sun Home v2.

Sun Home v1 currently exists using OpenClaw.

Sun Home v2 will use Agent Native to provide a browser-accessible home management application with integrated AI capabilities.

The first release focuses exclusively on Content and Recipes.

## Core deliverable

Create a standalone Agent Native application containing:

- Official Content functionality.
- A dedicated Recipes module.
- Recipe browsing and viewing.
- AI-assisted recipe scaling.
- Responsive side-by-side recipe comparison.
- Integrated agent chat.
- Persistent local database.
- A supported path to Supabase and Netlify.

## Team and decision rights

| Agent | Role | Accountability |
|---|---|---|
| Michael | CTO | Technical architecture, developer tasking, interface contracts, PR/branch review, correction loops, merge approval, integration acceptance and deployment recommendation; not primary feature developer |
| Dwight | Backend Developer | Agent Native/Content integration, recipe data access, OpenRouter agent tools and scaling logic, Drizzle/PostgreSQL, Better Auth and Netlify server configuration |
| Jim | Frontend Developer | Recipes library and viewer, scaling controls, original/scaled comparison, responsive layout, chat UI integration and frontend tests |

**Development loop:** Michael assigns bounded tasks → Dwight/Jim implement on separate branches → Michael reviews → author corrects and resubmits as needed → Michael approves merge and integrated testing. Michael should not routinely implement features or bypass review. Cross-layer contracts are agreed before parallel implementation.

**Authority:** Michael can approve technical merges and local milestones; only the user can approve Netlify deployments, paid services, production database changes, destructive cleanup, shared infrastructure changes or unsupported framework modifications.

**Resource policy:** Coordinate a single development runtime where practical; avoid parallel Playwright/browser sessions, redundant sandboxes and unnecessary builds. Manual browser verification by the user is acceptable. Do not remove Colima/Docker volumes or sandbox state without explicit permission.

## Development principles

### Upstream-first

Use official Agent Native packages, APIs, and extension mechanisms.

Do not modify framework internals without explicit approval.

Keep custom Recipes code isolated.

### Documentation-first

Read official Agent Native documentation and generated project guidance, particularly `AGENTS.md`.

Verify commands and configuration against the installed version.

Do not invent undocumented APIs.

### Minimal customization

Content should remain as close to upstream as possible.

Recipes should be a focused presentation layer over Content.

Avoid building a separate recipe storage system.

### Incremental development

Establish a working baseline before adding functionality.

Use Git commits at stable milestones.

Avoid speculative refactoring.

### Resource conservation

JSM HQ sandboxes have previously experienced memory and storage pressure.

Only one development server should run at a time.

Do not run concurrent browser automation sessions.

Avoid Playwright unless explicitly authorized.

Prefer static analysis, unit tests, HTTP tests, and manual user verification.

Do not create multiple unnecessary sandboxes.

Do not run destructive cleanup commands without approval.

### Deployment conservation

Netlify credits are limited.

Do not enable continuous deployment.

Do not trigger remote builds without approval.

Use local builds and tests.

Prepare production configuration before deploying.

## Model configuration

Use OpenRouter as the model provider.

Prefer a cost-effective DeepSeek model if compatible with Agent Native's required capabilities.

Verify:

- API compatibility.
- Tool calling.
- Structured output.
- Streaming support where needed.

Store credentials in server-side environment variables.

Never expose or commit API keys.

## Database

Use a local PostgreSQL-compatible development environment where supported.

Use the project's official Drizzle schema and migrations.

Prepare for migration to Supabase PostgreSQL.

Avoid development-only schema patterns that would complicate production migration.

## Authentication

Use the framework's supported Better Auth integration.

Google OAuth is the intended production authentication method.

The eventual application should support two authorized household users.

## Application functionality

### Content

Official document storage and editing.

### Recipes

A focused interface for reading recipes stored in Content.

### Scaling

The user selects a scaling factor and explicitly requests scaling.

The agent generates a context-aware scaled recipe.

The original recipe remains unchanged.

### Interface

Desktop: original and scaled recipes side by side.

Mobile: vertically stacked panels.

## Approval boundaries

Dwight and Jim may implement and test locally within assigned branches. Michael reviews and integrates their work; Michael is not the default implementation owner.

Explicit approval is required before:

- Netlify deployment.
- Paid service creation.
- Production database modification.
- Shared infrastructure changes.
- Destructive cleanup.
- Unsupported framework modifications.

## Definition of done

A locally functioning application where the user can browse recipes, open a recipe, request AI scaling, and view the original and scaled versions, with all changes reviewed and integrated by Michael.

The initial development milestone requires a validated path to Netlify deployment with Supabase persistence and Better Auth authentication. The full v2.0 release requires a separately approved deployment and verified HTTPS access, persistence and authorized household login. See `plan.md` for phase gates and ownership.