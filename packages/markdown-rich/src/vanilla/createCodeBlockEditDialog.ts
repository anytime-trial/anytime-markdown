/**
 * コードブロック全画面編集ダイアログ (vanilla) — CodeBlockEditDialog の React 非依存移植。
 * lowlight 構文ハイライト・検索置換・サンプルパネルを素 DOM で実装。
 */

import { common, createLowlight } from "lowlight";
import {
  getDivider, getHljsCssVars,
  FS_PANEL_HEADER_FONT_SIZE,
} from "@anytime-markdown/markdown-viewer";
import { createDialog } from "@anytime-markdown/ui-core/Dialog";
import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";

import type { ZoomPanController } from "./zoomPanState";
import { createZoomPanState } from "./zoomPanState";
import type { CodeEditState } from "./codeEditState";
import {
  createLineNumberTextarea,
  createSamplePanel,
  createZoomToolbar,
  createZoomablePreview,
  createDraggableSplitLayout,
  createDialogHeader,
  createTabs,
  hastToHtmlString,
  ensureStyle,
} from "./dialogHelpers";
import type { SampleItem } from "./dialogHelpers";

const lowlight = createLowlight(common);

export interface CreateCodeBlockEditDialogOptions {
  label: string;
  language: string;
  isDark: boolean;
  editorBg: string;
  fontSize: number;
  lineHeight: number;
  readOnly?: boolean;
  customSamples?: SampleItem[];
  /** renderPreview = true のとき右ペインに syntax highlight プレビューを出す */
  renderPreview?: boolean;
  /**
   * renderPreview = true 時、プレビュー HTML を独自生成する（図のレンダリング等）。
   * 未指定なら構文ハイライトを表示する。戻り値は呼び出し側でサニタイズ済みであること。
   * テーマ依存の描画に対応できるよう isDark を渡す。
   */
  renderPreviewHtml?: (code: string, isDark: boolean) => string;
  /**
   * renderPreview = true 時、プレビュー HTML 設定直後に呼ばれる汎用フック。
   * 描画済みプレビュー要素へ操作層（WYSIWYG ハンドラ等）を装着するために使う。
   * 戻り値のクリーンアップ関数は次回 render 前・dialog 破棄時に呼ばれる。
   */
  onPreviewRendered?: (previewEl: HTMLElement, isDark: boolean) => (() => void) | void;
  /**
   * 指定時、左ペイン上部に「スクリプト ⇄ 補助エディタ」タブを表示する。
   * `mount` は補助タブ活性化のたびに呼ばれ（前回 cleanup 後）、戻り値の cleanup は
   * タブ切替・dialog 破棄時に呼ばれる。`getCode`/`setCode` は CodeEditState に橋渡しされる。
   */
  leftAuxTab?: {
    labelKey: string;
    mount: (
      container: HTMLElement,
      ctx: { getCode: () => string; setCode: (s: string) => void; isDark: boolean },
    ) => () => void;
  };
  state: CodeEditState;
  t: (key: string) => string;
  onClose: () => void;
}

export interface CodeBlockEditDialogHandle {
  /** ダイアログ DOM（document.body に append 済み） */
  el: HTMLElement;
  /** ダイアログを破棄する */
  destroy: () => void;
}

const STYLE_ID = "am-vanilla-codeblock-dialog";

function ensureDialogStyle(): void {
  ensureStyle(STYLE_ID, `
.am-cbed-content{display:flex;flex:1 1 auto;overflow:hidden;min-height:0;}
.am-cbed-preview{flex:1;display:flex;flex-direction:column;overflow:auto;padding:12px;font-family:monospace;white-space:pre;}
.am-cbed-preview pre{margin:0;}
.am-cbed-preview code{display:block;white-space:pre-wrap;word-break:break-word;}
.am-cbed-preview svg{max-width:100%;height:auto;display:block;margin:0 auto;}
.am-cbed-preview .anytime-graph-error{white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-family:monospace;margin:0;}
`);
}

