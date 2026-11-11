import { defineAction } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

// @ts-ignore The CLI script and action share fixtures and the local DB guard.
import * as seedScript from "../scripts/seed-test-recipes.mjs";
import createContentSpace from "./create-content-space.js";
import createDocument from "./create-document.js";
import listContentSpaces from "./list-content-spaces.js";
import listDocuments from "./list-documents.js";

const { APPROVAL_CONFIRMATION, SAMPLE_PAGES, validateLocalDatabaseTarget } =
  seedScript;
const PAGE_SIZE = 100;
const SPACE_REQUEST_ID = "local-seed-test-recipes-v1";
const [PAD_SEE_EW, BEEF_CHOW_FUN] = SAMPLE_PAGES;
const LOCAL_SAMPLE_TITLES = SAMPLE_PAGES.map(
  (page: { title: string }) => page.title,
);

if (!PAD_SEE_EW || !BEEF_CHOW_FUN) {
  throw new Error("Sample fixtures are incomplete.");
}

async function allPages(spaceId: string) {
  const pages: Array<{ id: string; title: string | null }> = [];
  let offset = 0;
  for (let count = 0; count < 1000; count += 1) {
    const input = {
      limit: PAGE_SIZE,
      offset,
      spaceId,
      documentType: "page" as const,
    };
    const result = await listDocuments.run(input);
    pages.push(...result.documents);
    if (!result.pagination.hasMore) return pages;
    const next = result.pagination.nextOffset;
    if (typeof next !== "number" || next <= offset) {
      throw new Error(
        "Content returned invalid pagination; no sample pages were created.",
      );
    }
    offset = next;
  }
  throw new Error(
    "Recipes contains too many pages to verify safely; no sample pages were created.",
  );
}

function assertWritableSpace(space: { role: string } | undefined) {
  if (!space || !["owner", "editor"].includes(space.role)) {
    throw new Error(
      "The exact Recipes space is not writable by this caller; no sample pages were created.",
    );
  }
}

async function createSamplePage(
  sample: { id: string; title: string; content: string },
  spaceId: string,
) {
  const input = {
    id: sample.id,
    spaceId,
    title: sample.title,
    content: sample.content,
    contextModeOverride: "off" as const,
  };
  return createDocument.run(input);
}

async function seedTestRecipes() {
  validateLocalDatabaseTarget();
  if (!getRequestUserEmail()) {
    throw new Error(
      "Sign in through the local Content app or set AGENT_USER_EMAIL before running this action.",
    );
  }

  const listed = await listContentSpaces.run({});
  if (listed.sourceMode !== "database") {
    throw new Error(
      "Content is not database-backed; no sample data was written.",
    );
  }
  const matches = listed.spaces.filter((space) => space.name === "Recipes");
  if (matches.length > 1) {
    throw new Error(
      "Multiple authorized spaces are named Recipes; refusing an ambiguous target.",
    );
  }
  let space = matches[0];
  if (space) assertWritableSpace(space);

  let pages = space ? await allPages(space.id) : [];
  let missing = SAMPLE_PAGES.filter(
    (sample: { title: string }) =>
      !pages.some((page) => page.title === sample.title),
  );
  if (space && missing.length === 0) {
    return { created: 0, skipped: LOCAL_SAMPLE_TITLES.length };
  }

  if (!space) {
    const input = {
      name: "Recipes",
      requestId: SPACE_REQUEST_ID,
    };
    const created = await createContentSpace.run(input);
    const recheck = await listContentSpaces.run({});
    const afterCreate = recheck.spaces.filter(
      (candidate) => candidate.name === "Recipes",
    );
    if (afterCreate.length !== 1 || afterCreate[0].id !== created.spaceId) {
      throw new Error("The newly created Recipes space could not be verified.");
    }
    space = afterCreate[0];
    assertWritableSpace(space);
    pages = await allPages(space.id);
    missing = SAMPLE_PAGES.filter(
      (sample: { title: string }) =>
        !pages.some((page) => page.title === sample.title),
    );
  }

  let createdCount = 0;
  if (missing.includes(PAD_SEE_EW)) {
    const result = await createSamplePage(PAD_SEE_EW, space.id);
    if (result.spaceId !== space.id || result.title !== PAD_SEE_EW.title) {
      throw new Error(`Could not verify creation of ${PAD_SEE_EW.title}.`);
    }
    createdCount += 1;
  }
  if (missing.includes(BEEF_CHOW_FUN)) {
    const result = await createSamplePage(BEEF_CHOW_FUN, space.id);
    if (result.spaceId !== space.id || result.title !== BEEF_CHOW_FUN.title) {
      throw new Error(`Could not verify creation of ${BEEF_CHOW_FUN.title}.`);
    }
    createdCount += 1;
  }

  const verified = await allPages(space.id);
  const absent = LOCAL_SAMPLE_TITLES.filter(
    (title: string) => !verified.some((page) => page.title === title),
  );
  if (absent.length > 0) {
    throw new Error(
      `Post-write verification is missing marked sample page(s): ${absent.join(", ")}.`,
    );
  }
  return {
    created: createdCount,
    skipped: LOCAL_SAMPLE_TITLES.length - createdCount,
  };
}

export default defineAction({
  description:
    "Seed the two clearly marked Pad See Ew and Beef Chow Fun placeholder pages in a local PGlite Recipes space. Requires interactive CLI approval; existing pages are never changed.",
  schema: z.object({ confirmation: z.literal(APPROVAL_CONFIRMATION) }),
  outputSchema: z.object({ created: z.number(), skipped: z.number() }),
  needsApproval: true,
  authorize: (_args, context) => context?.caller === "cli",
  agentTool: false,
  mcpTool: false,
  run: seedTestRecipes,
});
