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
export interface CreateSourceModeControllerOptions {
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

const TEXTAREA_CSS =
  "width:100%;height:100%;box-sizing:border-box;border:none;outline:none;resize:none;" +
  "font-family:var(--am-source-font-family, ui-monospace, monospace);" +
  "font-size:var(--am-editor-font-size, 16px);line-height:var(--am-editor-line-height, 1.6);" +
  "background:transparent;color:inherit;padding:16px;";

/** editor mode の vanilla コントローラを生成する。 */
export function createSourceModeController(
  options: CreateSourceModeControllerOptions,
): SourceModeController {
  const { editor, contentEl, t, persistMode = true } = options;
  let mode: VanillaEditorMode = "wysiwyg";
  let sourceText = "";
  let textarea: HTMLTextAreaElement | null = null;

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

  const showTextarea = (): void => {
    if (textarea) return;
    textarea = document.createElement("textarea");
    textarea.setAttribute("data-am-source-textarea", "");
    textarea.setAttribute("aria-label", t("sourceMode"));
    textarea.spellcheck = false;
    textarea.style.cssText = TEXTAREA_CSS;
    textarea.value = sourceText;
    textarea.addEventListener("input", () => {
      sourceText = textarea?.value ?? "";
      options.onSourceSave?.(sourceText);
    });
    editor.view.dom.style.display = "none";
    contentEl.appendChild(textarea);
  };

  const hideTextarea = (): void => {
    textarea?.remove();
    textarea = null;
    editor.view.dom.style.display = "";
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
      if (textarea) textarea.value = text;
    },
    switchTo: applyMode,
    getTextarea: () => textarea,
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
