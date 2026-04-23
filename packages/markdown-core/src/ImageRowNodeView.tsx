"use client";

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";

export function ImageRowNodeView({ node, selected }: Readonly<NodeViewProps>) {
  const t = useTranslations("MarkdownEditor");
  const count = node.childCount;
  return (
    <NodeViewWrapper
      as="div"
      data-image-row=""
      data-selected={selected ? "true" : "false"}
      className="image-row"
      role="group"
      aria-label={t("imageRowAriaLabel", { count })}
    >
      <NodeViewContent
        as="div"
        className="image-row-content"
        data-image-row-content=""
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "flex-start",
          margin: "8px 0",
        }}
      />
    </NodeViewWrapper>
  );
}
