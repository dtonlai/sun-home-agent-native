// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  spaces: {
    data: { spaces: [] as Array<Record<string, unknown>> },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  pages: new Map<number, Record<string, unknown>>(),
  document: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  recipeDatabases: {
    data: {
      databases: [] as Array<Record<string, unknown>>,
      pagination: undefined as
        | { hasMore: boolean; nextOffset: number | null }
        | undefined,
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  recipeDatabase: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  recipeItems: {
    data: {
      items: [] as Array<Record<string, unknown>>,
      pagination: {
        offset: 0,
        limit: 100,
        totalItems: 0,
        returnedItems: 0,
        hasMore: false,
      },
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  searchDocuments: {
    data: {
      documents: [] as Array<Record<string, unknown>>,
      pagination: { hasMore: false, nextOffset: null as number | null },
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  cuisineMetadataSearch: {
    data: {
      documents: [] as Array<Record<string, unknown>>,
      pagination: { hasMore: false, nextOffset: null as number | null },
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  search: "",
  listCalls: [] as Array<{ args: Record<string, unknown>; enabled: boolean }>,
  searchCalls: [] as Array<{ args: Record<string, unknown>; enabled: boolean }>,
  collectionCalls: [] as Array<{
    args: Record<string, unknown>;
    enabled: boolean;
  }>,
  documentCalls: [] as Array<Record<string, unknown>>,
  scaleMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  createMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  sendCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@agent-native/core/client/hooks", () => ({
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : undefined,
  useActionMutation: (name: string) => {
    if (name === "create-recipe") return fixture.createMutation;
    if (name !== "start-recipe-scaling") {
      throw new Error(`Unexpected action mutation ${name}`);
    }
    return fixture.scaleMutation;
  },
  useSession: () => ({
    session: { email: "alice@example.com", orgId: "org-1" },
  }),
  useActionQuery: (
    name: string,
    args: Record<string, unknown> | undefined,
    options: { enabled?: boolean } = {},
  ) => {
    if (name === "list-content-spaces") return fixture.spaces;
    if (name === "get-document") {
      fixture.documentCalls.push(args ?? {});
      return fixture.document;
    }
    if (name === "list-content-databases") return fixture.recipeDatabases;
    if (name === "get-content-database") return fixture.recipeDatabase;
    if (name === "query-content-database-items") {
      fixture.collectionCalls.push({
        args: args ?? {},
        enabled: options.enabled !== false,
      });
      const query = args?.tableQuery as
        | {
            search: string;
            filters: Array<{
              key: string;
              value: string;
              operator: "equals" | "contains";
            }>;
          }
        | undefined;
      const items = fixture.recipeItems.data.items as Array<{
        document: { id: string; title: string | null };
        properties: Array<{
          definition: { id: string; name: string };
          value: unknown;
        }>;
      }>;
      const filteredItems = items.filter((item) => {
        const values = item.properties.map((property) =>
          Array.isArray(property.value)
            ? property.value.join(" ")
            : String(property.value ?? ""),
        );
        const text = [item.document.title ?? "", ...values]
          .join(" ")
          .toLocaleLowerCase();
        return (
          (!query?.search || text.includes(query.search.toLocaleLowerCase())) &&
          (query?.filters ?? []).every((filter) => {
            const property = item.properties.find(
              (candidate) => candidate.definition.id === filter.key,
            );
            const value = Array.isArray(property?.value)
              ? property.value.join(" ")
              : String(property?.value ?? "");
            return filter.operator === "equals"
              ? value.toLocaleLowerCase() === filter.value.toLocaleLowerCase()
              : value
                  .toLocaleLowerCase()
                  .includes(filter.value.toLocaleLowerCase());
          })
        );
      });
      const offset = Number(args?.offset ?? 0);
      const limit = Number(args?.limit ?? 100);
      const pageItems = filteredItems.slice(offset, offset + limit);
      return {
        ...fixture.recipeItems,
        data: {
          ...fixture.recipeItems.data,
          items: pageItems,
          pagination: {
            offset,
            limit,
            totalItems: filteredItems.length,
            returnedItems: pageItems.length,
            hasMore: offset + pageItems.length < filteredItems.length,
          },
        },
      };
    }
    if (name === "search-documents") {
      fixture.searchCalls.push({
        args: args ?? {},
        enabled: options.enabled !== false,
      });
      return args?.query === "Cuisine"
        ? fixture.cuisineMetadataSearch
        : fixture.searchDocuments;
    }
    if (name === "list-documents") {
      fixture.listCalls.push({
        args: args ?? {},
        enabled: options.enabled !== false,
      });
      return (
        fixture.pages.get(Number(args?.offset ?? 0)) ?? {
          data: {
            documents: [],
            pagination: { hasMore: false, nextOffset: null },
          },
          isLoading: false,
          isError: false,
          isFetching: false,
          error: null,
          refetch: vi.fn(),
        }
      );
    }
    throw new Error(`Unexpected action query ${name}`);
  },
}));

vi.mock("@agent-native/core/client/agent-chat", () => ({
  sendToAgentChat: (input: Record<string, unknown>) => {
    fixture.sendCalls.push(input);
  },
}));

vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (key: string, values?: Record<string, string>) =>
    key.replace(
      /\{\{(\w+)\}\}/g,
      (_match, name: string) => values?.[name] ?? name,
    ),
}));

vi.mock("@agent-native/toolkit/app-shell", () => ({
  useSetPageTitle: vi.fn(),
}));

vi.mock("react-router", () => ({
  Link: ({ to, children, ...props }: Record<string, unknown>) => (
    <a href={String(to)} {...props}>
      {children as ReactNode}
    </a>
  ),
  useSearchParams: () => [new URLSearchParams(fixture.search), vi.fn()],
}));

vi.mock("@/components/recipes/RecipeMarkdown", () => ({
  RecipeMarkdown: ({ content }: { content: string }) => (
    <pre data-testid="recipe-markdown">{content}</pre>
  ),
}));

vi.mock("@/components/QueryErrorState", () => ({
  QueryErrorState: () => <p>query error</p>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, ...props }: Record<string, unknown>) =>
    asChild ? children : <button {...props}>{children as ReactNode}</button>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

import { RecipesLibrary } from "@/components/recipes/RecipesLibrary";
import { navigationStateForLocation } from "@/hooks/use-navigation-state";
import { messagesByLocale } from "@/i18n-data";

function render(root: Root) {
  act(() => root.render(<RecipesLibrary />));
}

function setValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  act(() => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function clickButton(button: HTMLButtonElement | undefined) {
  act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function last<T>(items: T[]) {
  return items[items.length - 1];
}

function setupSelectedRecipe() {
  fixture.search = "?spaceId=caller-space-id&recipeId=recipe-stable-id";
  fixture.spaces.data = {
    spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
  };
  fixture.pages.set(0, {
    data: {
      documents: [{ id: "recipe-stable-id", title: "Tomato Soup" }],
      pagination: { hasMore: false, nextOffset: null },
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  });
  fixture.document.data = {
    id: "recipe-stable-id",
    spaceId: "caller-space-id",
    title: "Tomato Soup",
    content:
      "Servings: 4\n\n## Ingredients\n- 4 tomatoes\n\n## Method\nSimmer.",
  };
}

describe("Recipes library", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture.spaces.data = { spaces: [] };
    fixture.spaces.isLoading = false;
    fixture.spaces.isError = false;
    fixture.spaces.isFetching = false;
    fixture.spaces.error = null;
    fixture.pages.clear();
    fixture.document.data = undefined;
    fixture.document.isLoading = false;
    fixture.document.isError = false;
    fixture.document.isFetching = false;
    fixture.document.error = null;
    fixture.recipeDatabases.data = { databases: [], pagination: undefined };
    fixture.recipeDatabases.isLoading = false;
    fixture.recipeDatabases.isError = false;
    fixture.recipeDatabases.isFetching = false;
    fixture.recipeDatabases.error = null;
    fixture.recipeDatabase.data = undefined;
    fixture.recipeDatabase.isLoading = false;
    fixture.recipeDatabase.isError = false;
    fixture.recipeDatabase.isFetching = false;
    fixture.recipeDatabase.error = null;
    fixture.recipeItems.data = {
      items: [],
      pagination: {
        offset: 0,
        limit: 100,
        totalItems: 0,
        returnedItems: 0,
        hasMore: false,
      },
    };
    fixture.recipeItems.isLoading = false;
    fixture.recipeItems.isError = false;
    fixture.recipeItems.isFetching = false;
    fixture.recipeItems.error = null;
    fixture.searchDocuments.data = {
      documents: [],
      pagination: { hasMore: false, nextOffset: null },
    };
    fixture.cuisineMetadataSearch.data = {
      documents: [],
      pagination: { hasMore: false, nextOffset: null },
    };
    fixture.searchDocuments.isLoading = false;
    fixture.searchDocuments.isError = false;
    fixture.searchDocuments.isFetching = false;
    fixture.searchDocuments.error = null;
    fixture.search = "";
    fixture.listCalls = [];
    fixture.searchCalls = [];
    fixture.collectionCalls = [];
    fixture.documentCalls = [];
    fixture.scaleMutation.mutateAsync.mockReset();
    fixture.scaleMutation.mutateAsync.mockResolvedValue({
      grantToken: "grant-token-with-at-least-forty-characters-1234567890",
      documentId: "recipe-stable-id",
      factor: 2,
      expiresAt: "2026-11-10T00:00:00.000Z",
    });
    fixture.scaleMutation.isPending = false;
    fixture.createMutation.mutateAsync.mockReset();
    fixture.createMutation.mutateAsync.mockResolvedValue({
      itemId: "new-item",
      documentId: "new-recipe",
      urlPath: "/page/new-recipe",
      receiptId: "new-receipt",
      idempotency: {
        key: "create-intent",
        result: "applied",
        payloadDigest: "payload-digest",
      },
      readback: {
        verified: true,
        title: "New recipe",
        propertyValues: { Tags: '["weeknight"]' },
        bodyHash: "body-hash",
      },
    });
    fixture.createMutation.isPending = false;
    fixture.sendCalls = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows setup guidance without provisioning a Recipes space", () => {
    fixture.spaces.data = { spaces: [{ id: "space-other", name: "Personal" }] };
    render(root);

    expect(container.textContent).toContain("recipes.spaceMissingTitle");
    expect(container.textContent).toContain("recipes.spaceSetupInstructions");
    const contentLink =
      container.querySelector<HTMLAnchorElement>('a[href="/home"]');
    expect(contentLink?.textContent).toBe("recipes.openContent");
    const recipeMessages = messagesByLocale["en-US"]?.recipes;
    expect(recipeMessages?.spaceMissingDescription).toContain(
      'workspace (space) named exactly "Recipes"',
    );
    expect(recipeMessages?.spaceMissingDescription).toContain(
      'A page titled "Recipes" inside another workspace does not count.',
    );
    expect(recipeMessages?.spaceSetupInstructions).toContain(
      "workspace selector in the sidebar, choose New workspace",
    );
    expect(recipeMessages?.spaceSetupInstructions).toContain(
      'name it exactly "Recipes", then create ordinary recipe pages inside',
    );
    expect(recipeMessages?.spaceSetupInstructions).toContain(
      "Return to /recipes",
    );
    expect(recipeMessages?.openContent).toBe("Go to Content");
    expect(fixture.listCalls[fixture.listCalls.length - 1]).toEqual({
      args: expect.objectContaining({
        documentType: "page",
        spaceId: "",
      }),
      enabled: false,
    });
  });

  it("lists authorized recipe pages with URL-addressable selection links", () => {
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [{ id: "recipe-stable-id", title: "Tomato Soup" }],
        pagination: { hasMore: false, nextOffset: null },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    render(root);

    const recipeLink = container.querySelector<HTMLAnchorElement>(
      'a[href*="recipeId=recipe-stable-id"]',
    );
    expect(recipeLink).not.toBeNull();
    expect(recipeLink?.getAttribute("href")).toContain(
      "spaceId=caller-space-id",
    );
    expect(recipeLink?.textContent).toContain("Tomato Soup");
    expect(fixture.listCalls[fixture.listCalls.length - 1]?.args).toEqual({
      limit: 100,
      offset: 0,
      spaceId: "caller-space-id",
      documentType: "page",
    });
  });

  it("searches complete recipe bodies and collection properties beyond loaded previews", () => {
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [
          {
            id: "soup-row",
            title: "Tomato Soup",
            contentPreview:
              "Tomato Soup Ingredients 4 tomatoes, 1 tsp salt Method Simmer until tender...",
          },
          {
            id: "loaded-legacy",
            title: "Family Roast",
            contentPreview: "Family Roast Ingredients potatoes Method roast...",
          },
        ],
        pagination: { hasMore: false, nextOffset: null },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    fixture.recipeDatabases.data = {
      databases: [
        {
          databaseId: "recipes-database",
          documentId: "recipes-database-document",
          spaceId: "caller-space-id",
          title: "Recipe collection",
          description: "",
        },
      ],
      pagination: { hasMore: false, nextOffset: null },
    };
    fixture.recipeDatabase.data = {
      database: {
        spaceId: "caller-space-id",
        viewConfig: { activeViewId: "recipe-form", views: [] },
      },
      mutationContract: {
        target: {
          spaceId: "caller-space-id",
          databaseId: "recipes-database",
          databaseDocumentId: "recipes-database-document",
        },
        schemaRevision: "schema-1",
        properties: [
          { id: "cuisine-id", name: "Cuisine", type: "text" },
          { id: "tags-id", name: "Tags", type: "text" },
        ],
      },
    };
    fixture.recipeItems.data = {
      items: [
        {
          document: { id: "soup-row", title: "Tomato Soup" },
          properties: [
            {
              definition: { id: "cuisine-id", name: "Cuisine" },
              value: "Italian",
            },
            {
              definition: { id: "tags-id", name: "Tags" },
              value: '["weeknight","vegetarian"]',
            },
          ],
        },
        {
          document: { id: "bread-row", title: "Sourdough" },
          properties: [
            {
              definition: { id: "cuisine-id", name: "Cuisine" },
              value: "French",
            },
            {
              definition: { id: "tags-id", name: "Tags" },
              value: '["baking","vegetarian"]',
            },
          ],
        },
        ...Array.from({ length: 100 }, (_, index) => ({
          document: {
            id: `soup-row-${index + 2}`,
            title: `Tomato Soup ${index + 2}`,
          },
          properties: [
            {
              definition: { id: "cuisine-id", name: "Cuisine" },
              value: "Italian",
            },
            {
              definition: { id: "tags-id", name: "Tags" },
              value: '["weeknight","vegetarian"]',
            },
          ],
        })),
      ],
      pagination: {
        offset: 0,
        limit: 100,
        totalItems: 102,
        returnedItems: 100,
        hasMore: true,
      },
    };
    fixture.searchDocuments.data = {
      documents: [
        {
          id: "unloaded-legacy",
          title: "Family Bowl",
          snippet: "...Cuisine: Italian Tags: vegetarian...",
        },
        {
          id: "soup-row",
          title: "Tomato Soup",
          snippet: "...Cuisine: Italian Tags: vegetarian...",
        },
      ],
      pagination: { hasMore: true, nextOffset: 100 },
    };
    fixture.cuisineMetadataSearch.data = {
      documents: [
        {
          id: "legacy-italian",
          title: "Family Bowl",
          snippet: "...Cuisine: Italian Tags: vegetarian...",
        },
        {
          id: "legacy-british",
          title: "Family Roast",
          snippet: "...Cuisine: British Tags: family...",
        },
      ],
      pagination: { hasMore: false, nextOffset: null },
    };
    render(root);

    const search = container.querySelector<HTMLInputElement>(
      "#recipe-library-search",
    )!;
    setValue(search, "vegetarian");
    expect(
      [
        ...container.querySelectorAll<HTMLOptionElement>(
          "#recipe-cuisine-filter option",
        ),
      ].map((option) => option.value),
    ).toContain("British");
    expect(
      container.querySelector('[href*="recipeId=unloaded-legacy"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[href*="recipeId=soup-row"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[href*="recipeId=loaded-legacy"]'),
    ).toBeNull();
    expect(
      last(
        fixture.searchCalls.filter(({ args }) => args.query === "vegetarian"),
      )?.args,
    ).toEqual(
      expect.objectContaining({
        query: "vegetarian",
        spaceId: "caller-space-id",
        documentType: "page",
        offset: 0,
      }),
    );

    const cuisine = container.querySelector<HTMLSelectElement>(
      "#recipe-cuisine-filter",
    )!;
    setValue(cuisine, "Italian");
    expect(
      container.querySelector('[href*="recipeId=unloaded-legacy"]'),
    ).not.toBeNull();
    expect(container.querySelector('[href*="recipeId=bread-row"]')).toBeNull();
    const collectionQuery = last(fixture.collectionCalls)?.args.tableQuery as {
      filters: Array<{ key: string; value: string }>;
    };
    expect(collectionQuery.filters).toContainEqual(
      expect.objectContaining({ key: "cuisine-id", value: "Italian" }),
    );
    expect([...cuisine.options].map((option) => option.value)).toContain(
      "Italian",
    );
    setValue(search, "");
    setValue(cuisine, "");
    const tag =
      container.querySelector<HTMLInputElement>("#recipe-tag-filter")!;
    setValue(tag, "weeknight");
    const tagQuery = last(fixture.collectionCalls)?.args.tableQuery as {
      filters: Array<{ key: string; value: string }>;
    };
    expect(tagQuery.filters).toContainEqual(
      expect.objectContaining({ key: "tags-id", value: "weeknight" }),
    );
    const loadMore = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("recipes.loadMoreMatches"),
    );
    expect(loadMore).toBeDefined();
    clickButton(loadMore);
    expect(
      container.querySelector('[href*="recipeId=soup-row-101"]'),
    ).not.toBeNull();
    expect(
      fixture.collectionCalls.some(({ args }) => args.offset === 100),
    ).toBe(true);
    expect(
      last(fixture.searchCalls.filter(({ args }) => args.query !== "Cuisine"))
        ?.args.offset,
    ).toBe(100);
  });

  it("creates a recipe through the shared action and exposes its saved link", async () => {
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [],
        pagination: { hasMore: false, nextOffset: null },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    fixture.recipeDatabases.data = {
      databases: [
        {
          databaseId: "recipes-database",
          documentId: "recipes-database-document",
          spaceId: "caller-space-id",
          title: "Recipe collection",
          description: "",
        },
      ],
      pagination: { hasMore: false, nextOffset: null },
    };
    fixture.recipeDatabase.data = {
      database: {
        spaceId: "caller-space-id",
        viewConfig: {
          activeViewId: "recipe-form",
          views: [{ id: "recipe-form", type: "form" }],
        },
      },
      mutationContract: {
        target: {
          spaceId: "caller-space-id",
          databaseId: "recipes-database",
          databaseDocumentId: "recipes-database-document",
        },
        schemaRevision: "schema-1",
      },
    };
    render(root);

    const addRecipe = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "recipes.addRecipe",
    );
    expect(addRecipe?.disabled).toBe(false);
    clickButton(addRecipe);
    expect(container.textContent).toContain("recipes.recipeTitle");
    expect(container.textContent).toContain("recipes.ingredientGroups");

    const title = [...container.querySelectorAll("label")].find(
      (label) => label.textContent === "recipes.recipeTitle",
    );
    setValue(
      container.querySelector<HTMLInputElement>(`#${title?.htmlFor}`)!,
      "New recipe",
    );
    const fields = container.querySelectorAll<HTMLTextAreaElement>("textarea");
    for (const [field, value] of [
      [fields[0], "2 cups vegetables"],
      [fields[1], "Roast until tender."],
    ] as const) {
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        setter?.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
    expect(fixture.createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New recipe",
        target: {
          spaceId: "caller-space-id",
          databaseId: "recipes-database",
          databaseDocumentId: "recipes-database-document",
        },
        formViewId: "recipe-form",
        expectedSchemaRevision: "schema-1",
        ingredientGroups: [{ name: null, entries: ["2 cups vegetables"] }],
        instructionGroups: [{ name: null, entries: ["Roast until tender."] }],
      }),
    );
    expect(
      container.querySelector('a[href="/page/new-recipe"]'),
    ).not.toBeNull();

    const cancel = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "recipes.cancel",
    );
    clickButton(cancel);
    expect(container.textContent).not.toContain("recipes.recipeTitle");
  });

  it("follows the action pagination when loading more recipes", () => {
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [{ id: "recipe-1", title: "First recipe" }],
        pagination: { hasMore: true, nextOffset: 100 },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    fixture.pages.set(100, {
      data: {
        documents: [{ id: "recipe-2", title: "Second recipe" }],
        pagination: { hasMore: false, nextOffset: null },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    render(root);

    const loadMore = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("recipes.loadMore"),
    );
    expect(loadMore).toBeDefined();
    act(() =>
      loadMore?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(container.textContent).toContain("First recipe");
    expect(container.textContent).toContain("Second recipe");
    expect(
      fixture.listCalls.some(
        ({ args }) => args.spaceId === "caller-space-id" && args.offset === 100,
      ),
    ).toBe(true);
  });

  it("renders the selected saved document as read-only recipe sections", () => {
    fixture.search = "?spaceId=caller-space-id&recipeId=recipe-stable-id";
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [{ id: "recipe-stable-id", title: "Tomato Soup" }],
        pagination: { hasMore: false, nextOffset: null },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    fixture.document.data = {
      id: "recipe-stable-id",
      spaceId: "caller-space-id",
      title: "Tomato Soup",
      content:
        "Servings: 4\n\n## Ingredients\n- 4 tomatoes\n\n## Method\nSimmer until tender.",
    };
    render(root);

    expect(container.textContent).toContain("Tomato Soup");
    expect(container.textContent).toContain("recipes.servings");
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("recipes.ingredients");
    expect(container.textContent).toContain("4 tomatoes");
    expect(container.textContent).toContain("recipes.instructions");
    expect(container.textContent).toContain("Simmer until tender.");
    expect(fixture.documentCalls).toContainEqual({
      id: "recipe-stable-id",
    });
  });

  it("renders a listed ordinary page that also has database membership metadata", () => {
    setupSelectedRecipe();
    fixture.document.data = {
      id: "recipe-stable-id",
      spaceId: "caller-space-id",
      title: "Tomato Soup",
      content: "## Ingredients\n- 4 tomatoes",
      databaseMembership: { databaseId: "meal-plans" },
    };

    render(root);

    expect(container.textContent).toContain("Tomato Soup");
    expect(container.textContent).toContain("4 tomatoes");
    expect(container.textContent).not.toContain("recipes.recipeUnavailable");
  });

  it("loads a deep-link recipe directly without scanning later list pages", () => {
    fixture.search = "?spaceId=caller-space-id&recipeId=deep-linked-id";
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [{ id: "first-recipe", title: "First recipe" }],
        pagination: { hasMore: true, nextOffset: 100 },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    fixture.document.data = {
      id: "deep-linked-id",
      spaceId: "caller-space-id",
      title: "Deep linked recipe",
      content: "## Ingredients\n- Flour",
    };

    render(root);

    expect(container.textContent).toContain("Deep linked recipe");
    expect(fixture.documentCalls).toContainEqual({ id: "deep-linked-id" });
    expect(fixture.listCalls.some(({ args }) => args.offset === 100)).toBe(
      false,
    );
  });

  it("does not render a selected document from outside the Recipes space", () => {
    fixture.search = "?spaceId=caller-space-id&recipeId=private-document-id";
    fixture.spaces.data = {
      spaces: [{ id: "caller-space-id", name: "Recipes", orgId: null }],
    };
    fixture.pages.set(0, {
      data: {
        documents: [],
        pagination: { hasMore: false, nextOffset: null },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    fixture.document.data = {
      id: "private-document-id",
      spaceId: "another-space-id",
      title: "Private page title",
      content: "Private page body must not be shown.",
    };

    render(root);

    expect(container.textContent).toContain("recipes.recipeUnavailable");
    expect(container.textContent).not.toContain("Private page title");
    expect(container.textContent).not.toContain("Private page body");
    expect(
      [...container.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("recipes.scale"),
      ),
    ).toBe(false);
    expect(fixture.documentCalls).toContainEqual({ id: "private-document-id" });
  });

  it("changes scale selection locally without creating a grant or sending chat", () => {
    setupSelectedRecipe();
    render(root);

    const select = container.querySelector<HTMLSelectElement>(
      "#recipe-scale-choice",
    );
    expect(select).not.toBeNull();
    expect(
      [...(select?.querySelectorAll("option") ?? [])].map(
        (option) => option.value,
      ),
    ).toEqual(["0.5", "1", "1.5", "2", "custom"]);
    act(() => {
      if (!select) return;
      select.value = "1.5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(fixture.scaleMutation.mutateAsync).not.toHaveBeenCalled();
    expect(fixture.sendCalls).toEqual([]);
  });

  it("creates a grant and dispatches one visible scoped scaling request", async () => {
    setupSelectedRecipe();
    render(root);

    const scaleButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("recipes.scale"),
    );
    expect(scaleButton).toBeDefined();
    await act(async () => {
      scaleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fixture.scaleMutation.mutateAsync).toHaveBeenCalledWith({
      documentId: "recipe-stable-id",
      factor: 2,
    });
    expect(fixture.sendCalls).toEqual([
      {
        message: "recipes.scalingRequest",
        context: JSON.stringify({ documentId: "recipe-stable-id", factor: 2 }),
        actionScope: {
          kind: "sun-home-recipe-scaling",
          grantToken: "grant-token-with-at-least-forty-characters-1234567890",
        },
        submit: true,
        openSidebar: true,
      },
    ]);
  });

  it("does not dispatch when grant creation fails", async () => {
    setupSelectedRecipe();
    fixture.scaleMutation.mutateAsync.mockRejectedValueOnce(
      new Error("Grant creation failed"),
    );
    render(root);

    const scaleButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("recipes.scale"),
    );
    await act(async () => {
      scaleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fixture.scaleMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(fixture.sendCalls).toEqual([]);
    expect(container.textContent).toContain("Grant creation failed");
  });
});

describe("Recipes navigation context", () => {
  it("exposes the selected Content document through navigation state", () => {
    expect(
      navigationStateForLocation({
        pathname: "/recipes",
        searchParams: new URLSearchParams("recipeId=stable-content-id"),
      }),
    ).toEqual({ view: "recipes", documentId: "stable-content-id" });
  });
});
