// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rendererRegistrations: [] as Array<Record<string, unknown>>,
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

import {
  clearRecipeScalingResult,
  RecipeScalingComparison,
  RecipeScalingResult,
  useRecipeScalingResult,
} from "@/components/recipes/RecipeScalingResult";

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

function ResultObserver() {
  const value = useRecipeScalingResult();
  return <span data-testid="result-id">{value?.documentId ?? "empty"}</span>;
}

describe("RecipeScalingResult", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearRecipeScalingResult();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearRecipeScalingResult();
  });

  it("registers the public action renderer and publishes only a completed validated result", () => {
    act(() => root.render(<ResultObserver />));
    expect(fixture.rendererRegistrations[0]).toMatchObject({
      id: "sun-home.recipe-scaling-result",
      renderer: "sun-home.recipe-scaling-result",
    });

    act(() =>
      root.render(
        <>
          <ResultObserver />
          <RecipeScalingResult
            context={{
              toolName: "submit-recipe-scaling-result",
              args: {},
              resultJson: result,
              isRunning: false,
              status: "running",
            }}
          />
        </>,
      ),
    );
    expect(
      container.querySelector('[data-testid="result-id"]')?.textContent,
    ).toBe("empty");

    act(() =>
      root.render(
        <>
          <ResultObserver />
          <RecipeScalingResult
            context={{
              toolName: "submit-recipe-scaling-result",
              args: {},
              resultJson: result,
              isRunning: false,
              status: "completed",
            }}
          />
        </>,
      ),
    );
    expect(
      container.querySelector('[data-testid="result-id"]')?.textContent,
    ).toBe("recipe-1");
  });

  it("shows the source read-only beside the validated scaled recipe", () => {
    act(() =>
      root.render(
        <RecipeScalingComparison
          result={result}
          source={{
            id: "recipe-1",
            title: "Original Soup",
            content: "Original tomatoes",
          }}
        />,
      ),
    );

    expect(container.textContent).toContain("Original Soup");
    expect(container.textContent).toContain("Original tomatoes");
    expect(container.textContent).toContain("6 tomatoes");
    expect(container.textContent).toContain(
      "Keep the cooking time close to the original.",
    );
    expect(
      container.querySelector('[aria-label="recipes.originalRecipe"]'),
    ).not.toBeNull();
    expect(container.firstElementChild?.className).toContain("md:grid-cols-2");
  });
});
