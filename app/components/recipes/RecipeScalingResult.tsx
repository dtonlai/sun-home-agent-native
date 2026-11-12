import {
  actionErrorMessage,
  useActionQuery,
  useSession,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  registerActionChatRenderer,
  type ToolRendererProps,
} from "@agent-native/toolkit/app/chat/agentkit-chat";
import { useMemo } from "react";

import { RecipeMarkdown } from "@/components/recipes/RecipeMarkdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const RECIPE_SCALING_RENDERER = "sun-home.recipe-scaling-result";

type RecipeScalingResultData = {
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
            components: data.components as RecipeScalingResultData["recipe"]["components"],
          }),
      adjustmentExplanations: data.adjustmentExplanations,
    },
  };
}

function RecipeScalingResult({ context }: ToolRendererProps) {
  const t = useT();
  const result = useMemo(
    () => parseResult(context.resultJson),
    [context.resultJson],
  );
  const { session } = useSession();
  const queryKeyScope = [
    session?.email ?? null,
    session?.orgId ?? null,
  ] as const;
  const sourceQuery = useActionQuery(
    "get-document",
    result ? { id: result.documentId } : undefined,
    {
      enabled: Boolean(result),
      queryKeyScope,
      staleTime: 0,
      refetchOnMount: "always",
      retry: false,
    },
  );

  if (!result) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("recipes.scaledResultInvalid")}
      </p>
    );
  }

  if (sourceQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-destructive">
          {actionErrorMessage(sourceQuery.error) ??
            t("recipes.scaledSourceError")}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={sourceQuery.isFetching}
          onClick={() => void sourceQuery.refetch()}
        >
          {t("recipes.retry")}
        </Button>
      </div>
    );
  }

  if (sourceQuery.isLoading) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!sourceQuery.data || sourceQuery.data.id !== result.documentId) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("recipes.scaledSourceMissing")}
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <section
        aria-label={t("recipes.originalRecipe")}
        className="min-w-0 rounded-md border border-border p-4"
      >
        <h3 className="mb-3 text-base font-semibold">
          {t("recipes.originalRecipe")}
        </h3>
        <h4 className="mb-3 break-words text-sm font-medium">
          {sourceQuery.data.title}
        </h4>
        <RecipeMarkdown
          documentId={sourceQuery.data.id}
          content={sourceQuery.data.content ?? ""}
        />
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
            </span>{" "}
            {result.recipe.servings}
          </p>
        ) : null}
        {result.recipe.ingredientLines.length > 0 ? (
          <section aria-label={t("recipes.ingredients")} className="mb-5">
            <h4 className="mb-2 text-sm font-semibold">
              {t("recipes.ingredients")}
            </h4>
            <ul className="list-disc space-y-1 ps-5 text-sm">
              {result.recipe.ingredientLines.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {result.recipe.instructions.length > 0 ? (
          <section aria-label={t("recipes.instructions")} className="mb-5">
            <h4 className="mb-2 text-sm font-semibold">
              {t("recipes.instructions")}
            </h4>
            <ol className="list-decimal space-y-2 ps-5 text-sm">
              {result.recipe.instructions.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ol>
          </section>
        ) : null}
        {result.recipe.components?.map((component, componentIndex) => (
          <section
            key={`${componentIndex}-${component.name}`}
            aria-label={component.name}
            className="mb-5"
          >
            <h4 className="mb-2 break-words text-sm font-semibold">
              {component.name}
            </h4>
            {component.ingredientLines.length > 0 ? (
              <section
                aria-label={`${component.name} ${t("recipes.ingredients")}`}
                className="mb-3"
              >
                <h5 className="mb-2 text-sm font-medium">
                  {t("recipes.ingredients")}
                </h5>
                <ul className="list-disc space-y-1 ps-5 text-sm">
                  {component.ingredientLines.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {component.instructions.length > 0 ? (
              <section
                aria-label={`${component.name} ${t("recipes.instructions")}`}
              >
                <h5 className="mb-2 text-sm font-medium">
                  {t("recipes.instructions")}
                </h5>
                <ol className="list-decimal space-y-2 ps-5 text-sm">
                  {component.instructions.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ol>
              </section>
            ) : null}
          </section>
        ))}
        {result.recipe.adjustmentExplanations.length > 0 ? (
          <section aria-label={t("recipes.adjustments")}>
            <h4 className="mb-2 text-sm font-semibold">
              {t("recipes.adjustments")}
            </h4>
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
              {result.recipe.adjustmentExplanations.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}

registerActionChatRenderer({
  id: RECIPE_SCALING_RENDERER,
  renderer: RECIPE_SCALING_RENDERER,
  Component: RecipeScalingResult,
});

export { RECIPE_SCALING_RENDERER, RecipeScalingResult };
