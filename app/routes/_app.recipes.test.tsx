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
  search: "",
  listCalls: [] as Array<{ args: Record<string, unknown>; enabled: boolean }>,
  documentCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@agent-native/core/client/hooks", () => ({
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : undefined,
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

function render(root: Root) {
  act(() => root.render(<RecipesLibrary />));
}

describe("Recipes library", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
    fixture.search = "";
    fixture.listCalls = [];
    fixture.documentCalls = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows setup guidance without provisioning a Recipes space", () => {
    fixture.spaces.data = { spaces: [{ id: "space-other", name: "Personal" }] };
    render(root);

    expect(container.textContent).toContain("recipes.spaceMissingTitle");
    expect(container.textContent).toContain("recipes.spaceSetupInstructions");
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
    expect(fixture.documentCalls).toContainEqual({ id: "private-document-id" });
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
