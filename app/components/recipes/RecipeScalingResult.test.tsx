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

function render(root: Root) {
  act(() =>
    root.render(
      <RecipeScalingResult
        context={{
          toolName: "submit-recipe-scaling-result",
          args: {},
          resultJson: result,
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
});
