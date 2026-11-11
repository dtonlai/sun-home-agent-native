#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const SAMPLE_PAGES = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    title: "[LOCAL TEST SAMPLE] Pad See Ew",
    content: `> LOCAL TEST SAMPLE — placeholder lines only; this is not the owner's full recipe.

Cuisine: Thai
Serving Size
2-3 servings

Components
Sauce + Stir Fry

Ingredients
Sauce
- [Sample sauce ingredient]
Stir Fry
- [Sample stir-fry ingredient]

Instructions
Sauce
- [Sample sauce instruction]
Stir Fry
- [Sample stir-fry instruction]

Source: Owner-provided recipe format example
Related links: [Sample link placeholder]`,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    title: "[LOCAL TEST SAMPLE] Beef Chow Fun",
    content: `> LOCAL TEST SAMPLE — placeholder lines only; this is not the owner's full recipe.

Cuisine: Cantonese
Serving Size: 4-5 servings

Components
Beef + Marinade

Ingredients
Beef
- [Sample beef ingredient]
Beef Marinade
- [Sample marinade ingredient]

Instructions
Beef
- [Sample beef instruction]
Beef Marinade
- [Sample marinade instruction]

Source: Owner-provided recipe format example
Related links: [Sample link placeholder]`,
  },
];

export const APPROVAL_CONFIRMATION =
  "Add marked Pad See Ew and Beef Chow Fun placeholders to the local Recipes space";

function parseEnv(text) {
  const values = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values.push([match[1], value]);
  }
  return values;
}

export function validateLocalDatabaseTarget({
  env = process.env,
  cwd = ROOT,
  files = [".env", ".env.local", ".env.development", ".env.development.local"],
} = {}) {
  const root = resolve(cwd);
  const entries = [];
  for (const file of files) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of parseEnv(readFileSync(path, "utf8"))) {
      if (/(^|_)DATABASE_URL(_UNPOOLED)?$/i.test(key)) {
        entries.push({ key, source: file, value });
      }
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (/(^|_)DATABASE_URL(_UNPOOLED)?$/i.test(key)) {
      entries.push({ key, source: "process environment", value: value ?? "" });
    }
  }
  if (entries.some(({ value }) => !String(value).trim())) {
    throw new Error(
      "A database URL variable is empty; refusing an ambiguous target.",
    );
  }
  if (entries.length === 0) {
    throw new Error(
      "DATABASE_URL must explicitly target local PGlite storage; refusing the default data/pglite database.",
    );
  }

  const targets = entries.map(({ key, source, value }) => {
    const text = String(value).trim();
    if (!/^pglite:/i.test(text)) {
      throw new Error(
        `${key} from ${source} is not local PGlite storage; refusing to write.`,
      );
    }
    const location = text.slice(text.indexOf(":") + 1);
    if (!location || location.startsWith("//") || /[?#]/.test(location)) {
      throw new Error(
        `${key} from ${source} has an ambiguous local database target.`,
      );
    }
    return isAbsolute(location) ? resolve(location) : resolve(root, location);
  });
  if (new Set(targets).size !== 1) {
    throw new Error(
      "Database URL settings point to different targets; refusing an ambiguous write.",
    );
  }
  return { kind: "pglite", path: targets[0] };
}

export function runSeedAction({
  env = process.env,
  cwd = ROOT,
  spawn = spawnSync,
} = {}) {
  validateLocalDatabaseTarget({ env, cwd });
  const child = spawn(
    "pnpm",
    [
      "action",
      "seed-test-recipes",
      JSON.stringify({ confirmation: APPROVAL_CONFIRMATION }),
    ],
    {
      cwd: resolve(cwd),
      env,
      stdio: "inherit",
    },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `The seed action exited with status ${child.status ?? "unknown"}.`,
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    if (process.argv.slice(2).length > 0) {
      throw new Error(
        "This command takes no arguments; it always asks before writing.",
      );
    }
    runSeedAction();
  } catch (error) {
    console.error(
      `[seed:test-recipes] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
