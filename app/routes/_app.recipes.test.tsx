// @vitest-environment happy-dom

import { act, type ComponentType, type ReactNode } from "react";
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
  scaleMutation: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  sendCalls: [] as Array<Record<string, unknown>>,
  chatRun: {
    isGenerating: false,
    stopReason: null as "stopped" | null,
    observedRun: false,
  },
  rendererRegistrations: [] as Array<Record<string, unknown>>,
  toolRendererRegistrations: [] as Array<Record<string, unknown>>,
}));

vi.mock("@agent-native/core/client/hooks", () => ({
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : undefined,
  useActionMutation: (name: string) => {
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
  useAgentChatGenerating: () => [
    fixture.chatRun.isGenerating,
    (input: Record<string, unknown>) => {
      fixture.sendCalls.push(input);
      fixture.chatRun.isGenerating = true;
      fixture.chatRun.stopReason = null;
      fixture.chatRun.observedRun = false;
      return "tab-1";
    },
    fixture.chatRun.stopReason,
    fixture.chatRun.observedRun,
  ],
}));

vi.mock("@agent-native/toolkit/app/chat/agentkit-chat", () => ({
  registerActionChatRenderer: (registration: Record<string, unknown>) => {
    fixture.rendererRegistrations.push(registration);
    return vi.fn();
  },
}));

vi.mock("@agent-native/toolkit/app/chat/chat", () => ({
  registerToolRenderer: (registration: Record<string, unknown>) => {
    fixture.toolRendererRegistrations.push(registration);
    return vi.fn();
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
    fixture.scaleMutation.mutateAsync.mockReset();
    fixture.scaleMutation.mutateAsync.mockResolvedValue({
      grantToken: "grant-token-with-at-least-forty-characters-1234567890",
      documentId: "recipe-stable-id",
      factor: 2,
      expiresAt: "2026-11-10T00:00:00.000Z",
    });
    fixture.scaleMutation.isPending = false;
    fixture.sendCalls = [];
    fixture.chatRun = {
      isGenerating: false,
      stopReason: null,
      observedRun: false,
    };
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

    const select = container.querySelector("select");
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
      expect.objectContaining({
        message: "recipes.scalingRequest",
        context: JSON.stringify({ documentId: "recipe-stable-id", factor: 2 }),
        actionScope: {
          kind: "sun-home-recipe-scaling",
          grantToken: "grant-token-with-at-least-forty-characters-1234567890",
        },
        submit: true,
        submitMessageId: expect.any(String),
        openSidebar: true,
      }),
    ]);
  });

  it("shows in-progress state while the scoped agent run is active", () => {
    setupSelectedRecipe();
    render(root);

    const scaleButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("recipes.scale"),
    );
    act(() => {
      scaleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    render(root);

    expect(container.textContent).toContain("recipes.scalingInProgress");
    expect(container.textContent).toContain("recipes.scale");
  });

  it("shows the comparison only after the completed result action succeeds", async () => {
    setupSelectedRecipe();
    render(root);
    const scaleButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("recipes.scale"),
    );
    await act(async () => {
      scaleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("recipes.scaledRecipe");

    const actionRegistration = fixture.rendererRegistrations[0];
    const runRegistration = fixture.toolRendererRegistrations[0];
    const ActionRenderer = actionRegistration?.Component as ComponentType<{
      context: Record<string, unknown>;
    }>;
    const RunRenderer = runRegistration?.Component as ComponentType<{
      context: Record<string, unknown>;
    }>;
    await act(async () =>
      root.render(
        <>
          <RecipesLibrary />
          <RunRenderer
            context={{
              toolName: "submit-recipe-scaling-result",
              args: { documentId: "recipe-stable-id", factor: 2 },
              resultJson: undefined,
              isRunning: true,
              isActiveTail: true,
              widgetId: "tool-live:chat-ui",
              status: "running",
            }}
          />
          <ActionRenderer
            context={{
              toolName: "submit-recipe-scaling-result",
              args: { documentId: "recipe-stable-id", factor: 2 },
              resultJson: {
                documentId: "recipe-stable-id",
                factor: 2,
                recipe: {
                  servings: "8",
                  ingredientLines: ["8 tomatoes"],
                  instructions: ["Simmer."],
                  adjustmentExplanations: [],
                },
              },
              isRunning: false,
              widgetId: "tool-live:chat-ui",
              status: "completed",
            }}
          />
        </>,
      ),
    );
    expect(container.textContent).toContain("recipes.scaledRecipe");
    expect(container.textContent).toContain("8 tomatoes");
    expect(container.textContent).toContain("4 tomatoes");

    const scaleChoice = container.querySelector("select");
    act(() => {
      if (!scaleChoice) return;
      scaleChoice.value = "1.5";
      scaleChoice.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("recipes.scaledRecipe");
  });

  it("offers retry after a run stops without a validated result", async () => {
    setupSelectedRecipe();
    render(root);
    const scaleButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("recipes.scale"),
    );
    await act(async () => {
      scaleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    fixture.chatRun.isGenerating = false;
    fixture.chatRun.observedRun = true;
    fixture.chatRun.stopReason = "stopped";
    render(root);

    expect(container.textContent).toContain("recipes.scalingResultUnavailable");
    expect(container.textContent).toContain("recipes.retry");
    expect(container.textContent).not.toContain("recipes.scaledRecipe");
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
