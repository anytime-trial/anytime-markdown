"use client";

/**
 * Footnote Reference Extension
 *
 * MathInline と同じパターンで脚注参照 [^id] をサポートする。
 * - sanitizeMarkdown で [^id] → <sup data-footnote-ref="id">id</sup> に前処理
 * - parseHTML で <sup data-footnote-ref> を検出
 * - InputRule: [^id] パターンで FootnoteRef ノードに変換
 * - serialize: [^id] を出力
 */
import { Box, useTheme } from "@mui/material";

import { getPrimaryMain } from "../constants/colors";
import { InputRule,Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper,ReactNodeViewRenderer } from "@tiptap/react";

/** FootnoteRef NodeView コンポーネント */
function FootnoteRefView({ node, selected }: NodeViewProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const noteId = node.attrs.noteId as string;

  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <Box
        component="span"
        sx={{
          display: "inline",
          cursor: "default",
          fontSize: "0.75em",
          verticalAlign: "super",
          lineHeight: 1,
          color: getPrimaryMain(isDark),
          fontWeight: 600,
          borderRadius: 0.5,
          px: 0.25,
          ...(selected && {
            outline: `2px solid ${getPrimaryMain(isDark)}`,
            outlineOffset: 1,
          }),
        }}
      >
        [{noteId}]
      </Box>
    </NodeViewWrapper>
  );
}

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      noteId: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "sup[data-footnote-ref]",
        getAttrs: (el) => {
          if (typeof el === "string") return false;
          return { noteId: el.dataset.footnoteRef ?? "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", { "data-footnote-ref": HTMLAttributes.noteId }, HTMLAttributes.noteId];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteRefView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\^([^\]]+)\]$/,
        handler: ({ state, range, match, chain }) => {
          const noteId = match[1];
          if (!noteId) return;
          const node = state.schema.nodes.footnoteRef.create({ noteId });
          chain().insertContentAt({ from: range.from, to: range.to }, node.toJSON()).run();
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { noteId: string } },
        ) {
          state.write(`[^${node.attrs.noteId}]`);
        },
        parse: {},
      },
    };
  },
});
