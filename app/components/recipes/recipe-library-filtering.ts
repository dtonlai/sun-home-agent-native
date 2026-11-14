import type {
  ContentDatabaseFilter,
  ContentDatabaseTableQuery,
} from "@shared/api";

export type RecipeListEntry = {
  id: string;
  title: string | null;
  /** A short, display-only action preview; never used to infer metadata. */
  contentPreview?: string | null;
  /** Full body content is supplied only by an authorized full-document read. */
  fullContent?: string | null;
  cuisines?: string[];
  tags?: string[];
};

export type RecipeIndexMetadata = {
  cuisines: string[];
  tags: string[];
};

function uniqueText(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Parses authoritative full page text, never list-documents previews. */
export function parseRecipeIndexMetadata(content: string | null | undefined) {
  const metadata: RecipeIndexMetadata = { cuisines: [], tags: [] };
  if (!content) return metadata;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*+]\s+|>\s*)?/, "").trim();
    const match = /^(cuisine|tags?)\s*:\s*(.*)$/i.exec(line);
    if (!match?.[2].trim()) continue;
    if (match[1].toLowerCase().startsWith("cuisine")) {
      metadata.cuisines.push(match[2].trim());
    } else {
      metadata.tags.push(
        ...match[2].split(/[,;|]/).map((value) => value.trim()),
      );
    }
  }

  return {
    cuisines: uniqueText(metadata.cuisines),
    tags: uniqueText(metadata.tags),
  };
}

function propertyTextValues(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueText(
      value.filter((item): item is string => typeof item === "string"),
    );
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const decoded: unknown = JSON.parse(value);
    if (Array.isArray(decoded)) {
      return uniqueText(
        decoded.filter((item): item is string => typeof item === "string"),
      );
    }
  } catch {
    // Text properties may contain one free-form value or a comma-separated list.
  }
  return uniqueText(value.split(/[,;|]/));
}

export function recipeEntryFromCollectionItem(item: {
  document: { id: string; title: string | null };
  properties: Array<{ definition: { name: string }; value: unknown }>;
}): RecipeListEntry {
  const cuisineProperty = item.properties.find(
    (property) =>
      property.definition.name.trim().toLocaleLowerCase() === "cuisine",
  );
  const tagsProperty = item.properties.find(
    (property) =>
      property.definition.name.trim().toLocaleLowerCase() === "tags",
  );
  return {
    id: item.document.id,
    title: item.document.title,
    cuisines: propertyTextValues(cuisineProperty?.value),
    tags: propertyTextValues(tagsProperty?.value),
  };
}

/** Pulls a metadata label from a search action's query-centered body snippet. */
export function cuisineFromSearchSnippet(snippet: string | null | undefined) {
  if (!snippet) return null;
  const compact = snippet.replace(/\.{3}/g, " ").replace(/\s+/g, " ").trim();
  const match =
    /(?:^|\s)cuisine\s*:\s*(.+?)(?=\s+(?:tags?|servings?|ingredients?|instructions?|method|source|yield|prep|cook|notes?)\s*:|\s+#{1,6}\s|$)/i.exec(
      compact,
    );
  const cuisine = match?.[1]?.trim().replace(/[;,.]+$/, "");
  return cuisine || null;
}

export function cuisineOptions(entries: RecipeListEntry[]) {
  const cuisines = entries.flatMap((entry) => [
    ...(entry.cuisines ?? []),
    ...parseRecipeIndexMetadata(entry.fullContent).cuisines,
  ]);
  return uniqueText(cuisines).sort((a, b) => a.localeCompare(b));
}

export function buildRecipeDocumentSearchQuery(
  search: string,
  cuisine: string,
  tag: string,
) {
  const terms = [search.trim(), tag.trim()];
  const selectedCuisine = cuisine.trim();
  if (selectedCuisine) {
    terms.push(`"Cuisine: ${selectedCuisine.replace(/"/g, '\\"')}"`);
  }
  return terms.filter(Boolean).join(" ");
}

export function buildRecipeCollectionTableQuery({
  search,
  cuisine,
  tag,
  cuisineProperty,
  tagsProperty,
}: {
  search: string;
  cuisine: string;
  tag: string;
  cuisineProperty?: { id: string; name: string; type?: string };
  tagsProperty?: { id: string; name: string; type?: string };
}): ContentDatabaseTableQuery {
  const filters: ContentDatabaseFilter[] = [];
  if (cuisine.trim() && cuisineProperty) {
    filters.push({
      key: cuisineProperty.id,
      label: cuisineProperty.name,
      operator: cuisineProperty.type === "text" ? "equals" : "contains",
      value: cuisine.trim(),
    });
  }
  if (tag.trim() && tagsProperty) {
    filters.push({
      key: tagsProperty.id,
      label: tagsProperty.name,
      operator: "contains",
      value: tag.trim(),
    });
  }
  return {
    search: search.trim(),
    filters,
    sorts: [],
    filterMode: "and",
  };
}

export function filterRecipeEntries(
  entries: RecipeListEntry[],
  query: string,
  cuisine: string,
  tag = "",
) {
  const search = query.trim().toLocaleLowerCase();
  const selectedCuisine = cuisine.trim().toLocaleLowerCase();
  const selectedTag = tag.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    const metadata = {
      cuisines: uniqueText([
        ...(entry.cuisines ?? []),
        ...parseRecipeIndexMetadata(entry.fullContent).cuisines,
      ]),
      tags: uniqueText([
        ...(entry.tags ?? []),
        ...parseRecipeIndexMetadata(entry.fullContent).tags,
      ]),
    };
    const hasCuisine =
      !selectedCuisine ||
      metadata.cuisines.some(
        (value) => value.toLocaleLowerCase() === selectedCuisine,
      );
    const hasTag =
      !selectedTag ||
      metadata.tags.some((value) =>
        value.toLocaleLowerCase().includes(selectedTag),
      );
    const searchable = [
      entry.title ?? "",
      entry.fullContent ?? "",
      ...metadata.tags,
      ...metadata.cuisines,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return hasCuisine && hasTag && (!search || searchable.includes(search));
  });
}
