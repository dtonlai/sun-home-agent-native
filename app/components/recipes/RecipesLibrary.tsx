import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
  useSession,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import type {
  ContentDatabaseItemsPagePayload,
  ContentDatabaseResponsePayload,
  Document,
} from "@shared/api";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { QueryErrorState } from "@/components/QueryErrorState";
import { parseRecipeContent } from "@/components/recipes/recipe-content";
import {
  adaptRecipeCreateInput,
  adaptRecipeCreateResult,
} from "@/components/recipes/recipe-create-adapter";
import {
  cuisineOptions,
  buildRecipeCollectionTableQuery,
  buildRecipeDocumentSearchQuery,
  recipeEntryFromCollectionItem,
  type RecipeListEntry,
} from "@/components/recipes/recipe-library-filtering";
import { RecipeCreationForm } from "@/components/recipes/RecipeCreationForm";
import { RecipeMarkdown } from "@/components/recipes/RecipeMarkdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import "@/components/recipes/RecipeScalingResult";

type RecipeListItem = RecipeListEntry;

type RecipePageState = {
  spaceId: string;
  pages: Map<number, RecipeListItem[]>;
  pagination: {
    hasMore: boolean;
    nextOffset: number | null;
  };
};

type RecipeCollectionItem = {
  document: { id: string; title: string | null };
  properties: Array<{ definition: { name: string }; value: unknown }>;
};

type RemotePageState<T> = {
  key: string;
  pages: Map<number, T[]>;
  pagination: { hasMore: boolean; nextOffset: number | null };
};

const PAGE_SIZE = 100;

function appendUnique(previous: RecipeListItem[], incoming: RecipeListItem[]) {
  const known = new Set(previous.map((item) => item.id));
  return [...previous, ...incoming.filter((item) => !known.has(item.id))];
}

