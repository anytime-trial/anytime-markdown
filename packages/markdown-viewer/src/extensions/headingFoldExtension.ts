import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const headingFoldPluginKey = new PluginKey("headingFold");

interface HeadingFoldState {
  foldedIndices: Set<number>;
  decorations: DecorationSet;
}

function buildDecorations(
  doc: import("@tiptap/pm/model").Node,
  foldedIndices: Set<number>,
): DecorationSet {
  if (foldedIndices.size === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  let headingIdx = 0;

  // 全トップレベルノードを走査し、折りたたみ対象を特定
  doc.forEach((node, pos) => {
    if (node.type.name === "heading") {
      if (foldedIndices.has(headingIdx)) {
        // 折りたたまれた見出しに heading-folded クラスを付与
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, { class: "heading-folded" }),
        );

        // この見出しのレベル以下の後続ノードを非表示にする
        const foldedLevel = node.attrs.level as number;
        let nextPos = pos + node.nodeSize;

        while (nextPos < doc.content.size) {
          const nextNode = doc.nodeAt(nextPos);
          if (!nextNode) break;
          // 同レベル以上の見出しに到達したら停止
          if (
            nextNode.type.name === "heading" &&
            (nextNode.attrs.level as number) <= foldedLevel
          ) {
            break;
          }
          decorations.push(
            Decoration.node(nextPos, nextPos + nextNode.nodeSize, {
              style: "display: none",
            }),
          );
          nextPos += nextNode.nodeSize;
        }
      }
      headingIdx++;
    }
  });

  return DecorationSet.create(doc, decorations);
}

const EMPTY_STATE: HeadingFoldState = {
  foldedIndices: new Set(),
  decorations: DecorationSet.empty,
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingFold: {
      setFoldedHeadings: (indices: Set<number>) => ReturnType;
    };
  }
}

export const HeadingFoldExtension = Extension.create({
  name: "headingFold",

  addCommands() {
    return {
      setFoldedHeadings:
        (indices: Set<number>) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(headingFoldPluginKey, indices);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingFoldPluginKey,
        state: {
          init(): HeadingFoldState {
            return EMPTY_STATE;
          },
          apply(tr, value: HeadingFoldState): HeadingFoldState {
            const meta = tr.getMeta(headingFoldPluginKey) as Set<number> | undefined;
            if (meta !== undefined) {
              return {
                foldedIndices: meta,
                decorations: buildDecorations(tr.doc, meta),
              };
            }
            // ドキュメント変更時はインデックスを保持してデコレーション再構築
            if (tr.docChanged && value.foldedIndices.size > 0) {
              return {
                foldedIndices: value.foldedIndices,
                decorations: buildDecorations(tr.doc, value.foldedIndices),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = headingFoldPluginKey.getState(state) as
              | HeadingFoldState
              | undefined;
            return pluginState?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
