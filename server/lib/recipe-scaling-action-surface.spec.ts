import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getDbExec } from "@agent-native/core/db";
import {
  createThread,
  getThread,
  runWithRequestContext,
} from "@agent-native/core/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_PATH = join(
  tmpdir(),
  `sun-home-recipe-scaling-${process.pid}-${Date.now()}.pglite`,
);
const OWNER = "recipe-owner@example.com";
const OUTSIDER = "recipe-outsider@example.com";
const SPACE_MEMBER = "recipe-space-member@example.com";
const DOCUMENT_ID = "recipe-scaling-page";
const THREAD_ID = "recipe-scaling-thread";
const OUTSIDER_THREAD_ID = "recipe-scaling-outsider-thread";
const SPACE_MEMBER_THREAD_ID = "recipe-scaling-space-member-thread";
const SPACE_ORG_ID = "recipe-scaling-space-org";
const SPACE_DOCUMENT_ID = "recipe-scaling-space-page";
const FACTOR = 1.5;

let getDb: typeof import("../db/index.js").getDb;
let schema: typeof import("../db/schema.js");
let spaceId: string;
let resolveSurface: typeof import("./recipe-scaling-action-surface.js").resolveRecipeScalingActionSurface;

const asUser = <T>(userEmail: string, run: () => Promise<T>) =>
  runWithRequestContext({ userEmail }, run);

function scalingDetails(overrides: Record<string, unknown> = {}) {
  return {
    ownerEmail: OWNER,
    orgId: null,
    threadId: THREAD_ID,
    mode: "act" as const,
    actionScope: {
      kind: "sun-home-recipe-scaling",
      ownerEmail: OWNER,
      documentId: DOCUMENT_ID,
      factor: FACTOR,
    },
    availableActionNames: [
      "get-document",
      "submit-recipe-scaling-result",
      "update-document",
    ],
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.DATABASE_URL = `pglite:${TEST_DB_PATH}`;
  const dbModule = await import("../db/index.js");
  getDb = dbModule.getDb;
  schema = dbModule.schema;
  const dbPlugin = (await import("../plugins/db.js")).default;
  await dbPlugin(undefined as never);
  await getDbExec().execute(`CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL, created_at BIGINT NOT NULL,
    identity_authority TEXT, identity_id TEXT
  )`);
  await getDbExec().execute(`CREATE TABLE IF NOT EXISTS org_members (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, joined_at BIGINT NOT NULL,
    federation_removal_pending_at BIGINT
  )`);
  await getDbExec().execute({
    sql: "INSERT INTO organizations (id, name, created_by, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    args: [SPACE_ORG_ID, "Recipe Space", OWNER, Date.now()],
  });
  await getDbExec().execute({
    sql: "INSERT INTO org_members (id, org_id, email, role, joined_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
    args: [
      "recipe-space-member",
      SPACE_ORG_ID,
      SPACE_MEMBER,
      "member",
      Date.now(),
    ],
  });
  const { organizationContentSpaceId } =
    await import("../../actions/_content-spaces.js");
  spaceId = organizationContentSpaceId(SPACE_ORG_ID);
  const now = new Date().toISOString();
  await getDb().insert(schema.contentSpaces).values({
    id: spaceId,
    name: "Recipe Space",
    kind: "organization",
    ownerEmail: OWNER,
    orgId: SPACE_ORG_ID,
    filesDatabaseId: "recipe-scaling-space-files",
    createdBy: OWNER,
    createdAt: now,
    updatedAt: now,
  });
  await createThread(OWNER, { id: THREAD_ID });
  await createThread(OUTSIDER, { id: OUTSIDER_THREAD_ID });
  await createThread(SPACE_MEMBER, { id: SPACE_MEMBER_THREAD_ID });
  const { resolveRecipeScalingActionSurface } =
    await import("./recipe-scaling-action-surface.js");
  resolveSurface = resolveRecipeScalingActionSurface;
}, 60_000);

