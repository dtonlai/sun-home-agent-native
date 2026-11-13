export type RecipeListEntry = {
  id: string;
  title: string | null;
  contentPreview?: string | null;
};

export type RecipeIndexMetadata = {
  cuisines: string[];
  tags: string[];
};

export function parseRecipeIndexMetadata(content: string | null | undefined) {
  const metadata: RecipeIndexMetadata = { cuisines: [], tags: [] };
  if (!content) return metadata;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*+]\s+|>\s*)?/, "").trim();
    const match = /^(cuisine|tags?)\s*:\s*(.*)$/i.exec(line);
    if (!match?.[2].trim()) continue;
    if (match[1].toLowerCase().startsWith("cuisine")) {
      const cuisine = match[2].trim();
      if (!metadata.cuisines.includes(cuisine)) metadata.cuisines.push(cuisine);
    } else {
      for (const tag of match[2].split(/[,;|]/).map((value) => value.trim())) {
        if (
          tag &&
          !metadata.tags.some(
            (existing) => existing.toLowerCase() === tag.toLowerCase(),
          )
        ) {
          metadata.tags.push(tag);
        }
      }
    }
  }

  return metadata;
}

export function cuisineOptions(entries: RecipeListEntry[]) {
  const cuisines = entries.flatMap(
    (entry) => parseRecipeIndexMetadata(entry.contentPreview).cuisines,
  );
  return [...new Set(cuisines)].sort((a, b) => a.localeCompare(b));
}

export function filterRecipeEntries(
  entries: RecipeListEntry[],
  query: string,
  cuisine: string,
) {
  const search = query.trim().toLocaleLowerCase();
  const selectedCuisine = cuisine.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    const metadata = parseRecipeIndexMetadata(entry.contentPreview);
    const hasCuisine =
      !selectedCuisine ||
      metadata.cuisines.some(
        (value) => value.toLocaleLowerCase() === selectedCuisine,
      );
    const searchable = [
      entry.title ?? "",
      entry.contentPreview ?? "",
      ...metadata.tags,
      ...metadata.cuisines,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return hasCuisine && (!search || searchable.includes(search));
  });
}
