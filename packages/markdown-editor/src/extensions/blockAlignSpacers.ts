import { Extension } from "@anytime-markdown/markdown-core";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import { Decoration, DecorationSet } from "@anytime-markdown/markdown-pm/view";

export const blockAlignSpacersKey = new PluginKey("blockAlignSpacers");

/** 縦整合スペーサー: pos の位置に height px の空き widget を挿入する */
export interface AlignSpacer {
  pos: number;
  height: number;
}

interface SpacerState {
  spacers: AlignSpacer[];
}

const EMPTY_STATE: SpacerState = { spacers: [] };

declare module "@anytime-markdown/markdown-core" {
  interface Commands<ReturnType> {
    blockAlignSpacers: {
      setAlignSpacers: (spacers: AlignSpacer[]) => ReturnType;
    };
  }
}

/**
 * WYSIWYG 比較の縦整合用スペーサー。useBlockAlignment が計測して算出した
 * { pos, height } を setAlignSpacers で渡すと、その位置に空き高さ widget を描画する。
 * spacers 未設定時は完全な no-op（通常編集に影響しない）。
 */
export const BlockAlignSpacers = Extension.create({
  name: "blockAlignSpacers",

  addCommands() {
    return {
      setAlignSpacers:
        (spacers: AlignSpacer[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(blockAlignSpacersKey, { spacers } satisfies SpacerState);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockAlignSpacersKey,
        state: {
          init(): SpacerState {
            return EMPTY_STATE;
          },
          apply(tr, value: SpacerState): SpacerState {
            const meta = tr.getMeta(blockAlignSpacersKey) as SpacerState | undefined;
            return meta ?? value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = blockAlignSpacersKey.getState(state) as SpacerState | undefined;
            if (!pluginState || pluginState.spacers.length === 0) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            for (const sp of pluginState.spacers) {
              if (sp.height <= 0 || sp.pos < 0 || sp.pos > state.doc.content.size) continue;
              decorations.push(
                Decoration.widget(
                  sp.pos,
                  () => {
                    const el = document.createElement("div");
                    el.className = "block-align-spacer";
                    el.style.height = `${sp.height}px`;
                    el.style.pointerEvents = "none";
                    el.setAttribute("aria-hidden", "true");
                    return el;
                  },
                  { side: 1, key: `align-${sp.pos}-${sp.height}` },
                ),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
