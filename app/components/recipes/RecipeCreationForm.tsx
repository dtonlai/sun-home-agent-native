import { actionErrorMessage } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RecipeGroupInput = {
  name: string | null;
  entries: string[];
};

export type RecipeDraftInput = {
  idempotencyKey: string;
  title: string;
  servings: string | null;
  ingredientGroups: RecipeGroupInput[];
  instructionGroups: RecipeGroupInput[];
  notes: Array<{ title: string; nfm: string }>;
  tags: string[];
  cuisine: string | null;
  sourceLinks: Array<{ title?: string; url: string }>;
  additionalNfm: string;
};

export type CreatedRecipe = {
  documentId: string;
  urlPath: string;
};

type TextGroup = { name: string; text: string };
type NamedNote = { title: string; text: string };
type SourceLink = { title: string; url: string };

const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function initialGroup(): TextGroup {
  return { name: "", text: "" };
}

function addUniqueTag(tags: string[], value: string) {
  const tag = value.trim();
  if (
    !tag ||
    tags.some(
      (existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase(),
    )
  ) {
    return tags;
  }
  return [...tags, tag];
}

export function RecipeCreationForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (recipe: RecipeDraftInput) => Promise<CreatedRecipe>;
}) {
  const t = useT();
  const id = useId();
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [ingredientGroups, setIngredientGroups] = useState<TextGroup[]>([
    initialGroup(),
  ]);
  const [instructionGroups, setInstructionGroups] = useState<TextGroup[]>([
    initialGroup(),
  ]);
  const [notes, setNotes] = useState<NamedNote[]>([]);
  const [sources, setSources] = useState<SourceLink[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [additionalNfm, setAdditionalNfm] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRecipe, setCreatedRecipe] = useState<CreatedRecipe | null>(
    null,
  );
  const idempotencyKeys = useRef(new Map<string, string>());

  const updateGroup = (
    setGroups: (update: (groups: TextGroup[]) => TextGroup[]) => void,
    index: number,
    patch: Partial<TextGroup>,
  ) =>
    setGroups((groups) =>
      groups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, ...patch } : group,
      ),
    );

  const addTag = (value: string) => {
    setTags((current) => addUniqueTag(current, value));
    setTagDraft("");
  };

  const reset = () => {
    idempotencyKeys.current.clear();
    setTitle("");
    setServings("");
    setIngredientGroups([initialGroup()]);
    setInstructionGroups([initialGroup()]);
    setNotes([]);
    setSources([]);
    setTags([]);
    setTagDraft("");
    setCuisine("");
    setAdditionalNfm("");
    setError(null);
    setCreatedRecipe(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || createdRecipe) return;
    setError(null);
    if (!title.trim() || title.trim().length > 500) {
      setError(t("recipes.createTitleRequired"));
      return;
    }
    const ingredients = ingredientGroups
      .map((group) => ({
        name: group.name.trim() || null,
        entries: lines(group.text),
      }))
      .filter((group) => group.entries.length > 0);
    const instructions = instructionGroups
      .map((group) => ({
        name: group.name.trim() || null,
        entries: lines(group.text),
      }))
      .filter((group) => group.entries.length > 0);
    const hasNamedEmptyGroup = [...ingredientGroups, ...instructionGroups].some(
      (group) => group.name.trim() && lines(group.text).length === 0,
    );
    if (hasNamedEmptyGroup) {
      setError(t("recipes.namedGroupNeedsEntries"));
      return;
    }
    if (ingredients.length === 0 || instructions.length === 0) {
      setError(t("recipes.createSectionsRequired"));
      return;
    }
    const hasPartialNote = notes.some((note) => {
      const hasTitle = Boolean(note.title.trim());
      const hasBody = Boolean(note.text.trim());
      return hasTitle !== hasBody;
    });
    if (hasPartialNote) {
      setError(t("recipes.noteNeedsTitleAndDetails"));
      return;
    }
    const validNotes = notes
      .map((note) => ({ title: note.title.trim(), nfm: note.text }))
      .filter((note) => note.title && note.nfm.trim());
    const sourceLinks = sources
      .map((source) => ({
        title: source.title.trim() || undefined,
        url: source.url.trim(),
      }))
      .filter((source) => source.url);
    if (sources.some((source) => source.title.trim() && !source.url.trim())) {
      setError(t("recipes.sourceNeedsUrl"));
      return;
    }
    const submittedTags = addUniqueTag(tags, tagDraft);
    if (tagDraft.trim()) {
      setTags(submittedTags);
      setTagDraft("");
    }
    const intent = {
      title: title.trim(),
      servings: servings.trim() ? servings : null,
      ingredientGroups: ingredients,
      instructionGroups: instructions,
      notes: validNotes,
      tags: submittedTags,
      cuisine: cuisine.trim() ? cuisine : null,
      sourceLinks,
      additionalNfm,
    };
    const fingerprint = JSON.stringify(intent);
    let idempotencyKey = idempotencyKeys.current.get(fingerprint);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      idempotencyKeys.current.set(fingerprint, idempotencyKey);
    }
    const input: RecipeDraftInput = { ...intent, idempotencyKey };
    setIsPending(true);
    try {
      setCreatedRecipe(await onCreate(input));
    } catch (cause) {
      setError(actionErrorMessage(cause) ?? t("recipes.createError"));
    } finally {
      setIsPending(false);
    }
  };

  const renderGroups = (
    kind: "ingredients" | "instructions",
    groups: TextGroup[],
    setGroups: (update: (groups: TextGroup[]) => TextGroup[]) => void,
  ) => {
    const heading = t(
      kind === "ingredients"
        ? "recipes.ingredientGroups"
        : "recipes.instructionGroups",
    );
    const entryLabel = t(
      kind === "ingredients" ? "recipes.ingredients" : "recipes.instructions",
    );
    return (
      <fieldset className="grid min-w-0 gap-4 rounded-md border border-border p-4">
        <legend className="px-1 text-base font-semibold">{heading}</legend>
        {groups.map((group, index) => {
          const nameId = `${id}-${kind}-${index}-name`;
          const entriesId = `${id}-${kind}-${index}-entries`;
          return (
            <div
              key={`${kind}-${index}`}
              className="grid min-w-0 gap-3 rounded-md bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {heading} {index + 1}
                </h3>
                {groups.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setGroups((current) =>
                        current.filter((_, groupIndex) => groupIndex !== index),
                      )
                    }
                    aria-label={t("recipes.removeGroup", {
                      number: String(index + 1),
                      group: heading,
                    })}
                  >
                    {t("recipes.remove")}
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={nameId}>{t("recipes.groupNameOptional")}</Label>
                <Input
                  id={nameId}
                  value={group.name}
                  onChange={(event) =>
                    updateGroup(setGroups, index, {
                      name: event.currentTarget.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={entriesId}>{entryLabel}</Label>
                <Textarea
                  id={entriesId}
                  rows={4}
                  value={group.text}
                  onChange={(event) =>
                    updateGroup(setGroups, index, {
                      text: event.currentTarget.value,
                    })
                  }
                  placeholder={t("recipes.oneEntryPerLine")}
                />
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => setGroups((current) => [...current, initialGroup()])}
        >
          {t("recipes.addGroup", { group: heading })}
        </Button>
      </fieldset>
    );
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="grid min-w-0 gap-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {t("recipes.addRecipe")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("recipes.createRecipeDescription")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {t("recipes.cancel")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-title`}>{t("recipes.recipeTitle")}</Label>
          <Input
            id={`${id}-title`}
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-servings`}>{t("recipes.servings")}</Label>
          <Input
            id={`${id}-servings`}
            value={servings}
            onChange={(event) => setServings(event.currentTarget.value)}
            placeholder={t("recipes.servingsExample")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-cuisine`}>
            {t("recipes.cuisineOptional")}
          </Label>
          <Input
            id={`${id}-cuisine`}
            value={cuisine}
            onChange={(event) => setCuisine(event.currentTarget.value)}
          />
        </div>
      </div>

      {renderGroups("ingredients", ingredientGroups, setIngredientGroups)}
      {renderGroups("instructions", instructionGroups, setInstructionGroups)}

      <fieldset className="grid min-w-0 gap-4 rounded-md border border-border p-4">
        <legend className="px-1 text-base font-semibold">
          {t("recipes.notesOptional")}
        </legend>
        {notes.map((note, index) => (
          <div
            key={`note-${index}`}
            className="grid gap-3 rounded-md bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                {t("recipes.noteNumber", { number: String(index + 1) })}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("recipes.removeNote", {
                  number: String(index + 1),
                })}
                onClick={() =>
                  setNotes((current) => current.filter((_, i) => i !== index))
                }
              >
                {t("recipes.remove")}
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-note-${index}-title`}>
                {t("recipes.noteTitle")}
              </Label>
              <Input
                id={`${id}-note-${index}-title`}
                required
                value={note.title}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setNotes((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, title: value } : item,
                    ),
                  );
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-note-${index}-body`}>
                {t("recipes.noteBody")}
              </Label>
              <Textarea
                id={`${id}-note-${index}-body`}
                required
                rows={4}
                value={note.text}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setNotes((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, text: value } : item,
                    ),
                  );
                }}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() =>
            setNotes((current) => [...current, { title: "", text: "" }])
          }
        >
          {t("recipes.addNote")}
        </Button>
      </fieldset>

      <fieldset className="grid min-w-0 gap-4 rounded-md border border-border p-4">
        <legend className="px-1 text-base font-semibold">
          {t("recipes.sourceOptional")}
        </legend>
        {sources.map((source, index) => (
          <div key={`source-${index}`} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-source-${index}-title`}>
                {t("recipes.sourceTitleOptional")}
              </Label>
              <Input
                id={`${id}-source-${index}-title`}
                value={source.title}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSources((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, title: value } : item,
                    ),
                  );
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-source-${index}-url`}>
                {t("recipes.sourceUrl")}
              </Label>
              <Input
                id={`${id}-source-${index}-url`}
                type="url"
                value={source.url}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setSources((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, url: value } : item,
                    ),
                  );
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit sm:col-span-2"
              aria-label={t("recipes.removeSource", {
                number: String(index + 1),
              })}
              onClick={() =>
                setSources((current) => current.filter((_, i) => i !== index))
              }
            >
              {t("recipes.remove")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() =>
            setSources((current) => [...current, { title: "", url: "" }])
          }
        >
          {t("recipes.addSource")}
        </Button>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-tags`}>{t("recipes.tagsOptional")}</Label>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm"
            >
              {tag}
              <button
                type="button"
                className="rounded-full px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("recipes.removeTag", { tag })}
                onClick={() =>
                  setTags((current) => current.filter((item) => item !== tag))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <Input
          id={`${id}-tags`}
          value={tagDraft}
          onChange={(event) => setTagDraft(event.currentTarget.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => tagDraft.trim() && addTag(tagDraft)}
          placeholder={t("recipes.addTagPlaceholder")}
          aria-describedby={`${id}-tags-help`}
        />
        <p id={`${id}-tags-help`} className="text-xs text-muted-foreground">
          {t("recipes.tagsHelp")}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-additional`}>
          {t("recipes.additionalDetailsOptional")}
        </Label>
        <Textarea
          id={`${id}-additional`}
          rows={5}
          value={additionalNfm}
          onChange={(event) => setAdditionalNfm(event.currentTarget.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {createdRecipe ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm"
        >
          <span>{t("recipes.createSuccess")}</span>
          <Link className="font-medium underline" to={createdRecipe.urlPath}>
            {t("recipes.openCreatedRecipe")}
          </Link>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending || Boolean(createdRecipe)}>
          {isPending ? t("recipes.createPending") : t("recipes.saveRecipe")}
        </Button>
        {createdRecipe ? (
          <Button type="button" variant="outline" onClick={reset}>
            {t("recipes.createAnother")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
