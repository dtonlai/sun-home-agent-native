import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// @ts-ignore The executable .mjs script is exercised directly by Vitest.
import * as seedScript from "./seed-test-recipes.mjs";

const {
  APPROVAL_CONFIRMATION,
  SAMPLE_PAGES,
  runSeedAction,
  validateLocalDatabaseTarget,
} = seedScript;

const TEST_DB_PATH = resolve(
  process.env.TMPDIR ?? "/tmp",
  `seed-test-recipes-${process.pid}-${Date.now()}.pglite`,
);
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const TEST_OWNER = "recipe-seed-test@example.local";
let seedAction: typeof import("../actions/seed-test-recipes.js").default;
let getDbExec: typeof import("@agent-native/core/db").getDbExec;
let listDocuments: typeof import("../actions/list-documents.js").default;
let getDocument: typeof import("../actions/get-document.js").default;
let updateDocument: typeof import("../actions/update-document.js").default;
let recipesSpaceId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const plugin = (await import("../server/plugins/db.js")).default;
  await plugin(undefined as never);
  ({ getDbExec } = await import("@agent-native/core/db"));
  await getDbExec().execute(`CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at BIGINT NOT NULL,
    identity_authority TEXT, identity_id TEXT
  )`);
  await getDbExec().execute(`CREATE TABLE IF NOT EXISTS org_members (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, joined_at BIGINT NOT NULL,
    federation_removal_pending_at BIGINT
  )`);
  seedAction = (await import("../actions/seed-test-recipes.js")).default;
  listDocuments = (await import("../actions/list-documents.js")).default;
  getDocument = (await import("../actions/get-document.js")).default;
  updateDocument = (await import("../actions/update-document.js")).default;
}, 60000);

afterAll(async () => {
  const { rmSync } = await import("node:fs");
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  rmSync(TEST_DB_PATH, { recursive: true, force: true });
});

async function asTestOwner<T>(run: () => Promise<T>) {
  const { runWithRequestContext } = await import("@agent-native/core/server");
  return runWithRequestContext({ userEmail: TEST_OWNER }, run);
}

