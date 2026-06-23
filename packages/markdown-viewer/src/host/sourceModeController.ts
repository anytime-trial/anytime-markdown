/**
 * editor mode（wysiwyg / source / review / readonly）の vanilla コントローラ。
 *
 * React `useSourceMode` の置換。source モードでは editor DOM を隠して textarea を
 * 並置し、WYSIWYG 復帰時に `applyMarkdownToEditor` で同期する。review / readonly は
 * `reviewModeStorage` の有効化 + `dataset` フラグで React 版と同一の経路を使う。
 *
 * mode の localStorage 永続化（STORAGE_KEY_EDITOR_MODE）は React 版と同じキーを使う。
 * 旧 3 キーからのマイグレーションは React 版が実施済みのため本実装では行わない。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { STORAGE_KEY_EDITOR_MODE } from "../constants/storageKeys";
import { reviewModeStorage } from "../extensions/reviewModeExtension";
import type { TranslationFn } from "../types";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { prependFrontmatter } from "../utils/frontmatterHelpers";
import { getMarkdownFromEditorSafe } from "../utils/markdownSerializer";
import { safeSetItem } from "../utils/storage";

export type VanillaEditorMode = "wysiwyg" | "source" | "review" | "readonly";

/** {@link createSourceModeController} のオプション。 */
interface CreateSourceModeControllerOptions {
  editor: Editor;
  /** editor がマウントされている要素（textarea を並置する）。 */
  contentEl: HTMLElement;
  t: TranslationFn;
  /** フロントマター（エディタ外保持）。source テキストへの prepend / 同期で使う。 */
  getFrontmatter: () => string | null;
  setFrontmatter: (fm: string | null) => void;
  /** source テキスト変更時の保存（frontmatter 込みテキストが渡る）。 */
  onSourceSave?: (markdown: string) => void;
  /** mode 適用後の通知（toolbar 再描画 / onModeChange 中継）。 */
  onModeApplied: (mode: VanillaEditorMode) => void;
  /** aria-live 通知。 */
  announce?: (message: string) => void;
  /** 初期モードを source に固定（localStorage より優先）。 */
  defaultSourceMode?: boolean;
  /** mode を localStorage に永続化するか（既定 true・React 版と同一キー）。 */
  persistMode?: boolean;
  /**
   * 比較モード等、表示を外部（InlineMergeView）が一元管理する間 true を返す。
   * true の間は source モードの standalone DOM（textarea / 行番号ガター / editor.view.dom の
   * display 操作 / contentEl への append）を抑止し、mode/text のストアに徹する。
   * 比較 enter/exit の受け渡しは {@link SourceModeController.detachStandaloneUi} /
   * {@link SourceModeController.attachStandaloneUi} で明示的に行う。
   */
  isExternallyManaged?: () => boolean;
}

/** {@link createSourceModeController} の戻り値。 */
export interface SourceModeController {
  getMode(): VanillaEditorMode;
  getSourceText(): string;
  /** VS Code Undo/Redo（vscode-set-content）等から source テキストを差し替える。 */
  setSourceText(text: string): void;
  switchTo(mode: VanillaEditorMode): void;
  /** source モード中のみ非 null。 */
  getTextarea(): HTMLTextAreaElement | null;
  /** コメント操作用: 一時的にレビューフィルタを解除してコマンドを実行する。 */
  executeInReviewMode(fn: () => void): void;
  /** 比較 enter 用: standalone source UI を撤去する（mode/text は保持）。 */
  detachStandaloneUi(): void;
  /** 比較 exit 用: source モードなら standalone source UI を再生成する。 */
  attachStandaloneUi(): void;
  destroy(): void;
}

function readStoredMode(): VanillaEditorMode | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_EDITOR_MODE);
    if (stored === "source" || stored === "review" || stored === "readonly") return stored;
    return null;
  } catch (error) {
    console.warn("[sourceModeController] localStorage read failed", error);
    return null;
  }
}

// 行番号ガターと textarea で共有するフォント/行高（1 行の高さを一致させる）。
const SOURCE_FONT_CSS =
  "font-family:var(--am-source-font-family, ui-monospace, monospace);" +
  "font-size:var(--am-editor-font-size, 16px);line-height:var(--am-editor-line-height, 1.6);";

