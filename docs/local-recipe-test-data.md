# Local recipe sample data

Use the sample-data command when you want to inspect the Recipes viewer before
adding household recipes. Set an explicit local PGlite target for both the app
and the seed command. The examples below use the repository's local database
directory; if your app uses another PGlite path, use that same explicit path in
both terminals. Do not omit `DATABASE_URL`.

In the first terminal, start the app against the selected local database:

```bash
DATABASE_URL='pglite:data/pglite' pnpm dev
```

Sign in through the local Welcome screen. In a second terminal, select the same
database and the email used for the local Content session. The command asks for
approval before writing; answer `y` or `yes` to continue.

```bash
DATABASE_URL='pglite:data/pglite' AGENT_USER_EMAIL='you@example.com' pnpm seed:test-recipes
```

If a `.env` file sets a database URL, make sure it points to the same explicit
PGlite target. The script refuses empty, conflicting, remote, or ambiguous
database settings.

The command creates or reuses the exact `Recipes` space visible to the signed-in
local caller and adds ordinary pages named `[LOCAL TEST SAMPLE] Pad See Ew` and
`[LOCAL TEST SAMPLE] Beef Chow Fun`. Existing pages with those exact titles are
left untouched on reruns. The page bodies are marked placeholders based on the
owner's format examples; they are not complete recipes. The two page writes are
not atomic: if the first succeeds and the second fails, rerun the command to
create the missing sample. It skips the page already created and preserves its
content.

The action is hidden from agent and MCP tool discovery. The local CLI bridge
requires it to be registered in the action route, so a caller gate rejects
regular HTTP and frontend callers before the seed handler runs.

The action does not overwrite or delete Content and does not call an external
provider. To remove these examples, use Content manually after reviewing the
marked titles. The Content action runner must have a local caller identity. If
it reports that there is no authenticated user, set `AGENT_USER_EMAIL` to the
email used for your local Content session.

## Sandbox-only validation

The PR validation used this disposable PGlite directory inside the agent
sandbox. It is not the owner's local database. The dev runtime and seed command
must use the same target:

```bash
DATABASE_URL='pglite:/tmp/sun-home-recipes-pglite.0I8UnQ/db' pnpm dev
DATABASE_URL='pglite:/tmp/sun-home-recipes-pglite.0I8UnQ/db' AGENT_USER_EMAIL='demo@example.local' pnpm seed:test-recipes
```
