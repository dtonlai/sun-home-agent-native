// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rendererRegistrations: [] as Array<Record<string, unknown>>,
  toolRendererRegistrations: [] as Array<Record<string, unknown>>,
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

vi.mock("@agent-native/toolkit/app/chat/chat", () => ({
  registerToolRenderer: (registration: Record<string, unknown>) => {
    fixture.toolRendererRegistrations.push(registration);
    return vi.fn();
  },
}));

vi.mock("@/components/recipes/RecipeMarkdown", () => ({
  RecipeMarkdown: ({ content }: { content: string }) => (
    <pre data-testid="source-markdown">{content}</pre>
  ),
}));

import {
  beginRecipeScalingRequest,
  clearRecipeScalingResult,
  createRecipeScalingViewId,
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

function ResultObserver({ viewId }: { viewId: number }) {
  const value = useRecipeScalingResult(viewId, "recipe-1", 1.5);
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
    const viewId = createRecipeScalingViewId();
    beginRecipeScalingRequest({
      viewId,
      requestId: "submit-current",
      documentId: "recipe-1",
      factor: 1.5,
    });
    act(() => root.render(<ResultObserver viewId={viewId} />));
    expect(fixture.rendererRegistrations[0]).toMatchObject({
      id: "sun-home.recipe-scaling-result",
      renderer: "sun-home.recipe-scaling-result",
    });
    expect(fixture.toolRendererRegistrations[0]).toMatchObject({
      id: "sun-home.recipe-scaling-result-progress",
      match: "submit-recipe-scaling-result",
    });

    act(() =>
      root.render(
        <>
          <RecipeScalingResult
            context={{
              toolName: "submit-recipe-scaling-result",
              args: { documentId: "recipe-1", factor: 1.5 },
              resultJson: undefined,
              isRunning: true,
              isActiveTail: true,
              widgetId: "tool-current:chat-ui",
              status: "running",
            }}
          />
          <ResultObserver viewId={viewId} />
        </>,
      ),
    );
    expect(
      container.querySelector('[data-testid="result-id"]')?.textContent,
    ).toBe("empty");

    act(() =>
      root.render(
        <>
          <ResultObserver viewId={viewId} />
          <RecipeScalingResult
            context={{
              toolName: "submit-recipe-scaling-result",
              args: { documentId: "recipe-1", factor: 1.5 },
              resultJson: result,
              isRunning: false,
              widgetId: "tool-current:chat-ui",
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

  it("ignores historical renderer remounts without the active request widget correlation", () => {
    const viewId = createRecipeScalingViewId();
    beginRecipeScalingRequest({
      viewId,
      requestId: "submit-current",
      documentId: "recipe-1",
      factor: 1.5,
    });
    act(() =>
      root.render(
        <>
          <ResultObserver viewId={viewId} />
          <RecipeScalingResult
            context={{
              toolName: "submit-recipe-scaling-result",
              args: { documentId: "recipe-1", factor: 1.5 },
              resultJson: result,
              isRunning: false,
              isActiveTail: false,
              widgetId: "tool-historical:chat-ui",
              status: "completed",
            }}
          />
        </>,
      ),
    );

    expect(
      container.querySelector('[data-testid="result-id"]')?.textContent,
    ).toBe("empty");
  });

  it("keeps a completed result scoped to the recipe view that requested it", () => {
    const requestingViewId = createRecipeScalingViewId();
    const reenteredViewId = createRecipeScalingViewId();
    beginRecipeScalingRequest({
      viewId: requestingViewId,
      requestId: "submit-current",
      documentId: "recipe-1",
      factor: 1.5,
    });
    act(() =>
      root.render(
        <RecipeScalingResult
          context={{
            toolName: "submit-recipe-scaling-result",
            args: { documentId: "recipe-1", factor: 1.5 },
            resultJson: undefined,
            isRunning: true,
            isActiveTail: true,
            widgetId: "tool-current:chat-ui",
            status: "running",
          }}
        />,
      ),
    );
    act(() =>
      root.render(
        <RecipeScalingResult
          context={{
            toolName: "submit-recipe-scaling-result",
            args: { documentId: "recipe-1", factor: 1.5 },
            resultJson: result,
            isRunning: false,
            widgetId: "tool-current:chat-ui",
            status: "completed",
          }}
        />,
      ),
    );
    act(() => root.render(<ResultObserver viewId={reenteredViewId} />));

    expect(
      container.querySelector('[data-testid="result-id"]')?.textContent,
    ).toBe("empty");
  });

  it("rejects mismatched document or factor from the current request action", () => {
    const viewId = createRecipeScalingViewId();
    beginRecipeScalingRequest({
      viewId,
      requestId: "submit-current",
      documentId: "recipe-1",
      factor: 1.5,
    });
    const mismatch = {
      ...result,
      factor: 2,
    };
    act(() =>
      root.render(
        <RecipeScalingResult
          context={{
            toolName: "submit-recipe-scaling-result",
            args: { documentId: "recipe-1", factor: 2 },
            resultJson: mismatch,
            isRunning: true,
            isActiveTail: true,
            widgetId: "tool-mismatch:chat-ui",
            status: "running",
          }}
        />,
      ),
    );
    act(() =>
      root.render(
        <>
          <RecipeScalingResult
            context={{
              toolName: "submit-recipe-scaling-result",
              args: { documentId: "recipe-1", factor: 1.5 },
              resultJson: mismatch,
              isRunning: false,
              widgetId: "tool-mismatch:chat-ui",
              status: "completed",
            }}
          />
          <ResultObserver viewId={viewId} />
        </>,
      ),
    );

    expect(
      container.querySelector('[data-testid="result-id"]')?.textContent,
    ).toBe("empty");
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

  it("renders grouped-only and mixed flat plus grouped recipe sections", () => {
    act(() =>
      root.render(
        <RecipeScalingComparison
          result={{
            ...result,
            recipe: {
              servings: null,
              ingredientLines: [],
              instructions: [],
              components: [
                {
                  name: "Tomato sauce",
                  ingredientLines: ["2 cups tomatoes"],
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
          }}
          source={{ id: "recipe-1", title: "Soup", content: "Source" }}
        />,
      ),
    );
    expect(container.textContent).toContain("2 cups tomatoes");
    expect(container.textContent).toContain("Cook until thick.");
    expect(container.textContent).toContain("Fresh basil");

    act(() =>
      root.render(
        <RecipeScalingComparison
          result={{
            ...result,
            recipe: {
              ...result.recipe,
              ingredientLines: ["1 tablespoon oil"],
              components: [
                {
                  name: "Marinade",
                  ingredientLines: ["1 teaspoon ginger"],
                  instructions: ["Whisk together."],
                },
              ],
            },
          }}
          source={{ id: "recipe-1", title: "Soup", content: "Source" }}
        />,
      ),
    );
    expect(container.textContent).toContain("1 tablespoon oil");
    expect(container.textContent).toContain("1 teaspoon ginger");
    expect(container.textContent).toContain("Whisk together.");
  });
});