const TEXTAREA_CSS =
  "flex:1 1 auto;height:100%;box-sizing:border-box;border:none;outline:none;resize:none;" +
  SOURCE_FONT_CSS +
  // textarea は .tiptap の兄弟（contentEl 直下）のため .tiptap の color を継承できない。
  // host が root へ適用する --am-editor-text を直接参照してテーマ文字色に追従する
  // （color:inherit だとテーマ非対応ページ＝拡張等でダーク時にページ既定の黒へ落ちる）。
  "background:transparent;color:var(--am-editor-text, inherit);padding:16px;" +
  // 行番号と 1:1 で対応させるため折り返さず横スクロールにする（コードエディタ流）。
  "white-space:pre;overflow:auto;";

// textarea + 左端行番号ガターを横並びにする wrapper（textarea が唯一のスクローラ）。
const SOURCE_WRAP_CSS = "display:flex;width:100%;height:100%;overflow:hidden;";

// 左端の行番号ガター。textarea と同じ行高・上 padding で行位置を揃え、縦スクロールは
// textarea の scroll に追従させる（自身は overflow:hidden で独自スクロールバーを出さない）。
const GUTTER_CSS =
  "flex:0 0 auto;overflow:hidden;text-align:right;white-space:pre;user-select:none;" +
  SOURCE_FONT_CSS +
  "padding:16px 8px 16px 12px;color:var(--am-color-text-secondary);" +
  "border-right:1px solid var(--am-color-divider);";

