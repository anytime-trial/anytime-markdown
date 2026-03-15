import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const headingNumberPluginKey = new PluginKey("headingNumber");

function buildNumberDecorations(
  doc: import("@tiptap/pm/model").Node,
  mode: "on" | "off",
): DecorationSet {
  if (mode === "off") return DecorationSet.empty;

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

type HeadingNumberMode = "on" | "off";

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
          init(): DecorationSet {
            return DecorationSet.empty;
          },
          apply(tr, value: DecorationSet): DecorationSet {
            const meta = tr.getMeta(headingNumberPluginKey) as HeadingNumberMode | undefined;
            if (meta !== undefined) {
              return buildNumberDecorations(tr.doc, meta);
            }
            if (tr.docChanged && value !== DecorationSet.empty) {
              // "on" 状態でドキュメント変更時は番号を再計算
              return buildNumberDecorations(tr.doc, "on");
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