function sameCollectionPage(
  previous: RecipeCollectionItem[] | undefined,
  incoming: RecipeCollectionItem[],
) {
  return Boolean(
    previous &&
    previous.length === incoming.length &&
    previous.every((item, index) => item === incoming[index]),
  );
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
  const scaleMutation = useActionMutation("start-recipe-scaling");
  const [scaleChoice, setScaleChoice] = useState("2");
  const [customFactor, setCustomFactor] = useState("");
  const [scaleError, setScaleError] = useState<string | null>(null);
  const customFactorNumber = Number(customFactor);
  const factor =
    scaleChoice === "custom"
      ? Number.isFinite(customFactorNumber) && customFactorNumber > 0
        ? customFactorNumber
        : null
      : Number(scaleChoice);
  const content = parseRecipeContent(document.content ?? "");
  const title = document.title?.trim() || fallbackTitle;
  const hasBody = Boolean(
    content.ingredients || content.instructions || content.additional,
  );
  const requestScaling = async () => {
    if (factor === null || !Number.isFinite(factor) || factor <= 0) return;
    setScaleError(null);
    try {
      const grant = await scaleMutation.mutateAsync({
        documentId: document.id,
        factor,
      });
      sendToAgentChat({
        message: t("recipes.scalingRequest", { factor: String(factor) }),
        context: JSON.stringify({ documentId: document.id, factor }),
        actionScope: {
          kind: "sun-home-recipe-scaling",
          grantToken: grant.grantToken,
        },
        submit: true,
        openSidebar: true,
      });
    } catch (error) {
      setScaleError(actionErrorMessage(error) ?? t("recipes.scalingError"));
    }
  };

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

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="recipe-scale-choice">
            {t("recipes.scaleFactor")}
          </Label>
          <select
            id="recipe-scale-choice"
            aria-label={t("recipes.scaleFactor")}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={scaleChoice}
            onChange={(event) => {
              setScaleChoice(event.currentTarget.value);
              setScaleError(null);
            }}
          >
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
            <option value="custom">{t("recipes.customScale")}</option>
          </select>
        </div>
        {scaleChoice === "custom" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="recipe-custom-scale">
              {t("recipes.customScaleFactor")}
            </Label>
            <Input
              id="recipe-custom-scale"
              aria-label={t("recipes.customScaleFactor")}
              aria-invalid={factor === null}
              aria-describedby="recipe-custom-scale-help"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={customFactor}
              onChange={(event) => {
                setCustomFactor(event.currentTarget.value);
                setScaleError(null);
              }}
              className="w-32"
            />
            <p
              id="recipe-custom-scale-help"
              className="text-xs text-muted-foreground"
            >
              {factor === null
                ? t("recipes.customScaleInvalid")
                : t("recipes.customScaleHelp")}
            </p>
          </div>
        ) : null}
        <Button
          type="button"
          onClick={() => void requestScaling()}
          disabled={scaleMutation.isPending || factor === null}
        >
          {scaleMutation.isPending
            ? t("recipes.scalingPending")
            : t("recipes.scale")}
        </Button>
        {scaleError ? (
          <p role="alert" className="w-full text-sm text-destructive">
            {scaleError}
          </p>
        ) : null}
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
  const [recipeSearch, setRecipeSearch] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isCreatingRecipe, setIsCreatingRecipe] = useState(false);
  const [selectedRecipeDatabaseId, setSelectedRecipeDatabaseId] = useState<
    string | null
  >(null);
  const { session } = useSession();
  const viewerScope = [session?.email ?? null, session?.orgId ?? null] as const;
  const createRecipeMutation = useActionMutation("create-recipe");
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
  const recipeDatabasesQuery = useActionQuery(
    "list-content-databases",
    activeSpace ? { spaceId: activeSpace.id, limit: 50, offset: 0 } : undefined,
    {
      enabled: Boolean(activeSpace),
      queryKeyScope: viewerScope,
      retry: false,
    },
  );
  const recipeDatabases = recipeDatabasesQuery.data?.databases ?? [];
  const selectedDatabaseId =
    selectedRecipeDatabaseId &&
    recipeDatabases.some(
      (database: { databaseId: string }) =>
        database.databaseId === selectedRecipeDatabaseId,
    )
      ? selectedRecipeDatabaseId
      : recipeDatabases.length === 1
        ? recipeDatabases[0]?.databaseId
        : null;
  const recipeDatabaseQuery = useActionQuery(
    "get-content-database",
    selectedDatabaseId
      ? { databaseId: selectedDatabaseId, limit: 0 }
      : undefined,
    {
      enabled: Boolean(activeSpace && selectedDatabaseId),
      queryKeyScope: viewerScope,
      retry: false,
    },
  );
  const recipeDatabaseResponse = recipeDatabaseQuery.data;
  const recipeDatabase =
    recipeDatabaseResponse && "database" in recipeDatabaseResponse
      ? (recipeDatabaseResponse as ContentDatabaseResponsePayload)
      : undefined;
  const recipeDatabaseSpaceId = recipeDatabase?.database?.spaceId;
  const mutationContract = recipeDatabase?.mutationContract;
  const formViews = (recipeDatabase?.database?.viewConfig?.views ?? []).filter(
    (view: { type: string }) => view.type === "form",
  );
  const selectedFormView =
    formViews.find(
      (view: { id: string }) =>
        view.id === recipeDatabase?.database?.viewConfig?.activeViewId,
    ) ?? formViews[0];

  const recipeProperties = mutationContract?.properties ?? [];
  const cuisineProperty = recipeProperties.find(
    (property) => property.name.trim().toLocaleLowerCase() === "cuisine",
  );
  const tagsProperty = recipeProperties.find(
    (property) => property.name.trim().toLocaleLowerCase() === "tags",
  );
  const collectionTableQuery = useMemo(
    () =>
      buildRecipeCollectionTableQuery({
        search: recipeSearch,
        cuisine: cuisineFilter,
        tag: tagFilter,
        cuisineProperty,
        tagsProperty,
      }),
    [
      recipeSearch,
      cuisineFilter,
      tagFilter,
      cuisineProperty?.id,
      cuisineProperty?.name,
      tagsProperty?.id,
      tagsProperty?.name,
    ],
  );
  const documentSearchText = buildRecipeDocumentSearchQuery(
    recipeSearch,
    cuisineFilter,
    tagFilter,
  );
  const hasActiveFilters = Boolean(documentSearchText);
  const metadataFilterRequested = Boolean(cuisineFilter || tagFilter);
  const missingMetadataFilter = Boolean(
    metadataFilterRequested &&
    ((recipeDatabasesQuery.data && recipeDatabases.length === 0) ||
      (recipeDatabase &&
        ((cuisineFilter && !cuisineProperty) || (tagFilter && !tagsProperty)))),
  );
  const collectionChoiceRequired = Boolean(
    metadataFilterRequested &&
    recipeDatabases.length > 1 &&
    !selectedDatabaseId,
  );
  const currentSearchKey = JSON.stringify([
    activeSpace?.id,
    documentSearchText,
  ]);
  const [requestedSearchPage, setRequestedSearchPage] = useState<{
    key: string;
    offset: number;
  } | null>(null);
  const searchOffset =
    requestedSearchPage?.key === currentSearchKey
      ? requestedSearchPage.offset
      : 0;
  const searchDocumentsQuery = useActionQuery(
    "search-documents",
    activeSpace && documentSearchText
      ? {
          query: documentSearchText,
          limit: PAGE_SIZE,
          offset: searchOffset,
          spaceId: activeSpace.id,
          documentType: "page",
        }
      : undefined,
    {
      enabled: Boolean(activeSpace && documentSearchText),
      queryKeyScope: viewerScope,
      retry: false,
    },
  );
  const currentCollectionKey = JSON.stringify([
    activeSpace?.id,
    selectedDatabaseId,
    recipeSearch.trim(),
    cuisineFilter.trim(),
    tagFilter.trim(),
  ]);
  const [requestedCollectionPage, setRequestedCollectionPage] = useState<{
    key: string;
    offset: number;
  } | null>(null);
  const collectionOffset =
    requestedCollectionPage?.key === currentCollectionKey
      ? requestedCollectionPage.offset
      : 0;
  const collectionItemsQuery = useActionQuery(
    "query-content-database-items",
    selectedDatabaseId && !missingMetadataFilter
      ? {
          databaseId: selectedDatabaseId,
          limit: PAGE_SIZE,
          offset: collectionOffset,
          tableQuery: collectionTableQuery,
          compactRows: false,
        }
      : undefined,
    {
      enabled: Boolean(
        activeSpace &&
        selectedDatabaseId &&
        recipeDatabase &&
        !missingMetadataFilter,
      ),
      queryKeyScope: viewerScope,
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

  const [searchPageState, setSearchPageState] =
    useState<RemotePageState<RecipeListItem> | null>(null);
  useEffect(() => {
    if (!documentSearchText || !searchDocumentsQuery.data) return;
    setSearchPageState((previous) => {
      const pages =
        previous?.key === currentSearchKey
          ? new Map(previous.pages)
          : new Map<number, RecipeListItem[]>();
      pages.set(searchOffset, searchDocumentsQuery.data.documents);
      return {
        key: currentSearchKey,
        pages,
        pagination: searchDocumentsQuery.data.pagination,
      };
    });
  }, [
    currentSearchKey,
    documentSearchText,
    searchDocumentsQuery.data,
    searchOffset,
  ]);

  const collectionResponse = collectionItemsQuery.data;
  const collectionPage =
    collectionResponse && "items" in collectionResponse
      ? (collectionResponse as ContentDatabaseItemsPagePayload)
      : undefined;
  const [collectionPageState, setCollectionPageState] =
    useState<RemotePageState<RecipeCollectionItem> | null>(null);
  const collectionIndexKey = JSON.stringify([
    activeSpace?.id,
    selectedDatabaseId,
  ]);
  const [collectionIndexState, setCollectionIndexState] =
    useState<RemotePageState<RecipeCollectionItem> | null>(null);
  useEffect(() => {
    if (!collectionPage?.pagination) return;
    const nextPagination = {
      hasMore: collectionPage.pagination.hasMore,
      nextOffset: collectionPage.pagination.hasMore
        ? collectionPage.pagination.offset +
          collectionPage.pagination.returnedItems
        : null,
    };
    const responseItems = collectionPage.items as RecipeCollectionItem[];
    setCollectionPageState((previous) => {
      const previousPage =
        previous?.key === currentCollectionKey
          ? previous.pages.get(collectionOffset)
          : undefined;
      if (
        previous?.key === currentCollectionKey &&
        sameCollectionPage(previousPage, responseItems) &&
        previous.pagination.hasMore === nextPagination.hasMore &&
        previous.pagination.nextOffset === nextPagination.nextOffset
      ) {
        return previous;
      }
      const pages =
        previous?.key === currentCollectionKey
          ? new Map(previous.pages)
          : new Map<number, RecipeCollectionItem[]>();
      pages.set(collectionOffset, responseItems);
      return {
        key: currentCollectionKey,
        pages,
        pagination: nextPagination,
      };
    });
    if (!hasActiveFilters) {
      setCollectionIndexState((previous) => {
        const previousPage =
          previous?.key === collectionIndexKey
            ? previous.pages.get(collectionOffset)
            : undefined;
        if (
          previous?.key === collectionIndexKey &&
          sameCollectionPage(previousPage, responseItems) &&
          previous.pagination.hasMore === nextPagination.hasMore &&
          previous.pagination.nextOffset === nextPagination.nextOffset
        ) {
          return previous;
        }
        const pages =
          previous?.key === collectionIndexKey
            ? new Map(previous.pages)
            : new Map<number, RecipeCollectionItem[]>();
        pages.set(collectionOffset, responseItems);
        return {
          key: collectionIndexKey,
          pages,
          pagination: nextPagination,
        };
      });
    }
  }, [
    collectionOffset,
    collectionPage,
    collectionIndexKey,
    currentCollectionKey,
    hasActiveFilters,
  ]);
  const recipeDocuments = useMemo(() => {
    if (!activeSpace || pageState?.spaceId !== activeSpace.id) return [];
    const pages = [...pageState.pages.entries()].sort(([a], [b]) => a - b);
    return pages.reduce<RecipeListItem[]>(
      (all, [, page]) => appendUnique(all, page),
      [],
    );
  }, [activeSpace, pageState]);
  const searchedRecipeDocuments = useMemo(() => {
    if (searchPageState?.key !== currentSearchKey) return [];
    return [...searchPageState.pages.entries()]
      .sort(([left], [right]) => left - right)
      .reduce<RecipeListItem[]>((all, [, page]) => appendUnique(all, page), []);
  }, [currentSearchKey, searchPageState]);
  const collectionItems = useMemo(() => {
    if (collectionPageState?.key !== currentCollectionKey) return [];
    return [...collectionPageState.pages.entries()]
      .sort(([left], [right]) => left - right)
      .reduce<RecipeCollectionItem[]>((all, [, page]) => {
        const known = new Set(all.map((item) => item.document.id));
        return [...all, ...page.filter((item) => !known.has(item.document.id))];
      }, []);
  }, [currentCollectionKey, collectionPageState]);
  const collectionIndexItems = useMemo(() => {
    if (collectionIndexState?.key !== collectionIndexKey) return [];
    return [...collectionIndexState.pages.entries()]
      .sort(([left], [right]) => left - right)
      .reduce<RecipeCollectionItem[]>((all, [, page]) => {
        const known = new Set(all.map((item) => item.document.id));
        return [...all, ...page.filter((item) => !known.has(item.document.id))];
      }, []);
  }, [collectionIndexKey, collectionIndexState]);
  const collectionRecipeEntries = useMemo(
    () => collectionItems.map(recipeEntryFromCollectionItem),
    [collectionItems],
  );
  const collectionIndexEntries = useMemo(
    () => collectionIndexItems.map(recipeEntryFromCollectionItem),
    [collectionIndexItems],
  );
  const availableCuisines = useMemo(
    () => cuisineOptions(collectionIndexEntries),
    [collectionIndexEntries],
  );
  const visibleRecipeDocuments = useMemo(
    () =>
      hasActiveFilters
        ? appendUnique(
            searchedRecipeDocuments,
            collectionRecipeEntries.map(({ id, title }) => ({ id, title })),
          )
        : recipeDocuments,
    [
      collectionRecipeEntries,
      hasActiveFilters,
      recipeDocuments,
      searchedRecipeDocuments,
    ],
  );
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
    !documentQuery.data?.database
      ? documentQuery.data
      : undefined;
  const listLoaded = pageState?.spaceId === activeSpace?.id;
  const nextOffset =
    listLoaded && hasMore ? (pageState?.pagination.nextOffset ?? null) : null;
  const searchHasMore =
    Boolean(hasActiveFilters) &&
    searchPageState?.key === currentSearchKey &&
    searchPageState.pagination.hasMore;
  const nextSearchOffset = searchHasMore
    ? (searchPageState?.pagination.nextOffset ?? null)
    : null;
  const collectionHasMore =
    collectionPageState?.key === currentCollectionKey &&
    collectionPageState.pagination.hasMore;
  const nextCollectionOffset = collectionHasMore
    ? (collectionPageState?.pagination.nextOffset ?? null)
    : null;
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
  const searchError = searchDocumentsQuery.isError
    ? (actionErrorMessage(searchDocumentsQuery.error) ??
      t("recipes.searchError"))
    : null;
  const collectionItemsError = collectionItemsQuery.isError
    ? (actionErrorMessage(collectionItemsQuery.error) ??
      t("recipes.collectionReadError"))
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
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t("recipes.library")}</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsCreatingRecipe(true)}
            >
              {t("recipes.addRecipe")}
            </Button>
          </div>
          <div className="grid gap-3 border-b border-border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="recipe-library-search">
                {t("recipes.librarySearch")}
              </Label>
              <Input
                id="recipe-library-search"
                type="search"
                value={recipeSearch}
                onChange={(event) => setRecipeSearch(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recipe-tag-filter">
                {t("recipes.filterTags")}
              </Label>
              <Input
                id="recipe-tag-filter"
                type="search"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.currentTarget.value)}
              />
            </div>
            {recipeDatabases.length > 1 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="recipe-library-collection">
                  {t("recipes.chooseRecipeCollection")}
                </Label>
                <select
                  id="recipe-library-collection"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedDatabaseId ?? ""}
                  onChange={(event) =>
                    setSelectedRecipeDatabaseId(
                      event.currentTarget.value || null,
                    )
                  }
                >
                  <option value="">{t("recipes.chooseCollection")}</option>
                  {recipeDatabases.map(
                    (database: { databaseId: string; title: string }) => (
                      <option
                        key={database.databaseId}
                        value={database.databaseId}
                      >
                        {database.title}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="recipe-cuisine-filter">
                {t("recipes.filterCuisine")}
              </Label>
              <Input
                id="recipe-cuisine-filter"
                list="recipe-cuisine-suggestions"
                value={cuisineFilter}
                placeholder={t("recipes.allCuisines")}
                onChange={(event) =>
                  setCuisineFilter(event.currentTarget.value)
                }
              />
              <datalist id="recipe-cuisine-suggestions">
                {availableCuisines.map((cuisine) => (
                  <option key={cuisine} value={cuisine}>
                    {cuisine}
                  </option>
                ))}
              </datalist>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("recipes.filterCoverage")}
            </p>
            {metadataFilterRequested && recipeDatabasesQuery.isError ? (
              <PageError
                description={
                  actionErrorMessage(recipeDatabasesQuery.error) ??
                  t("recipes.filterCollectionsError")
                }
                onRetry={() => void recipeDatabasesQuery.refetch()}
                retrying={recipeDatabasesQuery.isFetching}
              />
            ) : null}
            {metadataFilterRequested && recipeDatabaseQuery.isError ? (
              <PageError
                description={
                  actionErrorMessage(recipeDatabaseQuery.error) ??
                  t("recipes.collectionReadError")
                }
                onRetry={() => void recipeDatabaseQuery.refetch()}
                retrying={recipeDatabaseQuery.isFetching}
              />
            ) : null}
          </div>
          {collectionChoiceRequired ? (
            <p role="status" className="p-3 text-xs text-muted-foreground">
              {t("recipes.filterChooseCollection")}
            </p>
          ) : missingMetadataFilter ? (
            <p role="status" className="p-3 text-xs text-muted-foreground">
              {t("recipes.filterMetadataUnavailable")}
            </p>
          ) : null}
          {searchError ? (
            <div className="p-3">
              <PageError
                description={searchError}
                onRetry={() => void searchDocumentsQuery.refetch()}
                retrying={searchDocumentsQuery.isFetching}
              />
            </div>
          ) : collectionItemsError ? (
            <div className="p-3">
              <PageError
                description={collectionItemsError}
                onRetry={() => void collectionItemsQuery.refetch()}
                retrying={collectionItemsQuery.isFetching}
              />
            </div>
          ) : hasActiveFilters &&
            (searchDocumentsQuery.isLoading ||
              (selectedDatabaseId && collectionItemsQuery.isLoading)) &&
            visibleRecipeDocuments.length === 0 ? (
            <div className="space-y-2 p-3" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : documentsQuery.isLoading && !listLoaded && !hasActiveFilters ? (
            <div className="space-y-2 p-3" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : visibleRecipeDocuments.length > 0 ? (
            <>
              <nav aria-label={t("recipes.library")}>
                <ul className="divide-y divide-border">
                  {visibleRecipeDocuments.map((document) => {
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
              {hasActiveFilters &&
              (nextSearchOffset !== null || nextCollectionOffset !== null) ? (
                <div className="border-t border-border p-3">
                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    size="sm"
                    disabled={
                      searchDocumentsQuery.isFetching ||
                      collectionItemsQuery.isFetching
                    }
                    onClick={() => {
                      if (nextSearchOffset !== null) {
                        setRequestedSearchPage({
                          key: currentSearchKey,
                          offset: nextSearchOffset,
                        });
                      }
                      if (nextCollectionOffset !== null) {
                        setRequestedCollectionPage({
                          key: currentCollectionKey,
                          offset: nextCollectionOffset,
                        });
                      }
                    }}
                  >
                    {searchDocumentsQuery.isFetching ||
                    collectionItemsQuery.isFetching
                      ? t("recipes.loadingMore")
                      : t("recipes.loadMoreMatches")}
                  </Button>
                </div>
              ) : !hasActiveFilters &&
                (nextOffset !== null || nextCollectionOffset !== null) ? (
                <div className="border-t border-border p-3">
                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    size="sm"
                    disabled={
                      documentsQuery.isFetching ||
                      collectionItemsQuery.isFetching
                    }
                    onClick={() => {
                      if (nextOffset !== null) {
                        setRequestedPage({
                          spaceId: activeSpace.id,
                          offset: nextOffset,
                        });
                      }
                      if (nextCollectionOffset !== null) {
                        setRequestedCollectionPage({
                          key: currentCollectionKey,
                          offset: nextCollectionOffset,
                        });
                      }
                    }}
                  >
                    {documentsQuery.isFetching ||
                    collectionItemsQuery.isFetching
                      ? t("recipes.loadingMore")
                      : t("recipes.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : listError && !hasActiveFilters ? (
            <div className="p-3">
              <PageError
                description={listError}
                onRetry={() => void documentsQuery.refetch()}
                retrying={documentsQuery.isFetching}
              />
            </div>
          ) : hasActiveFilters || (listLoaded && recipeDocuments.length > 0) ? (
            <div className="grid justify-items-start gap-2 p-4">
              <p className="text-sm text-muted-foreground">
                {t("recipes.noMatchingRecipes")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRecipeSearch("");
                  setCuisineFilter("");
                  setTagFilter("");
                }}
              >
                {t("recipes.clearFilters")}
              </Button>
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
          {isCreatingRecipe ? (
            recipeDatabasesQuery.isError ? (
              <PageError
                description={
                  actionErrorMessage(recipeDatabasesQuery.error) ??
                  t("recipes.createCollectionError")
                }
                onRetry={() => void recipeDatabasesQuery.refetch()}
                retrying={recipeDatabasesQuery.isFetching}
              />
            ) : recipeDatabasesQuery.isLoading || !recipeDatabasesQuery.data ? (
              <div aria-busy="true" className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : recipeDatabases.length === 0 ? (
              <div className="grid justify-items-start gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("recipes.createCollectionMissing")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreatingRecipe(false)}
                >
                  {t("recipes.cancel")}
                </Button>
              </div>
            ) : recipeDatabases.length > 1 && !selectedDatabaseId ? (
              <div className="grid max-w-md gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="recipe-database-choice">
                    {t("recipes.chooseRecipeCollection")}
                  </Label>
                  <select
                    id="recipe-database-choice"
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value=""
                    onChange={(event) =>
                      setSelectedRecipeDatabaseId(event.currentTarget.value)
                    }
                  >
                    <option value="">{t("recipes.chooseCollection")}</option>
                    {recipeDatabases.map(
                      (database: { databaseId: string; title: string }) => (
                        <option
                          key={database.databaseId}
                          value={database.databaseId}
                        >
                          {database.title}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() => setIsCreatingRecipe(false)}
                >
                  {t("recipes.cancel")}
                </Button>
              </div>
            ) : recipeDatabaseResponse && !recipeDatabase ? (
              <p role="alert" className="text-sm text-destructive">
                {t("recipes.createCollectionUnavailable")}
              </p>
            ) : recipeDatabaseQuery.isError ? (
              <PageError
                description={
                  actionErrorMessage(recipeDatabaseQuery.error) ??
                  t("recipes.createCollectionError")
                }
                onRetry={() => void recipeDatabaseQuery.refetch()}
                retrying={recipeDatabaseQuery.isFetching}
              />
            ) : recipeDatabaseQuery.isLoading || !recipeDatabase ? (
              <div aria-busy="true" className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : recipeDatabaseSpaceId !== activeSpace.id ||
              mutationContract?.target?.spaceId !== activeSpace.id ? (
              <p role="alert" className="text-sm text-destructive">
                {t("recipes.createCollectionUnavailable")}
              </p>
            ) : !selectedFormView ||
              !mutationContract?.schemaRevision ||
              !mutationContract?.target ? (
              <p role="alert" className="text-sm text-destructive">
                {t("recipes.createFormUnavailable")}
              </p>
            ) : (
              <>
                {recipeDatabases.length > 1 ? (
                  <div className="mb-4 grid max-w-md gap-1.5">
                    <Label htmlFor="recipe-database-choice">
                      {t("recipes.chooseRecipeCollection")}
                    </Label>
                    <select
                      id="recipe-database-choice"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={selectedDatabaseId ?? ""}
                      onChange={(event) =>
                        setSelectedRecipeDatabaseId(event.currentTarget.value)
                      }
                    >
                      {recipeDatabases.map(
                        (database: { databaseId: string; title: string }) => (
                          <option
                            key={database.databaseId}
                            value={database.databaseId}
                          >
                            {database.title}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                ) : null}
                <RecipeCreationForm
                  onCancel={() => setIsCreatingRecipe(false)}
                  onCreate={(recipe) => {
                    const input = adaptRecipeCreateInput(recipe, {
                      target: {
                        spaceId: mutationContract.target.spaceId,
                        databaseId: mutationContract.target.databaseId,
                        databaseDocumentId:
                          mutationContract.target.databaseDocumentId,
                      },
                      formViewId: selectedFormView.id,
                      expectedSchemaRevision: mutationContract.schemaRevision,
                    });
                    return createRecipeMutation
                      .mutateAsync(input)
                      .then(adaptRecipeCreateResult);
                  }}
                />
              </>
            )
          ) : selectedRecipeId ? (
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
