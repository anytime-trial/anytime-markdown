/**
 * MarkdownEditorPage の page-level React hooks を vanilla orchestrator から使うための
 * plain 関数群（installXxx / createXxx => dispose）。React / markdown-react 非依存。
 *
 * 対応する React 実装:
 * - `installVSCodeEditorEvents` = useVSCodeIntegration + useVSCodeImageEvents
 * - `installVSCodeModeEvents` = useVSCodeModeEvents
 * - `installHeadingsNotifier` = useEditorConfig 内の setHeadings デバウンス通知
 * - `createAutoReloadController` = useAutoReloadBaseline + handleChangeGutterKeydown
 * - `installFrontmatterStorage` = useFrontmatterStorage
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { DEBOUNCE_MEDIUM } from "../constants/timing";
import { extractHeadings, getEditorStorage, type HeadingItem } from "../types";
import { parseFrontmatter, preprocessMarkdown } from "../utils/frontmatterHelpers";
import { getMarkdownFromEditorSafe } from "../utils/markdownSerializer";
import { preserveBlankLines, sanitizeMarkdown } from "../utils/sanitizeMarkdown";

/** pos の DOM 要素へスムーズスクロールし、編集可能なら選択も移動する。 */
function scrollEditorToPos(editor: Editor, pos: number): void {
  if (editor.isDestroyed) return;
  if (editor.isEditable) {
    editor.chain().focus().setTextSelection(pos).run();
  }
  const domAtPos = editor.view.domAtPos(pos);
  const node =
    domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
  node?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * VS Code 拡張（TreeView / ホスト）からのエディタ操作カスタムイベントを購読する。
 *
 * - `vscode-scroll-to-heading` / `vscode-scroll-to-comment`: 位置スクロール
 * - `vscode-resolve-comment` / `vscode-unresolve-comment` / `vscode-delete-comment`: コメント操作
 * - `vscode-image-saved`: クリップボード画像の保存完了 → image ノード挿入
 * - `vscode-image-downloaded`: 外部画像 DL 完了 → 該当 image ノードの src 差替
 */
export function installVSCodeEditorEvents(editor: Editor): () => void {
  const onScrollHeading = (e: Event): void => {
    scrollEditorToPos(editor, (e as CustomEvent<number>).detail);
  };
  const onScrollComment = (e: Event): void => {
    scrollEditorToPos(editor, (e as CustomEvent<number>).detail + 1);
  };
  const onResolve = (e: Event): void => {
    editor.commands.resolveComment((e as CustomEvent<string>).detail);
  };
  const onUnresolve = (e: Event): void => {
    editor.commands.unresolveComment((e as CustomEvent<string>).detail);
  };
  const onDelete = (e: Event): void => {
    editor.commands.removeComment((e as CustomEvent<string>).detail);
  };
  const onImageSaved = (e: Event): void => {
    const detail = (e as CustomEvent<string>).detail;
    if (typeof detail !== "string") return;
    editor.chain().focus().setImage({ src: detail, alt: "" }).run();
  };
  const onImageDownloaded = (e: Event): void => {
    const { originalUrl, localPath } = (
      e as CustomEvent<{ originalUrl: string; localPath: string }>
    ).detail;
    if (!originalUrl || !localPath) return;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && node.attrs.src === originalUrl) {
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          src: localPath,
        });
        editor.view.dispatch(tr);
      }
    });
  };

  globalThis.addEventListener("vscode-scroll-to-heading", onScrollHeading);
  globalThis.addEventListener("vscode-scroll-to-comment", onScrollComment);
  globalThis.addEventListener("vscode-resolve-comment", onResolve);
  globalThis.addEventListener("vscode-unresolve-comment", onUnresolve);
  globalThis.addEventListener("vscode-delete-comment", onDelete);
  globalThis.addEventListener("vscode-image-saved", onImageSaved);
  globalThis.addEventListener("vscode-image-downloaded", onImageDownloaded);
  return () => {
    globalThis.removeEventListener("vscode-scroll-to-heading", onScrollHeading);
    globalThis.removeEventListener("vscode-scroll-to-comment", onScrollComment);
    globalThis.removeEventListener("vscode-resolve-comment", onResolve);
    globalThis.removeEventListener("vscode-unresolve-comment", onUnresolve);
    globalThis.removeEventListener("vscode-delete-comment", onDelete);
    globalThis.removeEventListener("vscode-image-saved", onImageSaved);
    globalThis.removeEventListener("vscode-image-downloaded", onImageDownloaded);
  };
}

