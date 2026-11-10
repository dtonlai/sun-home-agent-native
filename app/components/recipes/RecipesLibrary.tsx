import {
  actionErrorMessage,
  useActionQuery,
  useSession,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import type { Document } from "@shared/api";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { QueryErrorState } from "@/components/QueryErrorState";
import { parseRecipeContent } from "@/components/recipes/recipe-content";
import { RecipeMarkdown } from "@/components/recipes/RecipeMarkdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type RecipeListItem = {
  id: string;
  title: string | null;
};

type RecipePageState = {
  spaceId: string;
  pages: Map<number, RecipeListItem[]>;
  pagination: {
    hasMore: boolean;
    nextOffset: number | null;
  };
};

const PAGE_SIZE = 100;

function appendUnique(previous: RecipeListItem[], incoming: RecipeListItem[]) {
  const known = new Set(previous.map((item) => item.id));
  return [...previous, ...incoming.filter((item) => !known.has(item.id))];
}

function PageError({
  description,
  onRetry,
  retrying,
}: {
  description: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/30 bg-background p-4">
      <p className="text-sm text-destructive">{description}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={retrying}
      >
        {t("recipes.retry")}
      </Button>
    </div>
  );
}

function RecipeDetails({
  document,
  fallbackTitle,
}: {
  document: Pick<Document, "id" | "title" | "content">;
  fallbackTitle: string;
}) {
  const t = useT();
  const content = parseRecipeContent(document.content ?? "");
  const title = document.title?.trim() || fallbackTitle;
  const hasBody = Boolean(
    content.ingredients || content.instructions || content.additional,
  );

  return (
    <article className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {content.servings ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("recipes.servings")}:
              </span>{" "}
              {content.servings}
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={`/page/${encodeURIComponent(document.id)}`}>
            {t("recipes.openInContent")}
          </Link>
        </Button>
      </div>

      {hasBody ? (
        <div className="mt-5 grid min-w-0 gap-6 md:grid-cols-2">
          <section
            aria-labelledby="recipe-ingredients-heading"
            className="min-w-0"
          >
            <h3
              id="recipe-ingredients-heading"
              className="mb-3 text-base font-semibold"
            >
              {t("recipes.ingredients")}
            </h3>
            {content.ingredients ? (
              <RecipeMarkdown
                documentId={document.id}
                content={content.ingredients}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("recipes.noIngredients")}
              </p>
            )}
          </section>
          <section
            aria-labelledby="recipe-instructions-heading"
            className="min-w-0"
          >
            <h3
              id="recipe-instructions-heading"
              className="mb-3 text-base font-semibold"
            >
              {t("recipes.instructions")}
            </h3>
            {content.instructions ? (
              <RecipeMarkdown
                documentId={document.id}
                content={content.instructions}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("recipes.noInstructions")}
              </p>
            )}
          </section>
          {content.additional ? (
            <section className="min-w-0 md:col-span-2">
              <h3 className="mb-3 text-base font-semibold">
                {t("recipes.additionalDetails")}
              </h3>
              <RecipeMarkdown
                documentId={document.id}
                content={content.additional}
              />
            </section>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          {t("recipes.emptyRecipe")}
        </p>
      )}
    </article>
  );
}

