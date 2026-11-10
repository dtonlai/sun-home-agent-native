import { BlockRegistryProvider } from "@agent-native/toolkit/app/blocks";
import { useMemo } from "react";

import { publicContentBlockRegistry } from "@/blocks/publicBlockRegistry";
import { VisualEditor } from "@/components/editor/VisualEditor";

export function RecipeMarkdown({
  documentId,
  content,
}: {
  documentId: string;
  content: string;
}) {
  const context = useMemo(
    () => ({ dialect: "nfm" as const, documentId, canEdit: false }),
    [documentId],
  );

  return (
    <BlockRegistryProvider registry={publicContentBlockRegistry} ctx={context}>
      <div className="content-editor min-w-0">
        <VisualEditor
          key={`${documentId}:${content}`}
          documentId={documentId}
          content={content}
          onChange={() => {}}
          editable={false}
        />
      </div>
    </BlockRegistryProvider>
  );
}