beforeEach(async () => {
  await getDb().delete(schema.documents);
  await getDb().insert(schema.documents).values({
    id: DOCUMENT_ID,
    ownerEmail: OWNER,
    title: "Recipe scaling fixture",
    content: "Ingredients\n- 1 cup flour",
    bodyRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

afterAll(() => {
  rmSync(TEST_DB_PATH, { force: true, recursive: true });
});

describe("recipe scaling action surface", () => {
  it("binds the authenticated caller, accessible source, factor, and exact read/result allowlist", async () => {
    const surface = await asUser(OWNER, () => resolveSurface(scalingDetails()));
    expect(surface).toEqual({
      allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
      actionScope: {
        kind: "sun-home-recipe-scaling",
        ownerEmail: OWNER,
        documentId: DOCUMENT_ID,
        factor: FACTOR,
      },
    });
  });

  it("documents that a caller-supplied scope can authorize an ordinary owned thread", async () => {
    const surface = await asUser(OWNER, async () => {
      const thread = await getThread(THREAD_ID);
      expect(thread?.scope).toBeNull();
      return resolveSurface({
        ownerEmail: OWNER,
        threadId: THREAD_ID,
        mode: "act",
        // Core 0.226.0 passes this request-body field to the app resolver;
        // there is no server-created Scale-turn state in this contract yet.
        actionScope: {
          kind: "sun-home-recipe-scaling",
          ownerEmail: OWNER,
          documentId: DOCUMENT_ID,
          factor: FACTOR,
        },
        availableActionNames: [
          "get-document",
          "submit-recipe-scaling-result",
          "update-document",
        ],
      });
    });

    expect(surface).toMatchObject({
      allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
      actionScope: {
        kind: "sun-home-recipe-scaling",
        documentId: DOCUMENT_ID,
        factor: FACTOR,
      },
    });
  });

  it("authorizes a document through its Content space without owner or direct-user share access", async () => {
    const now = new Date().toISOString();
    await getDb().insert(schema.documents).values({
      id: SPACE_DOCUMENT_ID,
      spaceId,
      ownerEmail: OWNER,
      orgId: SPACE_ORG_ID,
      visibility: "org",
      title: "Shared space recipe",
      content: "Ingredients\n- 2 apples",
      bodyRevision: 1,
      createdAt: now,
      updatedAt: now,
    });
    const directShares = await getDb()
      .select({ id: schema.documentShares.id })
      .from(schema.documentShares)
      .where(eq(schema.documentShares.resourceId, SPACE_DOCUMENT_ID));
    expect(directShares).toEqual([]);

    const surface = await asUser(SPACE_MEMBER, async () => {
      const { resolveContentSpaceAccess } =
        await import("../../actions/_content-space-access.js");
      await expect(resolveContentSpaceAccess(spaceId)).resolves.toMatchObject({
        role: "viewer",
      });
      return resolveSurface(
        scalingDetails({
          ownerEmail: SPACE_MEMBER,
          threadId: SPACE_MEMBER_THREAD_ID,
          actionScope: {
            kind: "sun-home-recipe-scaling",
            ownerEmail: SPACE_MEMBER,
            documentId: SPACE_DOCUMENT_ID,
            factor: 0.5,
          },
        }),
      );
    });
    expect(surface).toMatchObject({
      allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
      actionScope: {
        ownerEmail: SPACE_MEMBER,
        documentId: SPACE_DOCUMENT_ID,
        factor: 0.5,
      },
    });
  });

  it("rejects forged caller identity, malformed scope, and plan mode", async () => {
    await expect(
      asUser(OUTSIDER, () => resolveSurface(scalingDetails())),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_unavailable" });
    await expect(
      asUser(OWNER, () =>
        resolveSurface(
          scalingDetails({
            actionScope: { kind: "sun-home-recipe-scaling", factor: FACTOR },
          }),
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_binding_invalid" });
    await expect(
      asUser(OWNER, () => resolveSurface(scalingDetails({ mode: "plan" }))),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_turn_invalid" });
  });

  it("rejects missing or inaccessible documents and threads not owned by the caller", async () => {
    await expect(
      asUser(OWNER, () =>
        resolveSurface(
          scalingDetails({
            actionScope: {
              ...scalingDetails().actionScope,
              documentId: "missing-recipe",
            },
          }),
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser(OUTSIDER, () =>
        resolveSurface(
          scalingDetails({
            ownerEmail: OUTSIDER,
            threadId: OUTSIDER_THREAD_ID,
            actionScope: {
              ...scalingDetails().actionScope,
              ownerEmail: OUTSIDER,
            },
          }),
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser(OUTSIDER, () =>
        resolveSurface(
          scalingDetails({
            ownerEmail: OUTSIDER,
            threadId: "another-users-thread",
            actionScope: {
              ...scalingDetails().actionScope,
              ownerEmail: OUTSIDER,
            },
          }),
        ),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_thread_unavailable" });
  });

  it("fails closed if either required action is missing from the registry", async () => {
    await expect(
      asUser(OWNER, () =>
        resolveSurface(
          scalingDetails({
            availableActionNames: ["get-document", "update-document"],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_actions_unavailable",
    });
  });

  it("does not claim ordinary chat or comment scopes", async () => {
    await expect(
      resolveSurface({
        ownerEmail: OWNER,
        actionScope: { kind: "content-comment-ai", requestId: "request" },
      }),
    ).resolves.toBeNull();
  });
});