export function RecipesLibrary() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRecipeId = searchParams.get("recipeId")?.trim() || null;
  const requestedSpaceId = searchParams.get("spaceId")?.trim() || null;
  const { session } = useSession();
  const viewerScope = [session?.email ?? null, session?.orgId ?? null] as const;
  useSetPageTitle(t("recipes.title"));

  // This is a read of the caller's authorized spaces. Recipes never provisions
  // or changes a Content space.
  const spacesQuery = useActionQuery("list-content-spaces", undefined, {
    queryKeyScope: viewerScope,
    retry: false,
  });
  const recipesSpaces = useMemo(
    () =>
      (spacesQuery.data?.spaces ?? []).filter(
        (space) => space.name === "Recipes",
      ),
    [spacesQuery.data?.spaces],
  );
  const activeSpace = requestedSpaceId
    ? (recipesSpaces.find((space) => space.id === requestedSpaceId) ??
      (recipesSpaces.length === 1 ? recipesSpaces[0] : undefined))
    : recipesSpaces.length === 1
      ? recipesSpaces[0]
      : undefined;

  const [requestedPage, setRequestedPage] = useState<{
    spaceId: string;
    offset: number;
  } | null>(null);
  const pageOffset =
    activeSpace && requestedPage?.spaceId === activeSpace.id
      ? requestedPage.offset
      : 0;
  const documentsQuery = useActionQuery(
    "list-documents",
    {
      limit: PAGE_SIZE,
      offset: pageOffset,
      spaceId: activeSpace?.id ?? "",
      documentType: "page",
    },
    {
      enabled: Boolean(activeSpace),
      queryKeyScope: viewerScope,
      staleTime: 0,
      refetchOnMount: "always",
      retry: false,
    },
  );

  const [pageState, setPageState] = useState<RecipePageState | null>(null);
  useEffect(() => {
    if (!activeSpace || !documentsQuery.data) return;
    setPageState((previous) => {
      const pages =
        previous?.spaceId === activeSpace.id
          ? new Map(previous.pages)
          : new Map<number, RecipeListItem[]>();
      pages.set(pageOffset, documentsQuery.data.documents);
      return {
        spaceId: activeSpace.id,
        pages,
        pagination: documentsQuery.data.pagination,
      };
    });
  }, [activeSpace, documentsQuery.data, pageOffset]);

  const recipeDocuments = useMemo(() => {
    if (!activeSpace || pageState?.spaceId !== activeSpace.id) return [];
    const pages = [...pageState.pages.entries()].sort(([a], [b]) => a - b);
    return pages.reduce<RecipeListItem[]>(
      (all, [, page]) => appendUnique(all, page),
      [],
    );
  }, [activeSpace, pageState]);
  const hasMore =
    Boolean(activeSpace) &&
    pageState !== null &&
    pageState.spaceId === activeSpace?.id &&
    pageState.pagination.hasMore;
  const documentQuery = useActionQuery(
    "get-document",
    selectedRecipeId ? { id: selectedRecipeId } : undefined,
    {
      enabled: Boolean(activeSpace && selectedRecipeId),
      queryKeyScope: viewerScope,
      staleTime: 0,
      refetchOnMount: "always",
      retry: false,
    },
  );
  const selectedDocument =
    documentQuery.data?.id === selectedRecipeId &&
    documentQuery.data?.spaceId === activeSpace?.id &&
    !documentQuery.data?.database &&
    !documentQuery.data?.databaseMembership
      ? documentQuery.data
      : undefined;
  const listLoaded = pageState?.spaceId === activeSpace?.id;
  const nextOffset =
    listLoaded && hasMore ? (pageState?.pagination.nextOffset ?? null) : null;

  const updateLocation = (
    recipeId: string | null,
    spaceId = activeSpace?.id,
  ) => {
    const next = new URLSearchParams(searchParams);
    if (spaceId) next.set("spaceId", spaceId);
    else next.delete("spaceId");
    if (recipeId) next.set("recipeId", recipeId);
    else next.delete("recipeId");
    setSearchParams(next);
  };

  if (spacesQuery.isError) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <PageError
          description={
            actionErrorMessage(spacesQuery.error) ?? t("recipes.spacesError")
          }
          onRetry={() => void spacesQuery.refetch()}
          retrying={spacesQuery.isFetching}
        />
      </div>
    );
  }

  if (spacesQuery.isLoading || !spacesQuery.data) {
    return (
      <div className="flex-1 space-y-4 overflow-auto p-6" aria-busy="true">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (recipesSpaces.length === 0) {
    return (
      <section className="flex-1 overflow-auto p-6 sm:p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">
            {t("recipes.spaceMissingTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("recipes.spaceMissingDescription")}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("recipes.spaceSetupInstructions")}
          </p>
          <Button asChild className="mt-5" variant="outline">
            <Link to="/home">{t("recipes.openContent")}</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (!activeSpace) {
    return (
      <section className="flex-1 overflow-auto p-6 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-lg font-semibold">
            {t("recipes.chooseSpaceTitle")}
          </h2>
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {recipesSpaces.map((space) => (
              <li key={space.id}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => updateLocation(null, space.id)}
                >
                  <span>{t("recipes.title")}</span>
                  <span className="text-muted-foreground">
                    {space.orgId
                      ? t("recipes.sharedSpace", { id: space.orgId })
                      : t("recipes.personalSpace")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  const listError = documentsQuery.isError
    ? (actionErrorMessage(documentsQuery.error) ?? t("recipes.listError"))
    : null;
  const detailError = documentQuery.isError
    ? (actionErrorMessage(documentQuery.error) ?? t("recipes.documentError"))
    : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
      <div className="mx-auto grid min-h-full max-w-7xl gap-4 lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
        <aside
          aria-label={t("recipes.library")}
          className="min-w-0 rounded-lg border border-border bg-card"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t("recipes.library")}</h2>
          </div>
          {documentsQuery.isLoading && !listLoaded ? (
            <div className="space-y-2 p-3" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : recipeDocuments.length > 0 ? (
            <>
              <nav aria-label={t("recipes.library")}>
                <ul className="divide-y divide-border">
                  {recipeDocuments.map((document) => {
                    const active = document.id === selectedRecipeId;
                    const params = new URLSearchParams();
                    params.set("spaceId", activeSpace.id);
                    params.set("recipeId", document.id);
                    return (
                      <li key={document.id}>
                        <Link
                          to={`/recipes?${params.toString()}`}
                          aria-current={active ? "page" : undefined}
                          className={`block min-h-11 px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                        >
                          <span className="block truncate font-medium">
                            {document.title?.trim() || t("recipes.untitled")}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              {listError ? (
                <div className="p-3">
                  <PageError
                    description={listError}
                    onRetry={() => void documentsQuery.refetch()}
                    retrying={documentsQuery.isFetching}
                  />
                </div>
              ) : null}
              {nextOffset !== null ? (
                <div className="border-t border-border p-3">
                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    size="sm"
                    disabled={documentsQuery.isFetching}
                    onClick={() =>
                      setRequestedPage({
                        spaceId: activeSpace.id,
                        offset: nextOffset,
                      })
                    }
                  >
                    {documentsQuery.isFetching
                      ? t("recipes.loadingMore")
                      : t("recipes.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : listError ? (
            <div className="p-3">
              <PageError
                description={listError}
                onRetry={() => void documentsQuery.refetch()}
                retrying={documentsQuery.isFetching}
              />
            </div>
          ) : listLoaded ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t("recipes.noRecipes")}
            </p>
          ) : null}
        </aside>

        <section
          aria-label={t("recipes.viewer")}
          className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          {selectedRecipeId ? (
            documentQuery.isLoading ? (
              <div aria-busy="true" className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : detailError ? (
              <PageError
                description={detailError}
                onRetry={() => void documentQuery.refetch()}
                retrying={documentQuery.isFetching}
              />
            ) : selectedDocument ? (
              <RecipeDetails
                document={selectedDocument}
                fallbackTitle={selectedDocument.title || t("recipes.untitled")}
              />
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {t("recipes.recipeUnavailable")}
              </p>
            )
          ) : (
            <div className="flex min-h-40 items-center justify-center text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("recipes.selectRecipe")}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
