"use client";

import { Box, useTheme } from "@mui/material";
import { InputRule,Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper,ReactNodeViewRenderer } from "@tiptap/react";
import DOMPurify from "dompurify";
import type katexType from "katex";
import { useCallback,useEffect, useState } from "react";

import { MATH_SANITIZE_CONFIG } from "../hooks/useKatexRender";

/** Lazy-load KaTeX (shared instance with useKatexRender) */
let katexInstance: typeof katexType | null = null;
let cssLoaded = false;

async function getKatex() {
  if (!katexInstance) {
    const mod = await import("katex");
    katexInstance = mod.default;
  }
  if (!cssLoaded) {
    // @ts-expect-error CSS import has no type declarations
    await import("katex/dist/katex.min.css");
    cssLoaded = true;
  }
  return katexInstance;
}

/** Inline math NodeView component */
function MathInlineView({ node, selected }: NodeViewProps) {
  const theme = useTheme();
  const formula = node.attrs.formula as string;
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!formula) return;
    let cancelled = false;
    getKatex().then((katex) => {
      if (cancelled) return;
      try {
        const rendered = katex.renderToString(formula, {
          displayMode: false,
          throwOnError: false,
        });
        setHtml(rendered);
      } catch {
        const safe = DOMPurify.sanitize(formula, { ALLOWED_TAGS: [] });
        setHtml(`<span style="color:var(--vscode-errorForeground, #d32f2f)">${safe}</span>`);
      }
    });
    return () => { cancelled = true; };
  }, [formula]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <NodeViewWrapper as="span" style={{ display: "inline" }}>
      <Box
        component="span"
        onClick={handleClick}
        sx={{
          display: "inline",
          cursor: "default",
          borderRadius: 0.5,
          ...(selected && {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 1,
          }),
        }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(html, MATH_SANITIZE_CONFIG),
        }}
      />
    </NodeViewWrapper>
  );
}

/**
 * Inline math node extension for TipTap
 *
 * - Parses `<span data-math-inline="...">` from preprocessed HTML
 * - InputRule: typing `$...$` converts to inline math node
 * - Serializes to `$...$` in Markdown output
 */
export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      formula: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-math-inline]",
        getAttrs: (el) => {
          if (typeof el === "string") return false;
          return { formula: el.getAttribute("data-math-inline") || "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-math-inline": HTMLAttributes.formula }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$]+)\$$/,
        handler: ({ state, range, match, chain }) => {
          const formula = match[1];
          if (!formula) return;
          const node = state.schema.nodes.mathInline.create({ formula });
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
          node: { attrs: { formula: string } },
        ) {
          state.write(`$${node.attrs.formula}$`);
        },
        parse: {},
      },
    };
  },
});
