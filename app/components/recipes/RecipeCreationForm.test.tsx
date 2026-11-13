// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@agent-native/core/client/hooks", () => ({
  actionErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : undefined,
}));

vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (key: string, values?: Record<string, string>) =>
    key.replace(
      /\{\{(\w+)\}\}/g,
      (_match, name: string) => values?.[name] ?? name,
    ),
}));

vi.mock("react-router", () => ({
  Link: ({ to, children, ...props }: Record<string, unknown>) => (
    <a href={String(to)} {...props}>
      {children as ReactNode}
    </a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
}));

import {
  RecipeCreationForm,
  type RecipeDraftInput,
} from "./RecipeCreationForm";

function changeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function click(element: Element | null) {
  act(() => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("RecipeCreationForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("submits independent groups, serving text, notes, sources, tags, and cuisine", async () => {
    const onCreate = vi.fn(async (_recipe: RecipeDraftInput) => ({
      documentId: "saved-recipe",
      urlPath: "/page/saved-recipe",
    }));
    act(() =>
      root.render(
        <RecipeCreationForm onCancel={vi.fn()} onCreate={onCreate} />,
      ),
    );

    const field = (labelText: string) => {
      const label = [...container.querySelectorAll("label")].find(
        (item) => item.textContent === labelText,
      );
      return label
        ? container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `#${CSS.escape(label.htmlFor)}`,
          )
        : null;
    };
    changeValue(field("recipes.recipeTitle")!, "Tomato Soup");
    changeValue(field("recipes.servings")!, "4–6 servings");
    changeValue(field("recipes.cuisineOptional")!, "Italian");
    changeValue(
      container.querySelectorAll("textarea")[0]!,
      "2 cups tomatoes\n1 tsp salt",
    );
    changeValue(
      container.querySelectorAll("textarea")[1]!,
      "Chop the tomatoes.",
    );

    const addGroupButtons = [...container.querySelectorAll("button")].filter(
      (button) => button.textContent?.includes("recipes.addGroup"),
    );
    click(addGroupButtons[0] ?? null);
    click(
      [...container.querySelectorAll("button")].filter((button) =>
        button.textContent?.includes("recipes.addGroup"),
      )[1] ?? null,
    );
    changeValue(
      container.querySelectorAll("fieldset")[0]!.querySelectorAll("input")[0]!,
      "Sauce",
    );
    changeValue(
      container.querySelectorAll("fieldset")[0]!.querySelectorAll("input")[1]!,
      "Garnish",
    );
    changeValue(
      container.querySelectorAll("fieldset")[1]!.querySelectorAll("input")[0]!,
      "Prep",
    );
    changeValue(
      container.querySelectorAll("fieldset")[1]!.querySelectorAll("input")[1]!,
      "Cook",
    );
    changeValue(container.querySelectorAll("textarea")[1]!, "1 bunch basil");
    changeValue(
      container.querySelectorAll("textarea")[3]!,
      "Simmer until tender.",
    );

    click(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "recipes.addNote",
      ) ?? null,
    );
    changeValue(field("recipes.noteTitle")!, "Make ahead");
    changeValue(field("recipes.noteBody")!, "Refrigerate overnight.");
    click(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "recipes.addSource",
      ) ?? null,
    );
    changeValue(field("recipes.sourceTitleOptional")!, "Original recipe");
    changeValue(field("recipes.sourceUrl")!, "https://example.com/soup");

    const tagInput = field("recipes.tagsOptional") as HTMLInputElement;
    changeValue(tagInput, "weeknight");
    act(() =>
      tagInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    changeValue(tagInput, "vegetarian");
    act(() =>
      tagInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    changeValue(
      field("recipes.additionalDetailsOptional")!,
      "Serve with crusty bread.",
    );

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(onCreate).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
      title: "Tomato Soup",
      servings: "4–6 servings",
      ingredientGroups: [
        { name: "Sauce", entries: ["2 cups tomatoes", "1 tsp salt"] },
        { name: "Garnish", entries: ["1 bunch basil"] },
      ],
      instructionGroups: [
        { name: "Prep", entries: ["Chop the tomatoes."] },
        { name: "Cook", entries: ["Simmer until tender."] },
      ],
      notes: [{ title: "Make ahead", nfm: "Refrigerate overnight." }],
      tags: ["weeknight", "vegetarian"],
      cuisine: "Italian",
      sourceLinks: [
        { title: "Original recipe", url: "https://example.com/soup" },
      ],
      additionalNfm: "Serve with crusty bread.",
    });
    expect(container.textContent).toContain("recipes.createSuccess");
    expect(
      container.querySelector('a[href="/page/saved-recipe"]'),
    ).not.toBeNull();
  });

  it("keeps entered values after a save error", async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("The collection is unavailable."))
      .mockResolvedValue({
        documentId: "saved-recipe",
        urlPath: "/page/saved-recipe",
      });
    act(() =>
      root.render(
        <RecipeCreationForm onCancel={vi.fn()} onCreate={onCreate} />,
      ),
    );
    const title = container.querySelector<HTMLInputElement>(
      "input[maxlength='500']",
    )!;
    changeValue(title, "Keep this draft");
    changeValue(container.querySelectorAll("textarea")[0]!, "1 cup flour");
    changeValue(container.querySelectorAll("textarea")[1]!, "Mix and bake.");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The collection is unavailable.",
    );
    expect(title.value).toBe("Keep this draft");
    expect(container.querySelectorAll("textarea")[0]?.value).toBe(
      "1 cup flour",
    );
    expect(container.querySelectorAll("textarea")[1]?.value).toBe(
      "Mix and bake.",
    );

    const firstKey = onCreate.mock.calls[0]?.[0].idempotencyKey;
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(onCreate.mock.calls[1]?.[0].idempotencyKey).toBe(firstKey);
    expect(container.textContent).toContain("recipes.createSuccess");
  });
});
