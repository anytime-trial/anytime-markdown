"use client";

/**
 * Footnote Reference Extension
 *
 * MathInline と同じパターンで脚注参照 [^id] をサポートする。
 * - sanitizeMarkdown で [^id] → <sup data-footnote-ref="id">id</sup> に前処理
 * - parseHTML で <sup data-footnote-ref> を検出
 * - InputRule: [^id] パターンで FootnoteRef ノードに変換
 * - serialize: [^id] を出力
 * - ホバーで脚注定義テキストをツールチップ表示
 * - クリックで定義内のURLを新しいタブで開く
 */
import { Box, Tooltip, useTheme } from "@mui/material";
import { useCallback } from "react";

import { getPrimaryMain } from "../constants/colors";
import { InputRule,Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper,ReactNodeViewRenderer } from "@tiptap/react";

/** ProseMirror ドキュメントから脚注定義テキスト（[^id]: 以降）を検索 */
export function findFootnoteDefinition(
  doc: ProseMirrorNode,
  noteId: string,
): string | null {
  const pattern = `[^${noteId}]:`;
  let result: string | null = null;
  doc.descendants((node) => {
    if (result !== null) return false;
    if (node.type.name === "paragraph") {
      const text = node.textContent;
      const idx = text.indexOf(pattern);
      if (idx >= 0) {
        let defText = text.slice(idx + pattern.length).trim();
        // 同一段落に別の脚注定義 [^id]: が続く場合、そこで打ち切る
        const nextDef = defText.search(/\[\^[^\]]+\]:/);
        if (nextDef >= 0) {
          defText = defText.slice(0, nextDef).trim();
        }
        result = defText;
        return false;
      }
    }
  });
  return result;
}

/** テキストから最初の URL を抽出 */
export function extractUrlFromText(text: string): string | null {
  const match = /https?:\/\/[^\s)>\]]+/.exec(text);
  return match ? match[0] : null;
}

/** FootnoteRef NodeView コンポーネント */
function FootnoteRefView({ node, selected, editor }: Readonly<NodeViewProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const noteId = node.attrs.noteId as string;

  // MUI Tooltip は handleEnter 内で title が空文字なら開かないため、
  // useState + onMouseEnter だと非同期の setState が間に合わない。
  // レンダー時に同期的に計算して title に渡す。
  const defText = findFootnoteDefinition(editor.state.doc, noteId) ?? "";
  const defUrl = defText ? extractUrlFromText(defText) : null;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const def = findFootnoteDefinition(editor.state.doc, noteId);
      if (!def) return;
      const url = extractUrlFromText(def);
      if (url) {
        e.preventDefault();
        e.stopPropagation();
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    [editor, noteId],
  );

  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <Tooltip title={defText} placement="top" arrow>
        <Box
          component="span"
          onClick={handleClick}
          sx={{
            display: "inline",
            cursor: defUrl ? "pointer" : "default",
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
      </Tooltip>
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