/** `vscode-set-mode` カスタムイベント（review / source / wysiwyg）を購読する。 */
export function installVSCodeModeEvents(handlers: {
  review: () => void;
  source: () => void;
  wysiwyg: () => void;
}): () => void {
  const handler = (e: Event): void => {
    const mode = (e as CustomEvent<string>).detail;
    if (mode === "review") handlers.review();
    else if (mode === "source") handlers.source();
    else if (mode === "wysiwyg") handlers.wysiwyg();
  };
  globalThis.addEventListener("vscode-set-mode", handler);
  return () => globalThis.removeEventListener("vscode-set-mode", handler);
}

/**
 * 見出し一覧の変更をデバウンス付きで通知する（初回は即時）。
 */
export function installHeadingsNotifier(
  editor: Editor,
  onHeadingsChange: (headings: HeadingItem[]) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const notify = (): void => onHeadingsChange(extractHeadings(editor));
  const onUpdate = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(notify, DEBOUNCE_MEDIUM);
  };
  notify();
  editor.on("update", onUpdate);
  return () => {
    editor.off("update", onUpdate);
    if (timer) clearTimeout(timer);
  };
}

/** {@link createAutoReloadController} の戻り値。 */
export interface AutoReloadController {
  /** autoReload の ON/OFF を反映する（baseline 設定 / クリア + キーボードナビ listener）。 */
  set(autoReload: boolean): void;
  dispose(): void;
}

/**
 * 自動再読み込み: 変更 gutter の baseline 管理と変更箇所ナビ（Esc / Alt+F5 / Alt+Shift+F5）。
 */
export function createAutoReloadController(editor: Editor): AutoReloadController {
  let listening = false;
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      editor.commands.setChangeGutterBaseline();
      return;
    }
    if (e.key === "F5" && e.altKey) {
      e.preventDefault();
      if (e.shiftKey) {
        editor.commands.goToPrevChange();
      } else {
        editor.commands.goToNextChange();
      }
    }
  };
  return {
    set(autoReload: boolean): void {
      if (autoReload) {
        editor.commands.setChangeGutterBaseline();
      } else {
        editor.commands.clearChangeGutter();
      }
      if (autoReload && !listening) {
        globalThis.addEventListener("keydown", onKeydown);
        listening = true;
      } else if (!autoReload && listening) {
        globalThis.removeEventListener("keydown", onKeydown);
        listening = false;
      }
    },
    dispose(): void {
      if (listening) globalThis.removeEventListener("keydown", onKeydown);
      listening = false;
    },
  };
}

/**
 * VS Code 拡張からの外部コンテンツ更新（`vscode-set-content`・メニュー Undo/Redo / Git History 等）。
 *
 * React 版の useEditorSideEffects（WYSIWYG）+ useVSCodeSourceContentSync（source）の統合。
 * source モード中は textarea テキストのみ更新し、WYSIWYG 中はフロントマターを分離して
 * `setContent`（emitUpdate=false・保存ループ防止）する。
 */
export function installVSCodeContentSync(
  editor: Editor,
  handlers: {
    getSourceMode: () => boolean;
    setSourceText: (body: string) => void;
    setFrontmatter: (fm: string | null) => void;
    /** エディタへ適用した後の通知（headings 再通知等）。 */
    onEditorApplied?: () => void;
  },
): () => void {
  const handler = (e: Event): void => {
    const content = (e as CustomEvent<string>).detail;
    if (typeof content !== "string") return;
    if (handlers.getSourceMode()) {
      const { body } = preprocessMarkdown(content);
      handlers.setSourceText(body);
      return;
    }
    if (editor.isDestroyed) return;
    const { frontmatter, body } = parseFrontmatter(content);
    handlers.setFrontmatter(frontmatter);
    const currentMd = getMarkdownFromEditorSafe(editor);
    if (body === currentMd) return;
    editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(body)), { emitUpdate: false });
    handlers.onEditorApplied?.();
  };
  globalThis.addEventListener("vscode-set-content", handler);
  return () => globalThis.removeEventListener("vscode-set-content", handler);
}

/**
 * スラッシュコマンド等からフロントマターを読み書きするための editor storage 登録。
 */
export function installFrontmatterStorage(
  editor: Editor,
  get: () => string | null,
  set: (value: string | null) => void,
): () => void {
  let storage: Record<string, unknown>;
  try {
    storage = getEditorStorage(editor);
  } catch (error) {
    console.warn("[vanillaPageSeams] installFrontmatterStorage: storage unavailable", error);
    return () => {};
  }
  storage.frontmatter = { get, set };
  return () => {
    delete storage.frontmatter;
  };
}
