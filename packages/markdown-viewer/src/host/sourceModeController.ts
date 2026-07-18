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
  /** 全体ズーム（Ctrl/Cmd+ホイール）の倍率を source ビューへ適用する。 */
  setZoom(factor: number): void;
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

// textarea・ミラー・ガターの上下 padding。先頭行の縦位置を揃えるため、textarea/ミラーの
// padding-top と GUTTER_CSS の padding-top は必ず同値でなければならない（共有定数で担保）。
const SOURCE_EDGE_PADDING = "16px";

// textarea / ミラーで共有する padding。折り返し幅を一致させ、行高計測の整合を保つため
// 両者で必ず同値にする。
const SOURCE_PADDING_CSS = `padding:${SOURCE_EDGE_PADDING};`;

const TEXTAREA_CSS =
  "position:relative;z-index:1;display:block;width:100%;min-height:100%;box-sizing:border-box;" +
  "border:none;outline:none;resize:none;overflow:hidden;" +
  SOURCE_FONT_CSS +
  SOURCE_PADDING_CSS +
  // textarea は .tiptap の兄弟（contentEl 直下）のため .tiptap の color を継承できない。
  // host が root へ適用する --am-editor-text を直接参照してテーマ文字色に追従する
  // （color:inherit だとテーマ非対応ページ＝拡張等でダーク時にページ既定の黒へ落ちる）。
  "background:transparent;color:var(--am-editor-text, inherit);" +
  // 比較モード（MergeEditorPanel）と同じく折り返す。横スクロールはせず、内容高さへ
  // 伸長して sourceWrap 側を唯一のスクローラにする（overflow:hidden + auto-grow）。
  "white-space:pre-wrap;overflow-wrap:break-word;";

// textarea 背面のミラー。折り返し後の各論理行の実高さを計測するため、textarea と同じ
// フォント・幅・padding・pre-wrap で各行を個別 div として描画する（文字は透明）。
const MIRROR_CSS =
  "position:absolute;top:0;left:0;right:0;z-index:0;pointer-events:none;color:transparent;" +
  "box-sizing:border-box;" +
  SOURCE_FONT_CSS +
  SOURCE_PADDING_CSS +
  "white-space:pre-wrap;overflow-wrap:break-word;";

// textarea とミラーを重ねるコンテナ（折り返し幅の基準・min-width:0 で flex 縮小を許可）。
const TEXT_CONTAINER_CSS = "flex:1 1 auto;min-width:0;position:relative;";

// gutter + textarea を縦スクロールする wrapper（wrapper 自身が縦スクローラ）。
const SOURCE_WRAP_CSS = "width:100%;height:100%;overflow:auto;";

// gutter + textContainer を横並びにし、全体ズーム（Ctrl/Cmd+ホイール）の zoom を掛ける内側
// レイヤ。ズーム対象をスクローラ（sourceWrap）でなくこの内側に置くことで、拡大時に sourceWrap が
// スクロールバーを出す（wrapper 自身へ zoom を掛けると overflow:hidden の contentEl に切られる）。
const SOURCE_INNER_CSS = "display:flex;min-height:100%;box-sizing:border-box;";

// 左端の行番号ガター。論理行ごとに 1 つの div を並べ、各 div の高さはミラー計測値へ
// 同期する（折り返した論理行でも行番号が先頭に揃う）。padding-top は textarea と一致させ
// 先頭行を揃える。wrapper がスクロールするためガター自身はスクロールしない。
const GUTTER_CSS =
  "flex:0 0 auto;box-sizing:border-box;text-align:right;white-space:pre;user-select:none;" +
  SOURCE_FONT_CSS +
  // 上下 padding は SOURCE_PADDING_CSS と同値（SOURCE_EDGE_PADDING）で先頭行を揃える。
  `padding:${SOURCE_EDGE_PADDING} 8px ${SOURCE_EDGE_PADDING} 12px;` +
  "color:var(--am-color-text-secondary);" +
  "border-right:1px solid var(--am-color-divider);";

