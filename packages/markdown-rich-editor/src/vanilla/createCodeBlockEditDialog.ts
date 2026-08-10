/**
 * コードブロック全画面編集ダイアログ (vanilla) — CodeBlockEditDialog の React 非依存移植。
 * lowlight 構文ハイライト・検索置換・サンプルパネルを素 DOM で実装。
 */

import { common, createLowlight } from "lowlight";
import {
  getDivider, getHljsCssVars, getHljsTokenCss,
  FS_PANEL_HEADER_FONT_SIZE,
} from "@anytime-markdown/markdown-editor";
import { createDialog } from "@anytime-markdown/ui-core/Dialog";
import { createMediaQuery } from "@anytime-markdown/ui-core/mediaQuery";
import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import { renderCodeBlockPreview } from "../components/codeblock/codeBlockPreview";

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
   * renderPreview = true 時、構文ハイライト（ソース表示）ではなく言語別の実プレビューを
   * 本文 NodeView と同じ {@link renderCodeBlockPreview} で描画する。html 等の rendered kind 用。
   * renderPreviewHtml を指定した場合はそちらが優先される。
   */
  renderLanguagePreview?: boolean;
  /**
   * renderPreview = true 時、プレビュー HTML 設定直後に呼ばれる汎用フック。
   * 描画済みプレビュー要素へ操作層（WYSIWYG ハンドラ等）を装着するために使う。
   * 戻り値のクリーンアップ関数は次回 render 前・dialog 破棄時に呼ばれる。
   */
  onPreviewRendered?: (previewEl: HTMLElement, isDark: boolean) => (() => void) | void;
  /**
   * renderPreview = true 時、右ペインの ZoomToolbar 下に追加する小さな操作領域。
   * 言語別プレビュー固有のトグルなど、本文プレビュー外の UI に使う。
   */
  previewToolbar?: HTMLElement;
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
  /**
   * 指定時、プレビューペインの右側に固定幅の補助パネルを表示する。
   * `mount` は dialog open 時に 1 回呼ばれ、cleanup は dialog 破棄時に呼ばれる。
   */
  previewSidePanel?: {
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
.am-cbed-preview-main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;}
.am-cbed-preview-with-panel{display:flex;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;}
.am-cbed-preview-side-panel{flex:0 0 240px;width:240px;min-height:0;overflow:auto;border-left:1px solid var(--am-color-divider,#d0d7de);background:var(--am-color-bg-paper,transparent);}
.am-cbed-left-topbar{display:flex;align-items:center;border-bottom:1px solid var(--am-color-divider,#d0d7de);flex-shrink:0;}
.am-cbed-left-title{flex:1 1 auto;padding:4px 8px;font-size:${FS_PANEL_HEADER_FONT_SIZE};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.am-cbed-left-topbar [role="tablist"]{flex:1 1 auto;min-width:0;}
.am-cbed-pane-toggle{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:2px 4px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;line-height:1;}
.am-cbed-pane-toggle:hover,.am-cbed-pane-toggle:focus{background:var(--am-color-action-hover,rgba(0,0,0,0.04));}
.am-cbed-expand-rail{display:none;flex:0 0 28px;width:28px;align-items:center;justify-content:center;border-right:1px solid var(--am-color-divider,#d0d7de);background:var(--am-color-bg-paper,transparent);min-height:0;}
.am-cbed-expand-rail .am-cbed-pane-toggle{width:100%;height:100%;min-width:0;margin:0;border-radius:0;}
.am-split-container.col .am-cbed-expand-rail{flex:0 0 28px;width:auto;border-right:0;border-bottom:1px solid var(--am-color-divider,#d0d7de);}
/* 言語別の実プレビュー（html 等を renderCodeBlockPreview で描画）はコード表示用の
   monospace / white-space:pre を解除し、通常フローでレンダリングする。 */
.am-cbed-preview.am-cbed-preview--rendered{display:block;font-family:inherit;white-space:normal;}
.am-cbed-preview pre{margin:0;}
.am-cbed-preview code{display:block;white-space:pre-wrap;word-break:break-word;}
.am-cbed-preview svg{max-width:100%;height:auto;display:block;margin:0 auto;}
.am-cbed-preview .anytime-graph-error{white-space:pre-wrap;color:var(--am-color-text-secondary, #888);font-family:monospace;margin:0;}
${getHljsTokenCss(".am-cbed-preview")}
`);
}

function buildHighlightInner(code: string, language: string): string {
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

/**
 * 構文ハイライト済みコードを `<pre><code class="hljs">` でラップして返す。
 * ラッパ無しの裸 span 列は `.am-cbed-preview`（flex 縦並び）で各 span が縦積みになり
 * レイアウトが崩れるため、ブロック要素で包む。着色は {@link getHljsTokenCss} のルール
 * （`var(--hljs-*)`）＋ previewInner に設定した {@link getHljsCssVars} の変数で行う。
 */
function buildHighlightHtml(code: string, language: string): string {
  if (!code) return "";
  return `<pre><code class="hljs">${buildHighlightInner(code, language)}</code></pre>`;
}

type SplitLayout = ReturnType<typeof createDraggableSplitLayout>;

/** cleanup 関数を 1 つだけ保持し、run で実行してから破棄する（多重呼び出し防止）。 */
interface CleanupSlot {
  set: (next: (() => void) | void) => void;
  run: () => void;
}

function createCleanupSlot(): CleanupSlot {
  let cleanup: (() => void) | void;
  return {
    set(next) {
      cleanup = next;
    },
    run() {
      if (cleanup) {
        cleanup();
        cleanup = undefined;
      }
    },
  };
}

/**
 * 左コードペインの折りたたみ/展開ボタンを生成し、展開レールを split へ差し込む。
 * 左ペイン・divider の表示は split.setLeftCollapsed（updateLayout）が単一の書き込み主体。
 * 分割幅は helper 内部の splitPx が保持するため、展開時の幅復帰も updateLayout に任せる。
 */
function createCodePaneToggle(split: SplitLayout, t: (key: string) => string): {
  collapseBtn: HTMLButtonElement;
  expandRail: HTMLElement;
} {
  const collapseLabel = t("collapseCodePane");
  const expandLabel = t("expandCodePane");
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "am-cbed-pane-toggle";
  collapseBtn.setAttribute("aria-label", collapseLabel);
  collapseBtn.setAttribute("aria-expanded", "true");
  collapseBtn.title = collapseLabel;
  collapseBtn.textContent = "◀";

  const expandRail = document.createElement("div");
  expandRail.className = "am-cbed-expand-rail";
  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "am-cbed-pane-toggle";
  expandBtn.setAttribute("aria-label", expandLabel);
  expandBtn.setAttribute("aria-expanded", "false");
  expandBtn.title = expandLabel;
  expandBtn.textContent = "▶";
  expandRail.appendChild(expandBtn);
  split.el.insertBefore(expandRail, split.right);

  const notifyPreviewResize = (): void => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  };
  const applyCodePaneCollapse = (collapsed: boolean): void => {
    split.setLeftCollapsed(collapsed);
    expandRail.style.display = collapsed ? "flex" : "none";
    collapseBtn.setAttribute("aria-expanded", String(!collapsed));
    expandBtn.setAttribute("aria-expanded", String(!collapsed));
    notifyPreviewResize();
  };
  collapseBtn.addEventListener("click", () => applyCodePaneCollapse(true));
  expandBtn.addEventListener("click", () => applyCodePaneCollapse(false));

  return { collapseBtn, expandRail };
}

/** 左ペインのタブ切替で表示を入れ替える 3 要素 */
interface AuxTabViews {
  codeEl: HTMLElement;
  samplePanelEl: HTMLElement | null;
  auxContainer: HTMLElement;
}

/** 補助タブ選択時: スクリプト側を隠して補助エディタを mount する。 */
function showAuxTab(views: AuxTabViews, mountAux: () => void): void {
  views.codeEl.style.display = "none";
  if (views.samplePanelEl) views.samplePanelEl.style.display = "none";
  views.auxContainer.style.display = "block";
  mountAux();
}

/** スクリプトタブ選択時: 補助エディタを破棄してスクリプト側を戻す。 */
function showScriptTab(views: AuxTabViews, auxSlot: CleanupSlot): void {
  auxSlot.run();
  views.auxContainer.style.display = "none";
  views.codeEl.style.display = "";
  if (views.samplePanelEl) views.samplePanelEl.style.display = "";
}

interface LeftPaneParams {
  opts: CreateCodeBlockEditDialogOptions;
  split: SplitLayout;
  /** 左ペインの構成要素（コード入力・サンプルパネル・折りたたみボタン） */
  parts: { codeEl: HTMLElement; samplePanelEl: HTMLElement | null; collapseBtn: HTMLButtonElement };
  auxSlot: CleanupSlot;
}

/** 左ペインを組み立てる（leftAuxTab 指定時はタブ付き、未指定なら見出しのみ）。 */
function buildLeftPane(p: LeftPaneParams): void {
  const { opts, split, auxSlot } = p;
  const { codeEl, samplePanelEl, collapseBtn } = p.parts;
  const { state, t, isDark } = opts;
  // leftAuxTab 指定時はスクリプト ⇄ 補助エディタ（表など）のタブを出す。
  if (opts.leftAuxTab) {
    const auxTab = opts.leftAuxTab;
    const auxContainer = document.createElement("div");
    auxContainer.style.cssText = "flex:1 1 auto;display:none;min-height:0;overflow:hidden;";
    const views: AuxTabViews = { codeEl, samplePanelEl, auxContainer };
    const mountAux = (): void => {
      auxSlot.run();
      auxContainer.replaceChildren();
      auxSlot.set(auxTab.mount(auxContainer, {
        getCode: () => state.getFsCode(),
        setCode: (s) => state.onFsTextChange(s),
        isDark,
      }));
    };
    const tabs = createTabs({
      value: "script",
      tabs: [
        { value: "script", label: t("scriptTab") },
        { value: "table", label: t(auxTab.labelKey) },
      ],
      onChange: (v) => {
        tabs.update({ value: v }); // 選択状態（aria-selected / ハイライト）を反映
        if (v === "table") showAuxTab(views, mountAux);
        else showScriptTab(views, auxSlot);
      },
    });
    const topbar = document.createElement("div");
    topbar.className = "am-cbed-left-topbar";
    topbar.appendChild(tabs.el);
    topbar.appendChild(collapseBtn);
    split.left.appendChild(topbar);
    split.left.appendChild(codeEl);
    split.left.appendChild(auxContainer);
    if (samplePanelEl) split.left.appendChild(samplePanelEl);
  } else {
    const codeHeader = document.createElement("div");
    codeHeader.className = "am-cbed-left-topbar";
    codeHeader.style.borderBottomColor = getDivider(isDark);
    const codeTitle = document.createElement("span");
    codeTitle.className = "am-cbed-left-title";
    codeTitle.textContent = t("codeTab");
    codeHeader.appendChild(codeTitle);
    codeHeader.appendChild(collapseBtn);
    split.left.appendChild(codeHeader);
    split.left.appendChild(codeEl);
    if (samplePanelEl) split.left.appendChild(samplePanelEl);
  }
}

interface ZoomFitButtonParams {
  zp: ZoomPanController;
  /** ビューポート側（表示枠）と内容側の要素 */
  els: { outer: HTMLElement; inner: HTMLElement };
  t: (key: string) => string;
}

/** ZoomToolbar の「全体表示」ボタン（内容が表示枠へ収まる倍率にする）。 */
function createZoomFitButton(p: ZoomFitButtonParams): HTMLButtonElement {
  const { zp, t } = p;
  const fitButton = document.createElement("button");
  fitButton.type = "button";
  fitButton.className = "am-zt-btn";
  fitButton.setAttribute("aria-label", t("zoomFit"));
  fitButton.title = t("zoomFit");
  fitButton.textContent = "□";
  fitButton.addEventListener("click", () => {
    const outerRect = p.els.outer.getBoundingClientRect();
    const innerRect = p.els.inner.getBoundingClientRect();
    const currentZoom = zp.getState().zoom || 1;
    const contentWidth = innerRect.width / currentZoom;
    const contentHeight = innerRect.height / currentZoom;
    if (outerRect.width <= 0 || outerRect.height <= 0 || contentWidth <= 0 || contentHeight <= 0) {
      zp.reset();
      return;
    }
    const nextZoom = Math.min(1, (outerRect.width - 24) / contentWidth, (outerRect.height - 24) / contentHeight);
    zp.reset();
    zp.setZoom(nextZoom);
  });
  return fitButton;
}

interface SidePanelParams {
  panel: NonNullable<CreateCodeBlockEditDialogOptions["previewSidePanel"]>;
  split: SplitLayout;
  ctx: { getCode: () => string; setCode: (s: string) => void; isDark: boolean };
}

/** プレビュー右側の固定幅補助パネルを mount し、cleanup を返す。 */
function mountPreviewSidePanel(p: SidePanelParams): () => void {
  const { split } = p;
  split.right.classList.add("am-cbed-preview-with-panel");
  // .am-split-right の flex-direction:column と同特異度でスタイル注入順に勝敗が依存するため、
  // インラインで横並び（パネルはプレビュー本体の右側）を確定させる。
  // 狭幅では split 本体の縦積み切替（dialogHelpers の 900px 境界）に合わせてパネルも下積みへ戻す。
  const panelMq = createMediaQuery("(max-width:899.95px)");
  const applyPanelDirection = (narrow: boolean): void => {
    split.right.style.flexDirection = narrow ? "column" : "row";
  };
  applyPanelDirection(panelMq.matches);
  panelMq.subscribe(applyPanelDirection);
  const sidePanel = document.createElement("aside");
  sidePanel.className = "am-cbed-preview-side-panel";
  split.right.appendChild(sidePanel);
  const mountCleanup = p.panel.mount(sidePanel, p.ctx);
  return () => {
    panelMq.destroy();
    mountCleanup();
  };
}

interface PreviewPaneParams {
  opts: CreateCodeBlockEditDialogOptions;
  split: SplitLayout;
  zp: ZoomPanController;
  /** 補助パネルの cleanup 置き場 */
  sidePanelSlot: CleanupSlot;
}

/** 右ペイン（ZoomToolbar + プレビュー本体 + 補助パネル）を組み、プレビュー要素を返す。 */
function mountPreviewPane(p: PreviewPaneParams): HTMLElement {
  const { opts, split, zp } = p;
  const { state, t, isDark } = opts;
  const rightTarget = opts.previewSidePanel ? document.createElement("div") : split.right;
  if (opts.previewSidePanel && rightTarget !== split.right) {
    rightTarget.className = "am-cbed-preview-main";
    split.right.appendChild(rightTarget);
  }

  const zt = createZoomToolbar({ zp, isDark, t });
  rightTarget.appendChild(zt.el);
  if (opts.previewToolbar) {
    rightTarget.appendChild(opts.previewToolbar);
  }

  const zv = createZoomablePreview({ zp, isDark });
  rightTarget.appendChild(zv.el);
  zv.el.style.flex = "1 1 auto";

  const previewInner = document.createElement("div");
  previewInner.className = "am-cbed-preview";
  // hljs トークン色は getHljsTokenCss(".am-cbed-preview") の var(--hljs-*) 参照ルールが消費する。
  // NOTE: isDark はクロージャで固定。テーマ切替時の CSS 変数再設定は未対応（ダイアログ再生成で反映・既存制約）。
  const cssVars = getHljsCssVars(isDark) as Record<string, string>;
  for (const [k, v] of Object.entries(cssVars)) {
    previewInner.style.setProperty(k, v);
  }
  zv.inner.appendChild(previewInner);

  zt.el.appendChild(createZoomFitButton({ zp, els: { outer: zv.el, inner: previewInner }, t }));

  if (opts.previewSidePanel) {
    p.sidePanelSlot.set(mountPreviewSidePanel({
      panel: opts.previewSidePanel,
      split,
      ctx: {
        getCode: () => state.getFsCode(),
        setCode: (s) => state.onFsTextChange(s),
        isDark,
      },
    }));
  }
  return previewInner;
}

interface PreviewRenderParams {
  opts: CreateCodeBlockEditDialogOptions;
  previewEl: HTMLElement;
  /** 描画で装着した操作層の cleanup 置き場 */
  previewSlot: CleanupSlot;
  /** 言語別プレビューが要求する再描画コールバック */
  rerender: () => void;
}

/** プレビュー要素の内容を再描画する（前回装着した操作層は呼び出し側が破棄済み）。 */
function renderPreviewContent(p: PreviewRenderParams): void {
  const { opts, previewEl, previewSlot } = p;
  const { state, t, isDark, fontSize, language } = opts;
  const code = state.getFsCode();
  if (opts.renderPreviewHtml) {
    // 独自プレビュー HTML（図 SVG 等・呼び出し側 sanitize 済み）。
    previewEl.classList.remove("am-cbed-preview--rendered");
    previewEl.innerHTML = opts.renderPreviewHtml(code, isDark);
    previewSlot.set(opts.onPreviewRendered?.(previewEl, isDark));
  } else if (opts.renderLanguagePreview) {
    // 言語別の実プレビュー（html 等）を本文と同じ共通レンダラで描画する。
    previewEl.classList.add("am-cbed-preview--rendered");
    const cancel = renderCodeBlockPreview(previewEl, language, code, { isDark, fontSize, t }, p.rerender);
    const extra = opts.onPreviewRendered?.(previewEl, isDark);
    previewSlot.set(() => {
      cancel();
      extra?.();
    });
  } else {
    // regular コードは構文ハイライト（ソース表示）。
    previewEl.classList.remove("am-cbed-preview--rendered");
    previewEl.innerHTML = buildHighlightHtml(code, language);
    previewSlot.set(opts.onPreviewRendered?.(previewEl, isDark));
  }
}

export function createCodeBlockEditDialog(opts: CreateCodeBlockEditDialogOptions): CodeBlockEditDialogHandle {
  ensureDialogStyle();

  const { state, t, isDark, fontSize, lineHeight, readOnly, renderPreview } = opts;

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
  const { collapseBtn } = createCodePaneToggle(split, t);

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

  const auxSlot = createCleanupSlot();
  buildLeftPane({ opts, split, parts: { codeEl: lnt.el, samplePanelEl, collapseBtn }, auxSlot });

  // ---- 右: ZoomToolbar + syntax preview ----
  const sidePanelSlot = createCleanupSlot();
  let previewEl: HTMLElement | null = null;
  if (renderPreview) {
    previewEl = mountPreviewPane({ opts, split, zp, sidePanelSlot });
  }

  dlg.paper.appendChild(split.el);
  split.el.style.flex = "1 1 auto";

  // ---- 状態同期 ----
  const previewSlot = createCleanupSlot();
  function render(): void {
    lnt.update({ value: state.getFsCode(), isDark, fontSize, lineHeight });
    header.update({ dirty: state.isFsDirty() });
    if (previewEl) {
      // 前回装着した操作層を破棄してから再描画する（ハンドラ・ポップオーバーの宙吊り防止）。
      previewSlot.run();
      renderPreviewContent({ opts, previewEl, previewSlot, rerender: render });
    }
  }

  state.onOpen();
  render();

  const unsub = state.subscribe(render);

  return {
    el: dlg.el,
    destroy() {
      auxSlot.run();
      previewSlot.run();
      sidePanelSlot.run();
      unsub();
      split.destroy();
      dlg.destroy();
    },
  };
}
