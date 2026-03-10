import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const headingNumberPluginKey = new PluginKey("headingNumber");

/** 手動セクション番号パターン（例: "1. ", "1.2 ", "1.2.3. "） */
const MANUAL_NUMBER_RE = /^\d+(\.\d+)*\.?\s/;

/**
 * ドキュメント内の見出しに手動セクション番号が含まれているか判定する。
 * 見出しが2つ以上あり、半数以上が手動番号を持つ場合 true を返す。
 */
export function hasManualSectionNumbers(
  doc: import("@tiptap/pm/model").Node,
): boolean {
  let headingCount = 0;
  let numberedCount = 0;

  doc.descendants((node) => {
    if (node.type.name !== "heading") return;
    headingCount++;
    if (MANUAL_NUMBER_RE.test(node.textContent)) {
      numberedCount++;
    }
  });

  return headingCount >= 2 && numberedCount >= headingCount / 2;
}

function buildNumberDecorations(
  doc: import("@tiptap/pm/model").Node,
  mode: "auto" | "on" | "off",
): DecorationSet {
  if (mode === "off") return DecorationSet.empty;
  if (mode === "auto" && hasManualSectionNumbers(doc)) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  const counters = [0, 0, 0, 0, 0]; // h1-h5

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = (node.attrs.level as number) - 1; // 0-indexed
    counters[level]++;
    // 下位レベルをリセット
    for (let i = level + 1; i < 5; i++) counters[i] = 0;
    // 番号文字列を生成（例: "1.2.3"）
    const number = counters.slice(0, level + 1).join(".") + ". ";
    const widget = Decoration.widget(
      pos + 1,
      () => {
        const span = document.createElement("span");
        span.className = "heading-number";
        span.textContent = number;
        return span;
      },
      { side: -1 },
    );
    decorations.push(widget);
  });

  return DecorationSet.create(doc, decorations);
}

type HeadingNumberMode = "auto" | "on" | "off";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingNumber: {
      setShowHeadingNumbers: (mode: HeadingNumberMode) => ReturnType;
    };
  }
}

export const HeadingNumberExtension = Extension.create({
  name: "headingNumber",

  addCommands() {
    return {
      setShowHeadingNumbers:
        (mode: HeadingNumberMode) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(headingNumberPluginKey, mode);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingNumberPluginKey,
        state: {
          init(_, state): DecorationSet {
            // 初期表示時に自動判定
            return buildNumberDecorations(state.doc, "auto");
          },
          apply(tr, value: DecorationSet): DecorationSet {
            const meta = tr.getMeta(headingNumberPluginKey) as HeadingNumberMode | undefined;
            if (meta !== undefined) {
              return buildNumberDecorations(tr.doc, meta);
            }
            if (tr.docChanged) {
              // ドキュメント変更時は auto で再判定
              return buildNumberDecorations(tr.doc, "auto");
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return headingNumberPluginKey.getState(state) as DecorationSet ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
