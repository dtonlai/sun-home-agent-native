// @vitest-environment happy-dom

import {
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import type {
  CreateRecipeInput,
  CreateRecipeResult,
} from "@shared/recipe-creation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intent: CreateRecipeInput = {
  target: {
    spaceId: "recipes-space",
    databaseId: "recipes-database",
    databaseDocumentId: "recipes-database-document",
  },
  formViewId: "recipe-form",
  expectedSchemaRevision: "schema-1",
  idempotencyKey: "stable-create-intent",
  title: "Roasted vegetables",
  ingredientGroups: [{ name: "Vegetables", entries: ["2 carrots"] }],
  instructionGroups: [{ name: "Roast", entries: ["Roast until tender."] }],
  tags: ["weeknight"],
};

const result: CreateRecipeResult = {
  itemId: "recipe-row",
  documentId: "recipe-page",
  urlPath: "/page/recipe-page?databaseId=recipes-database",
  receiptId: "receipt-1",
  idempotency: {
    key: intent.idempotencyKey,
    result: "applied",
    payloadDigest: "payload-digest",
  },
  readback: {
    verified: true,
    title: intent.title,
    propertyValues: { Tags: '["weeknight"]' },
    bodyHash: "body-hash",
  },
};

function Probe() {
  const library = useActionQuery("list-content-spaces", undefined, {
    method: "GET",
    retry: false,
  });
  const create = useActionMutation("create-recipe");
  const save = async () => {
    try {
      const created = await create.mutateAsync(intent);
      document.querySelector("output")!.textContent = created.urlPath;
    } catch (error) {
      document.querySelector('[role="alert"]')!.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
  return (
    <>
      <output data-read-count={library.data ? "loaded" : "loading"}>
        {library.data ? "Library loaded" : "Loading library"}
      </output>
      <div role="alert" />
      <button type="button" onClick={() => void save()}>
        Save
      </button>
      <span>{create.isPending ? "Saving" : "Ready"}</span>
    </>
  );
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("create-recipe action mutation integration", () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let reads: number;
  let writes: Array<Record<string, unknown>>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    originalFetch = globalThis.fetch;
    reads = 0;
    writes = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), window.location.href).pathname;
        if (path.endsWith("/list-content-spaces")) {
          reads += 1;
          return new Response(JSON.stringify({ spaces: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (path.endsWith("/create-recipe")) {
          writes.push(
            JSON.parse(String(init?.body)) as Record<string, unknown>,
          );
          if (writes.length === 1) {
            return new Response(
              JSON.stringify({ error: "Temporary failure" }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw new Error(`Unexpected action path: ${path}`);
      }),
    );
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
    container.remove();
    vi.stubGlobal("fetch", originalFetch);
    vi.unstubAllGlobals();
  });

  it("retries the same create intent and refetches action queries on success", async () => {
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
    await flush();
    expect(reads).toBe(1);

    const save = container.querySelector("button")!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Temporary failure",
    );
    expect(reads).toBe(1);

    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    for (let attempt = 0; reads < 2 && attempt < 20; attempt += 1) {
      await flush();
    }

    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(intent);
    expect(writes[1]).toEqual(intent);
    expect(reads).toBe(2);
    expect(container.querySelector("output")?.textContent).toBe(result.urlPath);
  });
});
