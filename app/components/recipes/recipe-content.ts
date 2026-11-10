export interface RecipeContentSections {
  servings: string | null;
  ingredients: string;
  instructions: string;
  additional: string;
  hasNamedSections: boolean;
}

const SERVINGS_LINE =
  /^\s*(?:\*\*)?(?:servings?|yield|makes|serves)(?:\*\*)?\s*:?\s*(.+?)\s*$/i;
const HEADING_LINE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

function sectionName(heading: string) {
  return heading
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLocaleLowerCase();
}

/** Split common recipe headings while keeping all unrecognized Markdown. */
export function parseRecipeContent(content: string): RecipeContentSections {
  const sections: Record<
    "ingredients" | "instructions" | "additional",
    string[]
  > = {
    ingredients: [],
    instructions: [],
    additional: [],
  };
  let current: keyof typeof sections = "additional";
  let servings: string | null = null;
  let hasNamedSections = false;

  for (const line of content.split(/\r?\n/)) {
    const servingsMatch = SERVINGS_LINE.exec(line);
    if (servingsMatch && servings === null) {
      servings = servingsMatch[1]?.trim() || null;
      continue;
    }

    const heading = HEADING_LINE.exec(line);
    if (heading) {
      const name = sectionName(heading[2] ?? "");
      if (name === "ingredients" || name === "what you'll need") {
        current = "ingredients";
        hasNamedSections = true;
        continue;
      }
      if (
        name === "instructions" ||
        name === "directions" ||
        name === "method" ||
        name === "steps" ||
        name === "preparation"
      ) {
        current = "instructions";
        hasNamedSections = true;
        continue;
      }
      current = "additional";
      sections.additional.push(line);
      continue;
    }

    sections[current].push(line);
  }

  const normalize = (lines: string[]) => lines.join("\n").trim();
  return {
    servings,
    ingredients: normalize(sections.ingredients),
    instructions: normalize(sections.instructions),
    additional: normalize(sections.additional),
    hasNamedSections,
  };
}