describe("seed:test-recipes safeguards", () => {
  it("accepts a single local PGlite target and refuses remote or conflicting URLs", () => {
    expect(
      validateLocalDatabaseTarget({
        cwd: "/tmp/recipe-seed",
        env: { DATABASE_URL: "pglite:./isolated" },
        files: [],
      }),
    ).toMatchObject({ kind: "pglite", path: "/tmp/recipe-seed/isolated" });
    expect(() =>
      validateLocalDatabaseTarget({
        cwd: "/tmp/recipe-seed",
        env: { DATABASE_URL: "postgres://example.invalid/db" },
        files: [],
      }),
    ).toThrow(/not local PGlite storage/);
    expect(() =>
      validateLocalDatabaseTarget({
        cwd: "/tmp/recipe-seed",
        env: {
          DATABASE_URL: "pglite:./one",
          APP_DATABASE_URL: "pglite:./two",
        },
        files: [],
      }),
    ).toThrow(/different targets/);
    expect(() =>
      validateLocalDatabaseTarget({
        cwd: "/tmp/recipe-seed",
        env: {},
        files: [],
      }),
    ).toThrow(/refusing the default data\/pglite database/);
  });

  it("rejects a remote database URL in an env file even when process env uses PGlite", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "recipe-seed-env-"));
    try {
      writeFileSync(
        resolve(cwd, ".env"),
        "DATABASE_URL=postgres://remote.invalid/app\n",
      );
      expect(() =>
        validateLocalDatabaseTarget({
          cwd,
          env: { DATABASE_URL: "pglite:./isolated" },
          files: [".env"],
        }),
      ).toThrow(/not local PGlite storage/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("invokes the batch action once after validating the database target", () => {
    const spawn = vi.fn(() => ({ status: 0, error: undefined }));
    runSeedAction({
      argv: [],
      cwd: "/tmp/isolated-recipe-seed",
      env: { DATABASE_URL: "pglite:./db" },
      files: [],
      spawn,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      "pnpm",
      [
        "action",
        "seed-test-recipes",
        JSON.stringify({ confirmation: APPROVAL_CONFIRMATION }),
      ],
      expect.objectContaining({
        cwd: "/tmp/isolated-recipe-seed",
        stdio: "inherit",
      }),
    );
  });

  it("never invokes the action for a remote target", () => {
    const spawn = vi.fn();
    expect(() =>
      runSeedAction({
        cwd: "/tmp/isolated-recipe-seed",
        env: { DATABASE_URL: "postgres://remote.invalid/db" },
        files: [],
        spawn,
      }),
    ).toThrow(/not local PGlite storage/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("requires CLI approval and refuses non-CLI callers", () => {
    expect(seedAction.needsApproval).toBe(true);
    expect(seedAction.agentTool).toBe(false);
    expect(seedAction.mcpTool).toBe(false);
  });

  it.each(["http", "frontend", "tool", "mcp"] as const)(
    "rejects %s callers before writing",
    async (caller) => {
      await expect(
        seedAction.run({ confirmation: APPROVAL_CONFIRMATION }, { caller }),
      ).rejects.toThrow("Not authorized");
    },
  );

  it("keeps the fixtures visibly marked with owner-shaped group labels", () => {
    expect(SAMPLE_PAGES).toHaveLength(2);
    expect(
      SAMPLE_PAGES.every((sample: { content: string }) =>
        sample.content.includes("LOCAL TEST SAMPLE"),
      ),
    ).toBe(true);
    expect(SAMPLE_PAGES[0].content).toContain("\nSauce\n");
    expect(SAMPLE_PAGES[0].content).toContain("\nStir Fry\n");
    expect(SAMPLE_PAGES[1].content).toContain("\nBeef\n");
    expect(SAMPLE_PAGES[1].content).toContain("\nBeef Marinade\n");
    expect(SAMPLE_PAGES[1].content).toContain("Components\nBeef + Marinade");
  });

  it("creates both samples in isolated PGlite, preserves edits, and skips them on rerun", async () => {
    const createDocument = (await import("../actions/create-document.js"))
      .default;
    const originalCreateDocumentRun = createDocument.run;
    const createDocumentRun = vi.spyOn(createDocument, "run");
    createDocumentRun
      .mockImplementationOnce((input, context) =>
        originalCreateDocumentRun(input, context),
      )
      .mockImplementationOnce(async () => {
        throw new Error("Injected failure after the first sample write.");
      });

    await expect(
      asTestOwner(() =>
        seedAction.run(
          { confirmation: APPROVAL_CONFIRMATION },
          { caller: "cli" },
        ),
      ),
    ).rejects.toThrow("Injected failure after the first sample write.");
    createDocumentRun.mockRestore();

    const recovered = await asTestOwner(() =>
      seedAction.run(
        { confirmation: APPROVAL_CONFIRMATION },
        { caller: "cli" },
      ),
    );
    expect(recovered).toEqual({ created: 1, skipped: 1 });

    const spaces = await asTestOwner(async () => {
      const listSpaces = (await import("../actions/list-content-spaces.js"))
        .default;
      return await listSpaces.run({});
    });
    const recipesSpaces = spaces.spaces.filter(
      (space) => space.name === "Recipes",
    );
    expect(recipesSpaces).toHaveLength(1);
    recipesSpaceId = recipesSpaces[0].id;

    const firstRead = await asTestOwner(async () => {
      const input = {
        limit: 100,
        offset: 0,
        spaceId: recipesSpaceId,
        documentType: "page" as const,
      };
      return await listDocuments.run(input);
    });
    expect(firstRead.documents.map((page) => page.title)).toEqual(
      expect.arrayContaining(
        SAMPLE_PAGES.map((page: { title: string }) => page.title),
      ),
    );
    const padPage = firstRead.documents.find(
      (page) => page.title === SAMPLE_PAGES[0].title,
    );
    expect(padPage?.id).toBe(SAMPLE_PAGES[0].id);

    const { parseRecipeContent } =
      await import("../app/components/recipes/recipe-content.js");
    const padDocument = await asTestOwner(
      async () => await getDocument.run({ id: SAMPLE_PAGES[0].id }),
    );
    const beefDocument = await asTestOwner(
      async () => await getDocument.run({ id: SAMPLE_PAGES[1].id }),
    );
    expect(
      parseRecipeContent(padDocument.content).components.map(
        (part) => part.name,
      ),
    ).toEqual(["Sauce", "Stir Fry"]);
    expect(parseRecipeContent(padDocument.content).servings).toBe(
      "2-3 servings",
    );
    expect(
      parseRecipeContent(beefDocument.content).components.map(
        (part) => part.name,
      ),
    ).toEqual(["Beef", "Beef Marinade"]);
    expect(parseRecipeContent(beefDocument.content).servings).toBe(
      "4-5 servings",
    );

    await asTestOwner(async () => {
      await updateDocument.run({
        id: SAMPLE_PAGES[0].id,
        content: `${SAMPLE_PAGES[0].content}\n\nOwner edit to keep`,
      });
    });
    const rerun = await asTestOwner(() =>
      seedAction.run(
        { confirmation: APPROVAL_CONFIRMATION },
        { caller: "cli" },
      ),
    );
    expect(rerun).toEqual({ created: 0, skipped: 2 });

    const secondRead = await asTestOwner(async () => {
      const input = {
        limit: 100,
        offset: 0,
        spaceId: recipesSpaceId,
        documentType: "page" as const,
      };
      return await listDocuments.run(input);
    });
    const pageIds = secondRead.documents
      .filter((page) => page.title?.startsWith("[LOCAL TEST SAMPLE]"))
      .map((page) => page.id);
    expect(pageIds).toHaveLength(2);
    const preserved = await asTestOwner(
      async () => await getDocument.run({ id: SAMPLE_PAGES[0].id }),
    );
    expect(preserved.content).toContain("Owner edit to keep");
  }, 60000);
});