/** editor mode の vanilla コントローラを生成する。 */
export function createSourceModeController(
  options: CreateSourceModeControllerOptions,
): SourceModeController {
  const { editor, contentEl, t, persistMode = true } = options;
  let mode: VanillaEditorMode = "wysiwyg";
  let sourceText = "";
  // 全体ズーム倍率（host が Ctrl/Cmd+ホイールで更新）。source 再表示のたびに再適用する。
  let sourceZoom = 1;
  let textarea: HTMLTextAreaElement | null = null;
  let sourceWrap: HTMLElement | null = null;
  // gutter + textarea を包むズーム対象レイヤ（source 表示中のみ非 null）。
  let sourceInner: HTMLElement | null = null;
  let gutter: HTMLElement | null = null;
  // textarea 背面のミラー（折り返し後の各行の実高さ計測用）。
  let mirror: HTMLElement | null = null;
  // textContainer の幅変化（＝折り返し再計算）を監視し、行高同期を再実行する。
  let resizeObserver: ResizeObserver | null = null;
  let syncScheduled = false;
  // source モード中に退避する contentEl の overflow（sourceWrap を唯一のスクローラにするため）。
  let prevContentOverflow: string | null = null;

  /** textarea の論理行（空でも 1 行・末尾改行は +1 行＝textarea の表示挙動に合わせる）。 */
  const splitLines = (text: string): string[] => (text.length === 0 ? [""] : text.split("\n"));

  /**
   * 行番号ガターとミラーを現在のテキストから再構築する。比較モード（MergeEditorPanel）と
   * 同じく、ミラーは折り返し後の各行高さ計測用の透明テキスト、ガターは論理行ごとの行番号 div。
   */
  const renderLines = (): void => {
    if (!gutter || !mirror) return;
    const lines = splitLines(textarea?.value ?? sourceText);
    gutter.textContent = "";
    mirror.textContent = "";
    for (let i = 0; i < lines.length; i++) {
      const numEl = document.createElement("div");
      numEl.textContent = String(i + 1);
      gutter.appendChild(numEl);
      // 空行も 1 行分の高さを確保するため半角スペースで代替する。
      const lineEl = document.createElement("div");
      lineEl.textContent = lines[i] || " ";
      mirror.appendChild(lineEl);
    }
  };

  /** textarea を内容の高さへ伸長する（内部スクロールせず sourceWrap を唯一のスクローラにする）。 */
  const autoGrow = (): void => {
    if (!textarea) return;
    textarea.style.height = "auto";
    // jsdom では scrollHeight が 0 になることがあるが、ブラウザでは実高さに伸長する。
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  /** ミラー各行の描画高さを計測し、対応する行番号 div の高さへ反映する（折り返し追従）。 */
  const applyHeights = (): void => {
    if (!gutter || !mirror) return;
    for (let i = 0; i < mirror.children.length; i++) {
      const h = (mirror.children[i] as HTMLElement).getBoundingClientRect().height;
      if (i < gutter.children.length) {
        (gutter.children[i] as HTMLElement).style.height = `${h}px`;
      }
    }
  };

  /** 入力・リサイズ後の伸長・行高同期を rAF で 1 フレームに集約する（reflow 抑制）。 */
  const scheduleSync = (): void => {
    if (syncScheduled) return;
    syncScheduled = true;
    const run = (): void => {
      syncScheduled = false;
      autoGrow();
      applyHeights();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
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

  // 全体ズームを内側レイヤへ適用（source 表示中のみ効く。1 のときはリセット）。
  const applySourceZoom = (): void => {
    if (sourceInner) sourceInner.style.zoom = sourceZoom === 1 ? "" : String(sourceZoom);
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

    // textarea + ミラーを重ねるコンテナ。ミラーは折り返し後の行高を計測する透明レイヤ。
    const textContainer = document.createElement("div");
    textContainer.setAttribute("data-am-source-text", "");
    textContainer.style.cssText = TEXT_CONTAINER_CSS;

    mirror = document.createElement("div");
    mirror.setAttribute("data-am-source-mirror", "");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.cssText = MIRROR_CSS;

    textarea = document.createElement("textarea");
    textarea.setAttribute("data-am-source-textarea", "");
    textarea.setAttribute("aria-label", t("sourceMode"));
    textarea.spellcheck = false;
    textarea.style.cssText = TEXTAREA_CSS;
    textarea.value = sourceText;
    textarea.addEventListener("input", () => {
      sourceText = textarea?.value ?? "";
      renderLines();
      scheduleSync();
      options.onSourceSave?.(sourceText);
    });

    textContainer.append(mirror, textarea);
    sourceInner = document.createElement("div");
    sourceInner.setAttribute("data-am-source-inner", "");
    sourceInner.style.cssText = SOURCE_INNER_CSS;
    sourceInner.append(gutter, textContainer);
    sourceWrap.append(sourceInner);
    applySourceZoom();
    editor.view.dom.style.display = "none";
    // textarea を内容高さへ伸長し（overflow:hidden）、sourceWrap（overflow:auto）を唯一の
    // スクローラにする。source 中は contentEl の overflow を hidden にしてスクロールバーの
    // 二重表示を防ぐ（退出時に元の overflow を復元する）。
    prevContentOverflow = contentEl.style.overflow;
    contentEl.style.overflow = "hidden";
    contentEl.appendChild(sourceWrap);
    renderLines();
    scheduleSync();
    // textContainer の幅変化（パネル幅変更・サイドバー開閉）で折り返しが変わるため再同期する。
    // jsdom では ResizeObserver 未実装のことがあるためガードする。
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleSync());
      resizeObserver.observe(textContainer);
    }
  };

  const doHideTextarea = (): void => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    // 保留中の rAF（発火前に非表示化）を破棄扱いにして、次の showTextarea の
    // scheduleSync が確実に通る（= 初期 applyHeights が走る）ようにする。
    syncScheduled = false;
    sourceWrap?.remove();
    sourceWrap = null;
    sourceInner = null;
    gutter = null;
    mirror = null;
    textarea = null;
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
        renderLines();
        scheduleSync();
      }
    },
    switchTo: applyMode,
    getTextarea: () => textarea,
    setZoom(factor: number): void {
      sourceZoom = factor;
      applySourceZoom();
    },
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
