import type { AnyExtension, Extensions } from "@anytime-markdown/markdown-core";
import Placeholder from "@anytime-markdown/markdown-extension-placeholder";

import { getBaseExtensions } from "./editorExtensions";
import { ChangeGutterExtension } from "./extensions/changeGutterExtension";
import { CustomHardBreak } from "./extensions/customHardBreak";
import { DeleteLineExtension } from "./extensions/deleteLineExtension";
import { ReviewModeExtension } from "./extensions/reviewModeExtension";
import type { SlashCommandState } from "./extensions/slashCommandExtension";
import { SlashCommandExtension } from "./extensions/slashCommandExtension";
import { SearchReplaceExtension } from "./searchReplaceExtension";

interface BuildEditorExtensionsOptions {
  /** main = 本体（編集可能）, compare = 比較ビュー左パネル（read-only） */
  mode: "main" | "compare";
  /** codeBlock 拡張の注入 (rich の CodeBlockWithMermaid)。未指定時は素の CodeBlockLowlight。左右で共有する描画系オプション */
  codeBlockExtension?: AnyExtension;
  /** スプレッドシートのグリッド行数。描画系オプション */
  gridRows?: number;
  /** スプレッドシートのグリッド列数。描画系オプション */
  gridCols?: number;
  /** main 専用: プレースホルダ文字列 */
  placeholder?: string;
  /** main 専用: スラッシュコマンド状態変化コールバック */
  onSlashStateChange?: (state: SlashCommandState) => void;
}

/**
 * 本体エディタ（main）と比較ビュー左パネル（compare）の拡張構成を単一の定義から導出する。
 *
 * 描画系オプション（codeBlockExtension / gridRows / gridCols）を1つのシグネチャに集約することで、
 * 片側の呼び出しだけにオプションが渡らず描画が退化するドリフトを構造的に防ぐ。
 * （以前は InlineMergeView が codeBlockExtension を渡さず、左パネルで mermaid/plantuml/math/html/embed が
 * ソース表示に退化していた。）
 */
export function buildEditorExtensions(options: BuildEditorExtensionsOptions): Extensions {
  const { mode, codeBlockExtension, gridRows, gridCols, placeholder, onSlashStateChange } = options;

  const base = getBaseExtensions({
    gridRows,
    gridCols,
    codeBlockExtension,
    disableComments: mode === "compare",
    disableCheckboxToggle: mode === "compare",
  });

  // compare（左パネル）は read-only。編集系拡張を持たせない。
  if (mode === "compare") {
    return [...base, CustomHardBreak, ReviewModeExtension];
  }

  // main（本体）。拡張の並び順は従来の useEditorConfig と同一に保つ。
  return [
    ...base,
    CustomHardBreak,
    DeleteLineExtension,
    SearchReplaceExtension,
    Placeholder.configure({ placeholder: placeholder ?? "" }),
    SlashCommandExtension.configure({
      onStateChange: (state: SlashCommandState) => onSlashStateChange?.(state),
    }),
    ReviewModeExtension,
    ChangeGutterExtension,
  ];
}
