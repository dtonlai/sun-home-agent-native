# Local development

This repository is already the standalone Sun Home Agent Native app. Clone it
directly; do not create a separate Content app.

## Requirements

- Git
- Node.js 22.22 or later
- Corepack, included with Node.js, to enable the pnpm version pinned by the
  repository

## Clone and install

From a terminal, run:

```sh
git clone https://github.com/dtonlai/sun-home-agent-native.git
cd sun-home-agent-native
corepack enable
pnpm install
```

## Shared Supabase database setup

Local app runs use the same shared PostgreSQL database as the household. Core
0.226.0 otherwise falls back to local PGlite when `DATABASE_URL` is absent or
invalid, so the database plugin now fails before app startup in that case.
Keep the URL in an untracked `.env.local` file; do not put credentials in the
repository or a `VITE_` variable.

In Supabase, copy the transaction pooler connection string from **Connect** and
set it as `DATABASE_URL`. Core's Postgres driver supports the transaction
pooler for app traffic. Add a direct or session connection as
`DATABASE_URL_UNPOOLED` for the explicit migration command. The transaction
pooler does not support prepared statements and is not the migration
connection. Do not configure `SUN_HOME_AGENT_NATIVE_DATABASE_URL` to point to a
different database: Core gives that app-specific variable precedence over
`DATABASE_URL`.

Create `.env.local` from `.env.example`:

```sh
cp .env.example .env.local
```

Then edit `.env.local` and set:

```dotenv
DATABASE_URL=postgresql://...transaction-pooler-url...
DATABASE_URL_UNPOOLED=postgresql://...direct-or-session-url...
BETTER_AUTH_SECRET=<private-random-value>
BETTER_AUTH_URL=http://localhost:3000
```

For Better Auth, generate a private `BETTER_AUTH_SECRET` (for example,
`openssl rand -hex 32`). Local development can use Core's **Continue as local
dev** sign-in. To test the two household Google accounts, create/configure a
Google OAuth client with the local origin and callback
`http://localhost:3000/_agent-native/auth/ba/callback/google`, then add its
identity-only credentials as `GOOGLE_SIGN_IN_CLIENT_ID` and
`GOOGLE_SIGN_IN_CLIENT_SECRET`. Both household members must sign in separately;
Content sharing permissions still govern access. Do not set `AUTH_DISABLED`
for household testing because it runs requests as one shared user.

## Login, migration, and startup

Install dependencies, then run the explicit migration command once before
starting against a database that has not yet been prepared:

```sh
pnpm install
pnpm migrate:shared
pnpm dev
```

`migrate:shared` runs Core 0.226.0 framework release migrations, Creative
Context migrations, and the Content and Content-source migration lists inside
Core's `withMigrationRuntime()`. Core selects `DATABASE_URL_UNPOOLED` (or the
app-prefixed unpooled equivalent) for the migration connection when set; the
command validates both the runtime and migration targets as PostgreSQL before
connecting. Do not run `drizzle-kit push`: this app's reviewed handwritten
Content migration lists are the schema owner. Application startup runs no
schema migrations or database repairs. A pending or missing schema is fixed
by reviewing and explicitly running the migration command, not by restarting
the app.

Open the local URL printed by `pnpm dev` and sign in with the selected local or
Google account. Stop the server with `Ctrl+C` when finished. To roll back an
application change, stop local runs and return to the prior reviewed commit.
Migrations are additive and have no automatic down path; if a migration has
already changed shared data, use the Supabase backup or point-in-time recovery
process approved by the database owner. Do not manually drop or edit tables.

The optional AI provider keys in `.env.example` are not required for startup.
All secrets stay in `.env.local`, which is ignored by Git.
