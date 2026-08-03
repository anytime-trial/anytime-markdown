import type { AnyExtension, Editor } from "@anytime-markdown/markdown-core";

import {
  createInlineMergeView,
  type InlineMergeViewHandle,
  type MergeUndoRedo,
} from "../../components-vanilla/InlineMergeView";
import type { MarkdownMinimapHandle } from "../../components-vanilla/MarkdownMinimap";
import type { TranslationFn } from "../../types";
import { getMarkdownFromEditorSafe } from "../../utils/markdownSerializer";
import type { SourceModeController } from "../sourceModeController";

/**
 * 比較（merge）モード。開閉状態の遷移と InlineMergeView の実体管理をまとめて持つ。
 *
 * installChrome 側では「開閉フラグ」「diff の基準となる markdown」「ビュー実体」「遅延クリア
 * タイマー」が 3 セクションに散っており、`syncMergeView` は前方宣言（`let ... = () => {}`）で
 * 後から代入されていた。本モジュールは 4 つの状態を 1 か所へ集め、ビュー生成に必要な依存
 * （toolbar / sourceController など installChrome の後半で確定するもの）を getter で受けることで
 * 前方宣言を不要にしている。
 *
 * 表示の一元管理という前提は変えていない: 比較中は frontmatter バーも source モードの
 * standalone UI もホスト側では出さず、InlineMergeView が両方を内側で担う。
 */

/** 本モジュールが読み書きする modeState のフィールドだけを写した構造型。 */
export interface CompareModeFlags {
  inlineMergeOpen: boolean;
  sourceMode: boolean;
}

export interface CompareModeOptions {
  readonly editor: Editor;
  readonly t: TranslationFn;
  /** merge ビューを差し込む本文コンテナ。 */
  readonly contentEl: HTMLElement;
  /** `editor.options.element`。比較 exit 時に contentEl へ戻す。 */
  readonly editorMountEl: HTMLElement;
  readonly minimap: MarkdownMinimapHandle;
  /** 開閉・モードの正本（installChrome と共有する可変オブジェクト）。 */
  readonly modeState: CompareModeFlags;
  /** ビュー生成時点の実効設定（live update で変わるため getter）。 */
  readonly getSettings: () => { fontSize: number; lineHeight: number };
  readonly getFrontmatter: () => string | null;
  readonly getCodeBlockExtension: () => AnyExtension | undefined;
  /** source モード UI の一元管理。比較 enter/exit で standalone UI を出し入れする。 */
  readonly getSourceController: () => SourceModeController | null;
  /** merge の undo/redo ハンドルの通知先（toolbar）。 */
  readonly setMergeUndoRedo: (handle: MergeUndoRedo | null) => void;
  /** 右ペインの編集テキストを保存する（frontmatter を付けない）。 */
  readonly saveEditedText: (text: string) => void;
  /** 比較中はホストの frontmatter バーを隠すためのフラグ更新。 */
  readonly setCompareModeActive: (active: boolean) => void;
  readonly syncFrontmatterView: () => void;
  readonly refreshToolbarMode: () => void;
  readonly notifyCompareMode: (open: boolean) => void;
}

export interface CompareModeController {
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  /** toolbar の比較ボタン。開く直前に WYSIWYG なら diff 基準を取り直す。 */
  toggle: () => void;
  /** 外部（VS Code のファイル読込 / live update）から比較コンテンツを与える。 */
  applyExternalContent: (content: string) => void;
  /** 現在の開閉状態へ merge ビューを合わせる。 */
  sync: () => void;
  /** WYSIWYG のとき、diff 基準の markdown を editor から取り直す。 */
  refreshBaselineIfWysiwyg: () => void;
  /** モード適用（source ⇄ wysiwyg）後の再同期。比較中でなければ何もしない。 */
  syncAfterModeChange: () => void;
  /** タイマーと window listener を解放する。 */
  dispose: () => void;
  /** merge ビュー実体を破棄する（dispose とは登録順が違うため分けている）。 */
  destroyView: () => void;
}

/** 比較を閉じたあと diff ハイライトを消すまでの遅延（閉じるアニメーション中の再描画を避ける）。 */
const CLEAR_DIFF_DELAY_MS = 100;