/** editor mode の vanilla コントローラを生成する。 */
export function createSourceModeController(
  options: CreateSourceModeControllerOptions,
): SourceModeController {
  const { editor, contentEl, t, persistMode = true } = options;
  let mode: VanillaEditorMode = "wysiwyg";
  let sourceText = "";
  let textarea: HTMLTextAreaElement | null = null;
  let sourceWrap: HTMLElement | null = null;
  let gutter: HTMLElement | null = null;
  let lastLineCount = 0;
  // source モード中に退避する contentEl の overflow（textarea を唯一のスクローラにするため）。
  let prevContentOverflow: string | null = null;

  /** textarea の論理行数（空でも 1 行・末尾改行は +1 行＝textarea の表示挙動に合わせる）。 */
  const lineCount = (text: string): number => (text.length === 0 ? 1 : text.split("\n").length);

  /** 行番号ガターを現在の行数に再描画する（行数が変わらない入力では何もしない）。 */
  const renderGutter = (): void => {
    if (!gutter) return;
    const n = lineCount(textarea?.value ?? sourceText);
    if (n === lastLineCount) return;
    lastLineCount = n;
    const nums = new Array(n);
    for (let i = 0; i < n; i++) nums[i] = String(i + 1);
    gutter.textContent = nums.join("\n");
  };

  const persist = (next: VanillaEditorMode): void => {
    if (!persistMode || typeof localStorage === "undefined") return;
    if (next === "wysiwyg") {
      try {
        localStorage.removeItem(STORAGE_KEY_EDITOR_MODE);
      } catch (error) {
        console.warn("[sourceModeController] localStorage remove failed", error);
      }
    } else {
      safeSetItem(STORAGE_KEY_EDITOR_MODE, next);
    }
  };

  /** reviewMode 拡張の storage（未登録構成では null + 警告）。 */
  const reviewStorage = (): { enabled: boolean } | null => {
    const storage = reviewModeStorage(editor) as { enabled: boolean } | undefined;
    if (!storage) {
      console.warn("[sourceModeController] reviewMode storage unavailable (extension not loaded)");
      return null;
    }
    return storage;
  };

  const clearReviewFlags = (): void => {
    const storage = reviewStorage();
    if (storage) storage.enabled = false;
    delete editor.view.dom.dataset.reviewMode;
    delete editor.view.dom.dataset.readonlyMode;
  };

  const doShowTextarea = (): void => {
    if (textarea) return;
    sourceWrap = document.createElement("div");
    sourceWrap.setAttribute("data-am-source-wrap", "");
    sourceWrap.style.cssText = SOURCE_WRAP_CSS;

    // 左端の行番号ガター（VS Code markdown 拡張のソース表示に倣う）。
    gutter = document.createElement("div");
    gutter.setAttribute("data-am-source-gutter", "");
    gutter.setAttribute("aria-hidden", "true");
    gutter.style.cssText = GUTTER_CSS;

    textarea = document.createElement("textarea");
    textarea.setAttribute("data-am-source-textarea", "");
    textarea.setAttribute("aria-label", t("sourceMode"));
    textarea.spellcheck = false;
    textarea.style.cssText = TEXTAREA_CSS;
    textarea.value = sourceText;
    textarea.addEventListener("input", () => {
      sourceText = textarea?.value ?? "";
      renderGutter();
      options.onSourceSave?.(sourceText);
    });
    // textarea の縦スクロールにガターを追従させる（ガターは自前スクロールバーを出さない）。
    textarea.addEventListener("scroll", () => {
      if (gutter && textarea) gutter.scrollTop = textarea.scrollTop;
    });

    sourceWrap.append(gutter, textarea);
    editor.view.dom.style.display = "none";
    // textarea（height:100%）が自前のスクロールを持つため、contentEl 側もスクロールすると
    // スクロールバーが二重に出る。source 中は contentEl の overflow を hidden にして
    // textarea を唯一のスクローラにする（退出時に元の overflow を復元する）。
    prevContentOverflow = contentEl.style.overflow;
    contentEl.style.overflow = "hidden";
    contentEl.appendChild(sourceWrap);
    lastLineCount = 0;
    renderGutter();
  };

  const doHideTextarea = (): void => {
    sourceWrap?.remove();
    sourceWrap = null;
    gutter = null;
    textarea = null;
    lastLineCount = 0;
    editor.view.dom.style.display = "";
    if (prevContentOverflow !== null) {
      contentEl.style.overflow = prevContentOverflow;
      prevContentOverflow = null;
    }
  };

  // 比較モード等で表示を外部が一元管理する間は standalone DOM を触らない
  // （applyMode 内の sourceText 更新・syncSourceToEditor 等の内容同期は実行される）。
  const showTextarea = (): void => {
    if (options.isExternallyManaged?.()) return;
    doShowTextarea();
  };
  const hideTextarea = (): void => {
    if (options.isExternallyManaged?.()) return;
    doHideTextarea();
  };

  /** source テキストをエディタへ反映して source モードを抜ける際の同期。 */
  const syncSourceToEditor = (): void => {
    const { frontmatter } = applyMarkdownToEditor(editor, sourceText);
    options.setFrontmatter(frontmatter);
    options.onSourceSave?.(sourceText);
  };

  const applyMode = (next: VanillaEditorMode): void => {
    if (next === mode) return;
    // 現モードの後始末
    if (mode === "source") {
      if (next !== "source") {
        syncSourceToEditor();
        hideTextarea();
      }
    } else if (mode === "review" || mode === "readonly") {
      clearReviewFlags();
    }
    // 新モードの適用
    if (next === "source") {
      if (typeof editor.commands.closeSearch === "function") {
        editor.commands.closeSearch();
      }
      sourceText = prependFrontmatter(
        getMarkdownFromEditorSafe(editor) ?? "",
        options.getFrontmatter(),
      );
      showTextarea();
      options.announce?.(t("switchedToSource"));
    } else if (next === "review") {
      const storage = reviewStorage();
      if (storage) storage.enabled = true;
      editor.view.dom.dataset.reviewMode = "true";
      options.announce?.(t("switchedToReview"));
    } else if (next === "readonly") {
      const storage = reviewStorage();
      if (storage) storage.enabled = true;
      editor.view.dom.dataset.readonlyMode = "true";
      options.announce?.(t("switchedToReadonly"));
    } else {
      options.announce?.(t("switchedToWysiwyg"));
    }
    mode = next;
    persist(next);
    options.onModeApplied(next);
  };

  // 初期モード復元（defaultSourceMode 優先 → localStorage）
  const initial = options.defaultSourceMode ? "source" : readStoredMode();
  if (initial && initial !== "wysiwyg") {
    // mode はまだ "wysiwyg" なので applyMode で通常遷移できる
    applyMode(initial);
  }

  return {
    getMode: () => mode,
    getSourceText: () => sourceText,
    setSourceText(text: string): void {
      sourceText = text;
      if (textarea) {
        textarea.value = text;
        renderGutter();
      }
    },
    switchTo: applyMode,
    getTextarea: () => textarea,
    detachStandaloneUi(): void {
      // 比較 enter: standalone source UI を撤去（mode/text は保持）。外部管理ガードに
      // 関わらず DOM を片付けるため do* を直接呼ぶ。
      doHideTextarea();
    },
    attachStandaloneUi(): void {
      // 比較 exit: source モードのときだけ standalone textarea を再生成する。
      if (mode === "source") doShowTextarea();
    },
    executeInReviewMode(fn: () => void): void {
      const storage = reviewStorage();
      if (storage) storage.enabled = false;
      try {
        fn();
      } finally {
        queueMicrotask(() => {
          const after = reviewStorage();
          if (after) after.enabled = true;
        });
      }
    },
    destroy(): void {
      hideTextarea();
    },
  };
}
