import { useT } from "@agent-native/core/client/i18n";
import {
  registerActionChatRenderer,
  type ToolRendererProps,
} from "@agent-native/toolkit/app/chat/agentkit-chat";
import type { Document } from "@shared/api";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { RecipeMarkdown } from "@/components/recipes/RecipeMarkdown";

const RECIPE_SCALING_RENDERER = "sun-home.recipe-scaling-result";

export type RecipeScalingResultData = {
  documentId: string;
  factor: number;
  recipe: {
    servings: string | null;
    ingredientLines: string[];
    instructions: string[];
    components?: Array<{
      name: string;
      ingredientLines: string[];
      instructions: string[];
    }>;
    adjustmentExplanations: string[];
  };
};

let currentResult: RecipeScalingResultData | null = null;
const listeners = new Set<() => void>();

function notifyResultChange() {
  for (const listener of listeners) listener();
}

export function clearRecipeScalingResult() {
  if (currentResult === null) return;
  currentResult = null;
  notifyResultChange();
}

export function useRecipeScalingResult() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentResult,
    () => null,
  );
}

function parseResult(value: unknown): RecipeScalingResultData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const recipe = result.recipe;
  if (
    typeof result.documentId !== "string" ||
    !result.documentId ||
    typeof result.factor !== "number" ||
    !Number.isFinite(result.factor) ||
    result.factor <= 0 ||
    !recipe ||
    typeof recipe !== "object" ||
    Array.isArray(recipe)
  ) {
    return null;
  }
  const data = recipe as Record<string, unknown>;
  if (
    (data.servings !== null && typeof data.servings !== "string") ||
    !Array.isArray(data.ingredientLines) ||
    !data.ingredientLines.every((line) => typeof line === "string") ||
    !Array.isArray(data.instructions) ||
    !data.instructions.every((line) => typeof line === "string") ||
    (data.components !== undefined &&
      (!Array.isArray(data.components) ||
        !data.components.every(
          (component) =>
            Boolean(component) &&
            typeof component === "object" &&
            !Array.isArray(component) &&
            typeof component.name === "string" &&
            Boolean(component.name.trim()) &&
            Array.isArray(component.ingredientLines) &&
            component.ingredientLines.every(
              (line: unknown) => typeof line === "string",
            ) &&
            Array.isArray(component.instructions) &&
            component.instructions.every(
              (line: unknown) => typeof line === "string",
            ) &&
            (component.ingredientLines.length > 0 ||
              component.instructions.length > 0),
        ))) ||
    !Array.isArray(data.adjustmentExplanations) ||
    !data.adjustmentExplanations.every((line) => typeof line === "string")
  ) {
    return null;
  }
  return {
    documentId: result.documentId,
    factor: result.factor,
    recipe: {
      servings: data.servings,
      ingredientLines: data.ingredientLines,
      instructions: data.instructions,
      ...(data.components === undefined
        ? {}
        : {
            components:
              data.components as RecipeScalingResultData["recipe"]["components"],
          }),
      adjustmentExplanations: data.adjustmentExplanations,
    },
  };
}

export function RecipeScalingResult({ context }: ToolRendererProps) {
  // The action declares this renderer only for its successful result. Check
  // status as well so a running or failed tool can never publish output.
  const result = useMemo(
    () => parseResult(context.resultJson),
    [context.resultJson],
  );
  useEffect(() => {
    if (context.status === "completed") {
      if (!result) return;
      currentResult = result;
      notifyResultChange();
    }
  }, [context.status, result]);

  return null;
}

registerActionChatRenderer({
  id: RECIPE_SCALING_RENDERER,
  renderer: RECIPE_SCALING_RENDERER,
  Component: RecipeScalingResult,
});

function RecipeLines({
  title,
  lines,
  ordered = false,
}: {
  title: string;
  lines: string[];
  ordered?: boolean;
}) {
  if (lines.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <section className="mb-5">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <List
        className={
          ordered
            ? "list-decimal space-y-2 ps-5 text-sm"
            : "list-disc space-y-1 ps-5 text-sm"
        }
      >
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </List>
    </section>
  );
}

export function RecipeScalingComparison({
  result,
  source,
}: {
  result: RecipeScalingResultData;
  source: Pick<Document, "id" | "title" | "content">;
}) {
  const t = useT();
  return (
    <div className="mt-6 grid min-w-0 gap-4 border-t border-border pt-5 md:grid-cols-2">
      <section
        aria-label={t("recipes.originalRecipe")}
        className="min-w-0 rounded-md border border-border p-4"
      >
        <h3 className="mb-3 text-base font-semibold">
          {t("recipes.originalRecipe")}
        </h3>
        <h4 className="mb-3 break-words text-sm font-medium">{source.title}</h4>
        <RecipeMarkdown documentId={source.id} content={source.content ?? ""} />
      </section>
      <section
        aria-label={t("recipes.scaledRecipe", {
          factor: String(result.factor),
        })}
        className="min-w-0 rounded-md border border-border p-4"
      >
        <h3 className="mb-3 text-base font-semibold">
          {t("recipes.scaledRecipe", { factor: String(result.factor) })}
        </h3>
        {result.recipe.servings ? (
          <p className="mb-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("recipes.servings")}:
            </span>
            {result.recipe.servings}
          </p>
        ) : null}
        <RecipeLines
          title={t("recipes.ingredients")}
          lines={result.recipe.ingredientLines}
        />
        <RecipeLines
          title={t("recipes.instructions")}
          lines={result.recipe.instructions}
          ordered
        />
        {result.recipe.components?.map((component, index) => (
          <section key={`${index}-${component.name}`} className="mb-5">
            <h4 className="mb-2 break-words text-sm font-semibold">
              {component.name}
            </h4>
            <RecipeLines
              title={t("recipes.ingredients")}
              lines={component.ingredientLines}
            />
            <RecipeLines
              title={t("recipes.instructions")}
              lines={component.instructions}
              ordered
            />
          </section>
        ))}
        {result.recipe.adjustmentExplanations.length > 0 ? (
          <RecipeLines
            title={t("recipes.adjustments")}
            lines={result.recipe.adjustmentExplanations}
          />
        ) : null}
      </section>
    </div>
  );
}