export function createCompareMode(options: CompareModeOptions): CompareModeController {
  const {
    editor,
    t,
    contentEl,
    editorMountEl,
    minimap,
    modeState,
    getSettings,
    getFrontmatter,
    getCodeBlockExtension,
    getSourceController,
    setMergeUndoRedo,
    saveEditedText,
    setCompareModeActive,
    syncFrontmatterView,
    refreshToolbarMode,
    notifyCompareMode,
  } = options;

  let compareFileContent: string | null = null;
  let editorMarkdown = "";
  let clearDiffTimer: ReturnType<typeof setTimeout> | null = null;
  let mergeView: InlineMergeViewHandle | null = null;

  const isOpen = (): boolean => modeState.inlineMergeOpen === true;

  const mergeEditorContent = (): string =>
    modeState.sourceMode ? (getSourceController()?.getSourceText() ?? "") : editorMarkdown;

  // 比較中の editor.view.dom 表示制御: sourceMode は比較ビューが textarea で表示を担い、
  // editor（editorMountEl）は contentEl 上の孤児になるため隠す。WYSIWYG は右ペインへ移設した
  // editor を表示する（detachStandaloneUi の display 復帰や renderWysiwyg の非リセットを上書き）。
  const applyCompareEditorVisibility = (): void => {
    editor.view.dom.style.display = modeState.sourceMode ? "none" : "";
  };

  const openView = (): void => {
    // WYSIWYG では右パネルが editorMountEl（editor.options.element）ごと自分の中へ移設する。
    // 比較 enter: standalone source UI を撤去し editor.view.dom の display を戻す
    // （比較ビューが source/wysiwyg 表示を一元管理する。display:none 残留で右ペインが
    // 不可視になる回帰を防ぐ）。
    getSourceController()?.detachStandaloneUi();
    const settings = getSettings();
    mergeView = createInlineMergeView({
      editor,
      t,
      settings: { fontSize: settings.fontSize, lineHeight: settings.lineHeight },
      sourceMode: modeState.sourceMode === true,
      editorContent: mergeEditorContent(),
      frontmatter: getFrontmatter(),
      codeBlockExtension: getCodeBlockExtension(),
      compareContent: compareFileContent,
      onCompareContentConsumed: () => {
        compareFileContent = null;
      },
      onEditTextChange: (text) => {
        if (modeState.sourceMode) getSourceController()?.setSourceText(text);
        saveEditedText(text);
      },
      onUndoRedoChange: (handle) => setMergeUndoRedo(handle),
      // 差分ハイライト/アライン確定時にミニマップの差分マーカーを再計算する。
      onDiffChange: () => minimap.refresh(),
    });
    contentEl.appendChild(mergeView.el);
    applyCompareEditorVisibility();
    // ミニマップを差分モードへ切替（右ペインを基準に [data-diff-block] をマーカー表示）。
    const activeMerge = mergeView;
    minimap.setDiffSource({
      scrollContainer: activeMerge.getRightScroller(),
      getRatios: () => activeMerge.getDiffBlockRatios(),
    });
  };

  const closeView = (view: InlineMergeViewHandle): void => {
    view.destroy();
    view.el.remove();
    mergeView = null;
    setMergeUndoRedo(null);
    // ミニマップを既定（本文の変更追跡）へ戻す。
    minimap.setDiffSource(null);
    // editorMountEl は merge 右パネル内に移設されている場合があるため contentEl へ戻す。
    if (editorMountEl.parentElement !== contentEl) {
      contentEl.appendChild(editorMountEl);
    }
    // 比較 exit: source モードなら standalone source UI を再生成して戻す。
    getSourceController()?.attachStandaloneUi();
  };

  const sync = (): void => {
    if (isOpen() && !mergeView) {
      openView();
    } else if (isOpen() && mergeView) {
      mergeView.update({
        sourceMode: modeState.sourceMode === true,
        editorContent: mergeEditorContent(),
        frontmatter: getFrontmatter(),
        compareContent: compareFileContent,
      });
      applyCompareEditorVisibility();
    } else if (!isOpen() && mergeView) {
      closeView(mergeView);
    }
  };

  const setOpen = (open: boolean): void => {
    if (modeState.inlineMergeOpen === open) return;
    modeState.inlineMergeOpen = open;
    // 比較中はホストの単一 frontmatter バーを隠す（InlineMergeView 内蔵の比較行に委ねる）。
    setCompareModeActive(open);
    syncFrontmatterView();
    if (!open) {
      if (clearDiffTimer) clearTimeout(clearDiffTimer);
      clearDiffTimer = setTimeout(() => {
        if (!editor.isDestroyed) editor.commands.clearDiffHighlight();
      }, CLEAR_DIFF_DELAY_MS);
    }
    sync();
    refreshToolbarMode();
    notifyCompareMode(isOpen());
  };

  const refreshBaselineIfWysiwyg = (): void => {
    if (!modeState.sourceMode) editorMarkdown = getMarkdownFromEditorSafe(editor) ?? "";
  };

  const applyExternalContent = (content: string): void => {
    compareFileContent = content;
    if (!isOpen()) {
      refreshBaselineIfWysiwyg();
      setOpen(true);
    } else {
      sync();
    }
  };

  const toggle = (): void => {
    if (!isOpen()) refreshBaselineIfWysiwyg();
    setOpen(!isOpen());
  };

  const syncAfterModeChange = (): void => {
    if (!isOpen()) return;
    // source→wysiwyg では右ペイン diff の基準となる editorMarkdown を最新化する。
    refreshBaselineIfWysiwyg();
    sync();
  };

  // VS Code からの比較ロード/解除（useMergeMode のカスタムイベント相当）。
  const onLoadCompareFile = (e: Event): void => {
    const content = (e as CustomEvent<string>).detail;
    if (typeof content === "string") applyExternalContent(content);
  };
  const onExitCompareMode = (): void => setOpen(false);
  globalThis.addEventListener("vscode-load-compare-file", onLoadCompareFile);
  globalThis.addEventListener("vscode-exit-compare-mode", onExitCompareMode);

  return {
    isOpen,
    setOpen,
    toggle,
    applyExternalContent,
    sync,
    refreshBaselineIfWysiwyg,
    syncAfterModeChange,
    dispose: () => {
      if (clearDiffTimer) clearTimeout(clearDiffTimer);
      globalThis.removeEventListener("vscode-load-compare-file", onLoadCompareFile);
      globalThis.removeEventListener("vscode-exit-compare-mode", onExitCompareMode);
    },
    destroyView: () => {
      mergeView?.destroy();
      mergeView?.el.remove();
      mergeView = null;
    },
  };
}
