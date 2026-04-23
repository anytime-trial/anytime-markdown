"use client";

import { Box } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useTranslations } from "next-intl";

export function ImageRowNodeView({ node, selected }: Readonly<NodeViewProps>) {
  const t = useTranslations();
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
      <Box
        component={NodeViewContent}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          alignItems: "flex-start",
          my: 1,
        }}
        data-image-row-content=""
      />
    </NodeViewWrapper>
  );
}
