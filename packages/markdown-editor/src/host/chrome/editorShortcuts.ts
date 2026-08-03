import type { Editor } from "@anytime-markdown/markdown-core";

import type { TranslationFn } from "../../types";
import type { ToolbarFileHandlers, ToolbarModeHandlers, ToolbarModeState } from "../../types/toolbar";

/**
 * キーボードショートカット（旧 React `useEditorShortcuts` の vanilla 版）。
 *
 * 装着先が 2 つに分かれているのは意図的:
 * - 編集操作（保存 / リンク / outline）は `editor.view.dom` へ。エディタにフォーカスが
 *   あるときだけ効かせる
 * - ファイル・モード系は `document` へ。source モードでは `editor.view.dom` が
 *   非表示になり、そちらでは拾えないため
 */

export interface EditorDomShortcutOptions {
  readonly editor: Editor;
  readonly fileHandlers: ToolbarFileHandlers;
  readonly openLinkDialog: () => void;
  readonly toggleOutline: () => void;
}

/** mod+S=保存 / mod+K=リンク / mod+Alt+O=outline。 */
export function installEditorDomShortcuts(options: EditorDomShortcutOptions): () => void {
  const { editor, fileHandlers, openLinkDialog, toggleOutline } = options;

  const onKeyDown = (e: KeyboardEvent): void => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      (fileHandlers.onSaveFile ?? fileHandlers.onDownload)();
    } else if (e.key === "k" || e.key === "K") {
      e.preventDefault();
      openLinkDialog();
    } else if (e.altKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      toggleOutline();
    }
  };

  editor.view.dom.addEventListener("keydown", onKeyDown);
  return () => editor.view.dom.removeEventListener("keydown", onKeyDown);
}

export interface GlobalShortcutOptions {
  readonly t: TranslationFn;
  readonly fileHandlers: ToolbarFileHandlers;
  readonly modeHandlers: ToolbarModeHandlers;
  /** モードは切替で変わるため、静的キャプチャせず getter で都度評価する。 */
  readonly modeState: ToolbarModeState;
  /** ホストが課している readOnly（ユーザー選択の readonlyMode とは別）。 */
  readonly isHostReadOnly: () => boolean;
  /** ホスト強制・ユーザー選択のいずれかで読み取り専用か。 */
  readonly isReadonlyNow: () => boolean;
  readonly getFullMarkdown: () => string;
  /** コピー完了を読み上げる aria-live 領域。 */
  readonly liveRegion: HTMLElement;
}

/**
 * mod+Shift+S=名前を付けて保存 / mod+Shift+C=全文コピー / mod+O=開く /
 * mod+Alt+S=4 モード循環 / mod+Alt+M=merge 切替 / mod+Alt+N=クリア。
 */
export function installGlobalShortcuts(options: GlobalShortcutOptions): () => void {
  const {
    t, fileHandlers, modeHandlers, modeState,
    isHostReadOnly, isReadonlyNow, getFullMarkdown, liveRegion,
  } = options;

  const copyAllMarkdown = (): void => {
    const md = getFullMarkdown();
    void navigator.clipboard?.writeText(md).then(() => {
      liveRegion.textContent = t("copiedToClipboard");
    });
  };

  /**
   * 4 モード循環: Readonly → Review → Edit → Source → Readonly
   * （旧実装と同一。Review/Readonly 切替が未配線なら Wysiwyg へフォールバック）。
   * ホストが readOnly を課している間はツールバー同様モード切替そのものを封じる。
   */
  const cycleMode = (): void => {
    if (isHostReadOnly()) return; // no-op（ロック中）
    if (modeState.readonlyMode) {
      (modeHandlers.onSwitchToReview ?? modeHandlers.onSwitchToWysiwyg)();
    } else if (modeState.reviewMode) {
      modeHandlers.onSwitchToWysiwyg();
    } else if (modeState.sourceMode) {
      (modeHandlers.onSwitchToReadonly ?? modeHandlers.onSwitchToWysiwyg)();
    } else {
      modeHandlers.onSwitchToSource();
    }
  };

  const handleModShift = (e: KeyboardEvent, key: string): void => {
    if (key === "s") {
      e.preventDefault();
      fileHandlers.onSaveAsFile?.();
    } else if (key === "c") {
      e.preventDefault();
      copyAllMarkdown();
    }
  };

  const handleModAlt = (e: KeyboardEvent, key: string): void => {
    if (key === "s") {
      e.preventDefault();
      cycleMode();
      return;
    }
    // readonly（ホスト強制・ユーザー選択いずれも）/ review では編集系（merge / clear）を無効化。
    if (isReadonlyNow() || modeState.reviewMode) return;
    if (key === "m") {
      e.preventDefault();
      modeHandlers.onMerge();
    } else if (key === "n") {
      e.preventDefault();
      void fileHandlers.onNewFile?.();
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (e.shiftKey && !e.altKey) {
      handleModShift(e, key);
      return;
    }
    if (e.altKey && !e.shiftKey) {
      handleModAlt(e, key);
      return;
    }
    // mod 単独系（Alt / Shift なし）。mod+S / mod+K は editor.view.dom 側で処理する。
    if (!e.altKey && key === "o") {
      e.preventDefault();
      fileHandlers.onOpenFile?.();
    }
  };

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}