function buildHighlightHtml(code: string, language: string): string {
  if (!code) return "";
  try {
    const langs = lowlight.listLanguages();
    if (!langs.includes(language) || language === "plaintext") {
      return code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
    const tree = lowlight.highlight(language, code);
    return hastToHtmlString(tree as unknown as { children: unknown[] });
  } catch {
    return code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
}

export function createCodeBlockEditDialog(opts: CreateCodeBlockEditDialogOptions): CodeBlockEditDialogHandle {
  ensureDialogStyle();

  const { state, t, isDark, fontSize, lineHeight, language, readOnly, renderPreview } = opts;

  const zp: ZoomPanController = createZoomPanState();

  // ---- ダイアログ生成 ----
  const dlg = createDialog({
    onClose: opts.onClose,
    fullScreen: true,
    labelledBy: "codeblock-edit-title",
    paperStyle: { backgroundColor: opts.editorBg },
  });

  // ---- ヘッダー ----
  const header = createDialogHeader({
    label: opts.label,
    isDark,
    iconText: "{}",
    dirty: state.isFsDirty(),
    t,
    onClose: opts.onClose,
    onApply: readOnly ? undefined : () => state.onApply(),
  });
  header.el.id = "codeblock-edit-title";
  dlg.paper.appendChild(header.el);

  // ---- split layout ----
  const split = createDraggableSplitLayout({
    initialPercent: renderPreview ? 50 : undefined,
    isDark,
    t,
  });

  // ---- 左: コードエリア + サンプルパネル ----
  const lnt = createLineNumberTextarea({
    value: state.getFsCode(),
    onChange: (e) => {
      const ta = e.target as HTMLTextAreaElement;
      state.onFsCodeChange({ target: { value: ta.value } });
    },
    fontSize,
    lineHeight,
    isDark,
    readOnly,
  });
  lnt.el.style.flex = "1 1 auto";

  const samples: SampleItem[] = opts.customSamples ?? Object.entries(CODE_HELLO_SAMPLES).map(
    ([lang, code]) => ({ label: lang, i18nKey: lang, code }),
  );
  let samplePanelEl: HTMLElement | null = null;
  if (!readOnly && samples.length > 0) {
    const samplePanel = createSamplePanel({
      samples,
      onInsert: (code) => state.onFsTextChange(code),
      isDark,
      t,
    });
    samplePanelEl = samplePanel.el;
  }

  // leftAuxTab 指定時はスクリプト ⇄ 補助エディタ（表など）のタブを出す。
  let auxCleanup: (() => void) | undefined;
  if (opts.leftAuxTab) {
    const auxTab = opts.leftAuxTab;
    const auxContainer = document.createElement("div");
    auxContainer.style.cssText = "flex:1 1 auto;display:none;min-height:0;overflow:hidden;";
    const mountAux = (): void => {
      auxCleanup?.();
      auxCleanup = undefined;
      auxContainer.replaceChildren();
      auxCleanup = auxTab.mount(auxContainer, {
        getCode: () => state.getFsCode(),
        setCode: (s) => state.onFsTextChange(s),
        isDark,
      });
    };
    const tabs = createTabs({
      value: "script",
      tabs: [
        { value: "script", label: t("scriptTab") },
        { value: "table", label: t(auxTab.labelKey) },
      ],
      onChange: (v) => {
        tabs.update({ value: v }); // 選択状態（aria-selected / ハイライト）を反映
        if (v === "table") {
          lnt.el.style.display = "none";
          if (samplePanelEl) samplePanelEl.style.display = "none";
          auxContainer.style.display = "block";
          mountAux();
        } else {
          auxCleanup?.();
          auxCleanup = undefined;
          auxContainer.style.display = "none";
          lnt.el.style.display = "";
          if (samplePanelEl) samplePanelEl.style.display = "";
        }
      },
    });
    split.left.appendChild(tabs.el);
    split.left.appendChild(lnt.el);
    split.left.appendChild(auxContainer);
    if (samplePanelEl) split.left.appendChild(samplePanelEl);
  } else {
    const codeHeader = document.createElement("div");
    codeHeader.style.cssText = `display:flex;align-items:center;padding:4px 8px;border-bottom:1px solid ${getDivider(isDark)};flex-shrink:0;font-size:${FS_PANEL_HEADER_FONT_SIZE};`;
    codeHeader.textContent = t("codeTab");
    split.left.appendChild(codeHeader);
    split.left.appendChild(lnt.el);
    if (samplePanelEl) split.left.appendChild(samplePanelEl);
  }

  // ---- 右: ZoomToolbar + syntax preview ----
  let previewEl: HTMLElement | null = null;
  if (renderPreview) {
    const zt = createZoomToolbar({ zp, isDark, t });
    split.right.appendChild(zt.el);

    const zv = createZoomablePreview({ zp, isDark });
    split.right.appendChild(zv.el);
    zv.el.style.flex = "1 1 auto";

    const previewInner = document.createElement("div");
    previewInner.className = "am-cbed-preview";
    const cssVars = getHljsCssVars(isDark) as Record<string, string>;
    for (const [k, v] of Object.entries(cssVars)) {
      previewInner.style.setProperty(k, v);
    }
    zv.inner.appendChild(previewInner);
    previewEl = previewInner;
  }

  dlg.paper.appendChild(split.el);
  split.el.style.flex = "1 1 auto";

  // ---- 状態同期 ----
  let previewCleanup: (() => void) | void;
  function render(): void {
    lnt.update({ value: state.getFsCode(), isDark, fontSize, lineHeight });
    header.update({ dirty: state.isFsDirty() });
    if (previewEl) {
      // 前回装着した操作層を破棄してから再描画する（ハンドラ・ポップオーバーの宙吊り防止）。
      if (previewCleanup) {
        previewCleanup();
        previewCleanup = undefined;
      }
      previewEl.innerHTML = opts.renderPreviewHtml
        ? opts.renderPreviewHtml(state.getFsCode(), isDark)
        : buildHighlightHtml(state.getFsCode(), language);
      previewCleanup = opts.onPreviewRendered?.(previewEl, isDark);
    }
  }

  state.onOpen();
  render();

  const unsub = state.subscribe(render);

  return {
    el: dlg.el,
    destroy() {
      if (auxCleanup) {
        auxCleanup();
        auxCleanup = undefined;
      }
      if (previewCleanup) {
        previewCleanup();
        previewCleanup = undefined;
      }
      unsub();
      split.destroy();
      dlg.destroy();
    },
  };
}
