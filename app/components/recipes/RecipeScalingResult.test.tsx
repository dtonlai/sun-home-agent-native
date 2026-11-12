// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  source: {
    data: {
      id: "recipe-1",
      spaceId: "recipes-space",
      title: "Original Soup",
      content:
        "## Ingredients\n- Original tomatoes\n\n## Instructions\nSimmer.",
    } as unknown,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  queries: [] as Array<{
    name: string;
    args: Record<string, unknown> | undefined;
  }>,
  rendererRegistrations: [] as Array<Record<string, unknown>>,
}));

vi.mock("@agent-native/core/client/hooks", () => ({
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : undefined,
  useSession: () => ({
    session: { email: "alice@example.com", orgId: "org-1" },
  }),
  useActionQuery: (name: string, args: Record<string, unknown> | undefined) => {
    fixture.queries.push({ name, args });
    return fixture.source;
  },
}));

vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (key: string, values?: Record<string, string>) =>
    key.replace(
      /\{\{(\w+)\}\}/g,
      (_match, name: string) => values?.[name] ?? name,
    ),
}));

vi.mock("@agent-native/toolkit/app/chat/agentkit-chat", () => ({
  registerActionChatRenderer: (registration: Record<string, unknown>) => {
    fixture.rendererRegistrations.push(registration);
    return vi.fn();
  },
}));

vi.mock("@/components/recipes/RecipeMarkdown", () => ({
  RecipeMarkdown: ({ content }: { content: string }) => (
    <pre data-testid="source-markdown">{content}</pre>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

import { RecipeScalingResult } from "@/components/recipes/RecipeScalingResult";

const result = {
  documentId: "recipe-1",
  factor: 1.5,
  recipe: {
    servings: "6",
    ingredientLines: ["6 tomatoes"],
    instructions: ["Simmer gently until tender."],
    adjustmentExplanations: ["Keep the cooking time close to the original."],
  },
};

function render(root: Root, resultJson: unknown = result) {
  act(() =>
    root.render(
      <RecipeScalingResult
        context={{
          toolName: "submit-recipe-scaling-result",
          args: {},
          resultJson,
          isRunning: false,
        }}
      />,
    ),
  );
}

describe("RecipeScalingResult", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fixture.source.data = {
      id: "recipe-1",
      spaceId: "recipes-space",
      title: "Original Soup",
      content:
        "## Ingredients\n- Original tomatoes\n\n## Instructions\nSimmer.",
    };
    fixture.source.isLoading = false;
    fixture.source.isError = false;
    fixture.source.isFetching = false;
    fixture.source.error = null;
    fixture.queries = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("registers the action renderer and reads the original by stable ID", () => {
    render(root);

    expect(fixture.rendererRegistrations).toHaveLength(1);
    expect(fixture.rendererRegistrations[0]).toMatchObject({
      id: "sun-home.recipe-scaling-result",
      renderer: "sun-home.recipe-scaling-result",
    });
    expect(fixture.queries).toContainEqual({
      name: "get-document",
      args: { id: "recipe-1" },
    });
    expect(container.textContent).toContain("Original Soup");
    expect(container.textContent).toContain("Original tomatoes");
    expect(container.textContent).toContain("6 tomatoes");
    expect(container.textContent).toContain(
      "Keep the cooking time close to the original.",
    );
  });

  it("labels the comparison regions and stacks them below desktop width", () => {
    render(root);

    const original = container.querySelector<HTMLElement>(
      '[aria-label="recipes.originalRecipe"]',
    );
    const scaled = container.querySelector<HTMLElement>(
      '[aria-label="recipes.scaledRecipe"]',
    );
    expect(original?.textContent).toContain("recipes.originalRecipe");
    expect(scaled?.textContent).toContain("recipes.scaledRecipe");
    expect(container.firstElementChild?.className).toContain("md:grid-cols-2");
  });

  it("renders legacy flat ingredient and instruction sections", () => {
    render(root);

    expect(
      container.querySelector('[aria-label="recipes.ingredients"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="recipes.instructions"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("6 tomatoes");
    expect(container.textContent).toContain("Simmer gently until tender.");
  });

  it("renders grouped-only results under their component names", () => {
    render(root, {
      ...result,
      recipe: {
        servings: null,
        ingredientLines: [],
        instructions: [],
        components: [
          {
            name: "Tomato Sauce",
            ingredientLines: ["2 cups crushed tomatoes"],
            instructions: ["Cook until thick."],
          },
          {
            name: "Finish",
            ingredientLines: ["Fresh basil"],
            instructions: [],
          },
        ],
        adjustmentExplanations: [],
      },
    });

    const sauce = container.querySelector('[aria-label="Tomato Sauce"]');
    expect(sauce?.textContent).toContain("2 cups crushed tomatoes");
    expect(sauce?.textContent).toContain("Cook until thick.");
    expect(
      container.querySelector('[aria-label="Finish"]')?.textContent,
    ).toContain("Fresh basil");
    expect(
      container.querySelector('[aria-label="recipes.ingredients"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="recipes.instructions"]'),
    ).toBeNull();
  });

  it("keeps flat lines and grouped lines together in mixed results", () => {
    render(root, {
      ...result,
      recipe: {
        ...result.recipe,
        ingredientLines: ["1 tablespoon oil"],
        instructions: [],
        components: [
          {
            name: "Marinade",
            ingredientLines: ["1 teaspoon ginger"],
            instructions: ["Whisk together."],
          },
        ],
      },
    });

    expect(container.textContent).toContain("1 tablespoon oil");
    expect(container.textContent).toContain("1 teaspoon ginger");
    expect(container.textContent).toContain("Whisk together.");
    expect(
      container.querySelector('[aria-label="recipes.instructions"]'),
    ).toBeNull();
  });

  it("rejects malformed optional components at the renderer boundary", () => {
    render(root, {
      ...result,
      recipe: {
        ...result.recipe,
        components: [
          { name: "Broken", ingredientLines: ["valid"], instructions: [3] },
        ],
      },
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "recipes.scaledResultInvalid",
    );
    expect(fixture.queries).toHaveLength(0);
  });
});
