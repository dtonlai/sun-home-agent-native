# Local recipe sample data

Use the sample-data command when you want to inspect the Recipes viewer before
adding household recipes. For a disposable validation run, use the explicitly
approved temporary PGlite path below; don't omit `DATABASE_URL` or fall back to
the repository's default `data/pglite` database.

```bash
export DATABASE_URL='pglite:/tmp/sun-home-recipes-pglite.0I8UnQ/db'
pnpm dev
```

Keep the app running and sign in through its local Welcome screen. In a second
terminal, set the same target before invoking the seed command:

```bash
export DATABASE_URL='pglite:/tmp/sun-home-recipes-pglite.0I8UnQ/db'
pnpm seed:test-recipes
```

The command checks that the app targets one local PGlite database, then shows
which marked pages it plans to create and requires interactive approval before
writing. It uses the registered Content operations, creates or reuses the one exact
`Recipes` space visible to the signed-in local caller, and adds ordinary pages
named `[LOCAL TEST SAMPLE] Pad See Ew` and
`[LOCAL TEST SAMPLE] Beef Chow Fun`. Existing pages with those exact titles are
left untouched on reruns. The page bodies are marked placeholders based on the
owner's format examples; they are not complete recipes.

The script refuses PostgreSQL, remote, empty, conflicting, or otherwise
ambiguous database URL settings. It never overwrites or deletes Content and
does not call an external provider. To remove these examples, use Content
manually after reviewing the marked titles.

The Content action runner must have a local caller identity. If it reports that
there is no authenticated user, set `AGENT_USER_EMAIL` to the email used for
your local Content session and rerun the command.
