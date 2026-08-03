import { createEditorSideToolbar } from "../../components-vanilla/EditorSideToolbar";
import type { TranslationFn } from "../../types";
import type { ToolbarModeHandlers, ToolbarModeState } from "../../types/toolbar";

/**
 * SideToolbar（右端縦・outline / comment / explorer / ノート網 / 設定 / バージョン）の設置。
 *
 * 中身は「ホストが hide 指定していれば undefined、していなければハンドラを渡す」という
 * 出し分けが 5 つ並ぶだけだが、`if` の内側に三項が積み重なるため installChrome の認知的
 * 複雑度を押し上げていた（実測: 本セクションを外すと 42 → 21）。
 *
 * 開閉状態そのものは modeState が持ち、本モジュールは初期値の受け渡しだけを行う
 * （以後の同期は呼び出し側の refreshToolbarMode が handle.update で行う）。
 */

/** ホストが個別に隠せる SideToolbar のボタン。 */
export interface SideToolbarHideFlags {
  readonly explorer?: boolean;
  readonly settings?: boolean;
  readonly versionInfo?: boolean;
}

export interface SideToolbarOptions {
  readonly t: TranslationFn;
  readonly slot: HTMLElement;
  readonly modeState: ToolbarModeState;
  readonly modeHandlers: ToolbarModeHandlers;
  readonly hide: SideToolbarHideFlags | undefined;
  /** ノート網パネルが提供されているか（未提供ならアイコンを出さない）。 */
  readonly hasNoteGraph: boolean;
  readonly onToggleComment: (open: boolean) => void;
  readonly onOpenSettings: () => void;
  readonly onOpenVersionDialog: () => void;
}

export type SideToolbarHandle = ReturnType<typeof createEditorSideToolbar>;

/** SideToolbar を slot へ設置し、handle と破棄関数を返す。 */
export function installSideToolbar(options: SideToolbarOptions): {
  handle: SideToolbarHandle;
  dispose: () => void;
} {
  const { t, slot, modeState, modeHandlers, hide, hasNoteGraph } = options;

  const handle = createEditorSideToolbar({
    t,
    sourceMode: modeState.sourceMode,
    outlineOpen: modeState.outlineOpen,
    commentOpen: modeState.commentOpen,
    explorerOpen: modeState.explorerOpen,
    noteGraphOpen: modeState.noteGraphOpen,
    onToggleOutline: modeHandlers.onToggleOutline,
    onToggleComment: options.onToggleComment,
    // 上部ツールバーの explorer ボタンは sideToolbar 併用時に side-coupled で ≥900px から
    // 隠れる（EditorToolbar.ts）。受け皿のこちらへ配線しないと広い画面でトグルが消える。
    onToggleExplorer: hide?.explorer ? undefined : modeHandlers.onToggleExplorer,
    // ノート網パネルが提供されている場合のみアイコンを出す
    onToggleNoteGraph: hasNoteGraph ? modeHandlers.onToggleNoteGraph : undefined,
    onOpenSettings: hide?.settings ? undefined : options.onOpenSettings,
    // ハンバーガー（その他メニュー）の versionInfo と同じダイアログを最上部に鏡写しする。
    onOpenVersionDialog: hide?.versionInfo ? undefined : options.onOpenVersionDialog,
  });
  slot.appendChild(handle.el);

  return { handle, dispose: () => handle.destroy() };
}
