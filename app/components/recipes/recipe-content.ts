export type RecipeComponent = {
  name: string;
  ingredients: string;
  instructions: string;
};

export type ParsedRecipeContent = {
  servings: string | null;
  ingredients: string;
  instructions: string;
  components: RecipeComponent[];
  additional: string;
  hasNamedSections: boolean;
};

type Section = "ingredients" | "instructions" | "additional";

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const clean = (lines: string[]) => lines.join("\n").trim();
const labelPattern =
  /^(ingredients?|what you'll need|components?|instructions?|directions?|method|steps?|preparation|servings?|serving size|yield|makes|serves|additional details|notes?)\s*:?\s*(.*)$/i;

function heading(line: string): { section: Section; value: string } | null {
  const text = line.trim().replace(/^#{1,6}\s*/, "");
  const match = text.match(labelPattern);
  if (!match) return null;
  const label = match[1].toLocaleLowerCase();
  if (/^servings?$|^serving size$|^yield$|^makes$|^serves$/.test(label))
    return null;
  if (/^ingredients?$|^what you'll need$/.test(label))
    return { section: "ingredients", value: match[2] };
  if (/^components?$/.test(label))
    return { section: "additional", value: match[2] };
  if (
    /^instructions?$|^directions?$|^method$|^steps?$|^preparation$/.test(label)
  )
    return { section: "instructions", value: match[2] };
  return { section: "additional", value: match[2] };
}

export function parseRecipeContent(content: string): ParsedRecipeContent {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const buckets: Record<Section, string[]> = {
    ingredients: [],
    instructions: [],
    additional: [],
  };
  const components: RecipeComponent[] = [];
  let current: Section = "additional";
  let activeComponent: RecipeComponent | null = null;
  let servings: string | null = null;
  let hasNamedSections = false;

  const push = (section: Section, line: string) => {
    if (!line.trim()) return;
    if (
      (section === "ingredients" || section === "instructions") &&
      activeComponent
    ) {
      activeComponent[section] = [activeComponent[section], line]
        .filter(Boolean)
        .join("\n");
    } else buckets[section].push(line);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const servingMatch = line
      .trim()
      .match(/^(?:serving(?:s| size)?|yield|makes|serves)\s*:?\s*(.*)$/i);
    if (servingMatch) {
      hasNamedSections = true;
      let value = servingMatch[1].trim();
      if (!value) {
        let next = i + 1;
        while (next < lines.length && !lines[next].trim()) next++;
        if (next < lines.length && !heading(lines[next])) {
          value = lines[next].trim();
          i = next;
        }
      }
      if (value) servings = value;
      continue;
    }

    const parsedHeading = heading(line);
    if (parsedHeading) {
      hasNamedSections = true;
      current = parsedHeading.section;
      activeComponent = null;
      if (parsedHeading.value) {
        push(current, current === "additional" ? line : parsedHeading.value);
      } else if (current === "additional" && line.trim()) {
        buckets.additional.push(line);
      }
      continue;
    }

    const trimmed = line.trim();
    if (/^(?:source|related links?)\s*:/i.test(trimmed)) {
      activeComponent = null;
      current = "additional";
      buckets.additional.push(line);
      continue;
    }
    if ((current === "ingredients" || current === "instructions") && trimmed) {
      const markdownGroup = trimmed.match(/^#{2,6}\s+(.+?)\s*#*$/);
      let nextLine = i + 1;
      while (nextLine < lines.length && !lines[nextLine].trim()) nextLine++;
      const nextText = lines[nextLine]?.trim() ?? "";
      const standaloneLabel =
        /^[A-Z][\p{L}\p{N}'’&/()+ -]{0,58}[\p{L}\p{N})]$/u.test(trimmed) &&
        !/[.!?,;]$/.test(trimmed) &&
        Boolean(nextText) &&
        (current === "ingredients"
          ? /^[-*+]\s|^\d+(?:[.)]|\s)/.test(nextText)
          : components.some(
              (component) => normalize(component.name) === normalize(trimmed),
            ));
      const componentMatch =
        markdownGroup ??
        trimmed.match(/^\*\*(.+?)\*\*\s*:?\s*$/) ??
        trimmed.match(/^([^:#][^:]*):\s*$/) ??
        (standaloneLabel ? [trimmed, trimmed] : null);
      if (componentMatch) {
        const name = componentMatch[1].trim();
        if (name && !heading(name)) {
          const key = normalize(name);
          activeComponent =
            components.find((component) => normalize(component.name) === key) ??
            null;
          if (!activeComponent) {
            activeComponent = { name, ingredients: "", instructions: "" };
            components.push(activeComponent);
          }
          continue;
        }
      }
    }
    push(current, line);
  }

  return {
    servings,
    ingredients: clean(buckets.ingredients),
    instructions: clean(buckets.instructions),
    components,
    additional: clean(buckets.additional),
    hasNamedSections,
  };
}
