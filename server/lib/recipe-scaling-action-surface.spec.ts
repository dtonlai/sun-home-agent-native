import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bindRecipeScalingGrant: vi.fn(),
  getRequestUserEmail: vi.fn(),
  getThread: vi.fn(),
  resolveDocumentAccess: vi.fn(),
}));

vi.mock("@agent-native/core/server", () => ({
  getRequestUserEmail: mocks.getRequestUserEmail,
  getThread: mocks.getThread,
}));

vi.mock("../../actions/_document-access.js", () => ({
  resolveDocumentAccess: mocks.resolveDocumentAccess,
}));

vi.mock("./recipe-scaling-grants.js", () => ({
  bindRecipeScalingGrant: mocks.bindRecipeScalingGrant,
}));

import { resolveRecipeScalingActionSurface } from "./recipe-scaling-action-surface.js";

const OWNER = "recipe-owner@example.com";
const DOCUMENT_ID = "recipe-scaling-page";
const THREAD_ID = "recipe-scaling-thread";
const GRANT_TOKEN = "grant-token-with-at-least-forty-characters-1234567890";
const FACTOR = 1.5;

function scalingDetails(overrides: Record<string, unknown> = {}) {
  return {
    ownerEmail: OWNER,
    orgId: null,
    threadId: THREAD_ID,
    requestedTurnId: "scale-turn-1",
    queuedMessageId: "scale-message-1",
    mode: "act" as const,
    actionScope: {
      kind: "sun-home-recipe-scaling",
      grantToken: GRANT_TOKEN,
    },
    availableActionNames: [
      "get-document",
      "submit-recipe-scaling-result",
      "update-document",
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getRequestUserEmail.mockReturnValue(OWNER);
  mocks.getThread.mockResolvedValue({ id: THREAD_ID, ownerEmail: OWNER });
  mocks.bindRecipeScalingGrant.mockResolvedValue({
    documentId: DOCUMENT_ID,
    factor: FACTOR,
  });
  mocks.resolveDocumentAccess.mockResolvedValue({
    resource: { trashedAt: null },
  });
});

describe("recipe scaling action surface", () => {
  it("binds the grant to the caller, thread, turn, message, and accessible source", async () => {
    const surface = await resolveRecipeScalingActionSurface(scalingDetails());

    expect(surface).toEqual({
      allowedActionNames: ["get-document", "submit-recipe-scaling-result"],
      actionScope: {
        kind: "sun-home-recipe-scaling",
        grantToken: GRANT_TOKEN,
      },
    });
    expect(mocks.bindRecipeScalingGrant).toHaveBeenCalledWith(GRANT_TOKEN, {
      ownerEmail: OWNER,
      threadId: THREAD_ID,
      turnId: "scale-turn-1",
      messageId: "scale-message-1",
    });
    expect(mocks.resolveDocumentAccess).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it("keeps Content writes out and requires both scaling actions", async () => {
    const surface = await resolveRecipeScalingActionSurface(scalingDetails());
    expect(surface?.allowedActionNames).not.toContain("update-document");

    await expect(
      resolveRecipeScalingActionSurface(
        scalingDetails({ availableActionNames: ["get-document"] }),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_actions_unavailable" });
    await expect(
      resolveRecipeScalingActionSurface(
        scalingDetails({
          availableActionNames: ["submit-recipe-scaling-result"],
        }),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_actions_unavailable" });
  });

  it("rejects invalid scopes, callers, and non-active turns", async () => {
    await expect(
      resolveRecipeScalingActionSurface(
        scalingDetails({
          actionScope: {
            kind: "sun-home-recipe-scaling",
            grantToken: "short-token",
          },
        }),
      ),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_binding_invalid" });

    mocks.getRequestUserEmail.mockReturnValue("recipe-outsider@example.com");
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails()),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_scope_unavailable" });

    mocks.getRequestUserEmail.mockReturnValue(OWNER);
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails({ mode: "plan" })),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_turn_invalid" });
  });

  it("rejects missing or unowned threads, unavailable grants, and inaccessible or trashed sources", async () => {
    mocks.getThread.mockResolvedValueOnce(null);
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails()),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_thread_unavailable" });

    mocks.getThread.mockResolvedValueOnce({
      id: THREAD_ID,
      ownerEmail: "recipe-outsider@example.com",
    });
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails()),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_thread_unavailable" });

    mocks.getThread.mockResolvedValue({ id: THREAD_ID, ownerEmail: OWNER });
    mocks.bindRecipeScalingGrant.mockRejectedValueOnce(
      Object.assign(new Error("Grant unavailable"), {
        errorCode: "recipe_scaling_grant_unavailable",
      }),
    );
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails()),
    ).rejects.toMatchObject({ errorCode: "recipe_scaling_grant_unavailable" });

    mocks.bindRecipeScalingGrant.mockResolvedValue({
      documentId: DOCUMENT_ID,
      factor: FACTOR,
    });
    mocks.resolveDocumentAccess.mockResolvedValueOnce(null);
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails()),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_document_unavailable",
    });

    mocks.resolveDocumentAccess.mockResolvedValueOnce({
      resource: { trashedAt: "2026-11-13T00:00:00.000Z" },
    });
    await expect(
      resolveRecipeScalingActionSurface(scalingDetails()),
    ).rejects.toMatchObject({
      errorCode: "recipe_scaling_document_unavailable",
    });
  });

  it("does not claim ordinary chat or comment scopes", async () => {
    await expect(
      resolveRecipeScalingActionSurface({
        ownerEmail: OWNER,
        actionScope: { kind: "content-comment-ai", requestId: "request" },
      }),
    ).resolves.toBeNull();
  });
});
