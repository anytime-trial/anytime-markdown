/**
 * vanilla ダイアログ共通部品。
 * React 版の EditDialogWrapper / EditDialogHeader / LineNumberTextarea /
 * SamplePanel / ZoomToolbar / ZoomablePreview / DraggableSplitLayout の
 * 素 DOM 相当。
 */

import DOMPurify from "dompurify";
import {
  DEFAULT_DARK_BG, DEFAULT_LIGHT_BG,
  getActionHover, getDivider,
  getTextDisabled, getTextPrimary, getTextSecondary,
  FS_CODE_INITIAL_WIDTH, FS_CODE_MIN_WIDTH,
  FS_CHIP_HEIGHT, FS_PANEL_HEADER_FONT_SIZE,
  FS_ZOOM_LABEL_WIDTH,
  SMALL_CAPTION_FONT_SIZE,
  CHIP_FONT_SIZE,
  getHljsCssVars,
  getEditDialogBg,
} from "@anytime-markdown/markdown-viewer";
import { createDialog } from "@anytime-markdown/ui-core/Dialog";
import { createTabs } from "@anytime-markdown/ui-core/Tabs";
import { createButton } from "@anytime-markdown/ui-core/Button";
import { createIconButton } from "@anytime-markdown/ui-core/IconButton";
import { createMenu } from "@anytime-markdown/ui-core/Menu";
import { createMenuItem } from "@anytime-markdown/ui-core/MenuItem";
import { ensureStyle } from "@anytime-markdown/ui-core/dom";
import { createMediaQuery } from "@anytime-markdown/ui-core/mediaQuery";
import { escapeHtml } from "@anytime-markdown/markdown-viewer/src/utils/escapeHtml";
import type { ZoomPanController } from "./zoomPanState";

/** サンプルパネルに表示するサンプル項目。 */
export interface SampleItem {
  label: string;
  i18nKey: string;
  code: string;
}

export { createDialog, createTabs, createButton, createIconButton, createMenu, createMenuItem };

// -------------------------
// テーマユーティリティ
// -------------------------

export function applyEditorBg(el: HTMLElement, isDark: boolean, editorBg: string): void {
  const bg = getEditDialogBg(isDark, { editorBg: editorBg as "white" | "grey" });
  if (bg !== undefined) {
    el.style.backgroundColor = bg;
  }
}

// -------------------------
// lineNumberTextarea (vanilla)
// -------------------------

const LINE_TEXTAREA_STYLE_ID = "am-vanilla-line-textarea";

function ensureLineTextareaStyle(): void {
  ensureStyle(LINE_TEXTAREA_STYLE_ID, `
.am-lnt-root{display:flex;flex:1 1 auto;overflow:hidden;min-height:0;}
.am-lnt-gutter{overflow-y:hidden;user-select:none;text-align:right;padding:4px 8px 4px 4px;box-sizing:border-box;border-right:1px solid var(--am-color-divider);}
.am-lnt-gutter-line{display:block;white-space:pre;}
.am-lnt-textarea{flex:1;resize:none;border:none;outline:none;padding:4px 8px;box-sizing:border-box;font-family:monospace;overflow-y:auto;}
`);
}

export interface LineNumberTextareaHandle {
  el: HTMLElement;
  textarea: HTMLTextAreaElement;
  update: (opts: { value?: string; fontSize?: number; lineHeight?: number; isDark?: boolean; readOnly?: boolean; placeholder?: string }) => void;
  destroy: () => void;
}

export function createLineNumberTextarea(opts: {
  value: string;
  onChange: (e: Event) => void;
  fontSize: number;
  lineHeight: number;
  isDark: boolean;
  readOnly?: boolean;
  placeholder?: string;
}): LineNumberTextareaHandle {
  ensureLineTextareaStyle();

  const root = document.createElement("div");
  root.className = "am-lnt-root";

  const gutter = document.createElement("div");
  gutter.className = "am-lnt-gutter";

  const ta = document.createElement("textarea");
  ta.className = "am-lnt-textarea";
  ta.spellcheck = false;

  root.appendChild(gutter);
  root.appendChild(ta);

  let value = opts.value;
  let fontSize = opts.fontSize;
  let lineHeight = opts.lineHeight;
  let isDark = opts.isDark;

  // 描画済み行数/行高さ（差分更新用）。行番号 span をキーストロークごとに全再生成すると
  // 大きなコードブロックでフリッカー/レイアウトスラッシングを起こすため、末尾差分のみ反映する。
  let renderedLineCount = 0;
  let renderedLineHeightPx = 0;

  function updateGutter(): void {
    const lineCount = (value.match(/\n/g)?.length ?? 0) + 1;
    const gutterWidth = Math.max(3, String(lineCount).length + 1);
    gutter.style.width = `${gutterWidth}ch`;
    gutter.style.minWidth = `${gutterWidth}ch`;
    gutter.style.fontSize = `${fontSize}px`;
    gutter.style.lineHeight = String(lineHeight);
    gutter.style.color = getTextDisabled(isDark);
    gutter.style.backgroundColor = isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;

    const lineHeightPx = fontSize * lineHeight;
    if (lineHeightPx !== renderedLineHeightPx) {
      // 行高さが変わったときのみ全再構築（span の height が陳腐化するため）。
      while (gutter.firstChild) gutter.removeChild(gutter.firstChild);
      renderedLineCount = 0;
      renderedLineHeightPx = lineHeightPx;
    }
    while (renderedLineCount > lineCount) {
      gutter.lastChild?.remove();
      renderedLineCount--;
    }
    if (renderedLineCount < lineCount) {
      const frag = document.createDocumentFragment();
      for (let i = renderedLineCount; i < lineCount; i++) {
        const span = document.createElement("span");
        span.className = "am-lnt-gutter-line";
        span.style.height = `${lineHeightPx}px`;
        span.textContent = String(i + 1);
        frag.appendChild(span);
      }
      gutter.appendChild(frag);
      renderedLineCount = lineCount;
    }
  }

  function applyStyles(): void {
    ta.style.fontSize = `${fontSize}px`;
    ta.style.lineHeight = String(lineHeight);
    ta.style.color = getTextPrimary(isDark);
    ta.style.backgroundColor = isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
  }

  ta.addEventListener("scroll", () => {
    gutter.scrollTop = ta.scrollTop;
  });

  ta.addEventListener("keydown", (e) => {
    if (ta.readOnly || e.key !== "Tab") return;
    e.preventDefault();
    const { selectionStart, selectionEnd } = ta;
    const indent = "  ";
    const newValue = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSet) {
      nativeSet.call(ta, newValue);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = selectionStart + indent.length;
    });
  });

  ta.addEventListener("input", opts.onChange);

  function update(u: { value?: string; fontSize?: number; lineHeight?: number; isDark?: boolean; readOnly?: boolean; placeholder?: string }): void {
    if (u.value !== undefined) { value = u.value; ta.value = value; }
    if (u.fontSize !== undefined) fontSize = u.fontSize;
    if (u.lineHeight !== undefined) lineHeight = u.lineHeight;
    if (u.isDark !== undefined) isDark = u.isDark;
    if (u.readOnly !== undefined) ta.readOnly = !!u.readOnly;
    if (u.placeholder !== undefined) ta.placeholder = u.placeholder;
    updateGutter();
    applyStyles();
  }

  // initial render
  ta.value = value;
  if (opts.readOnly) ta.readOnly = true;
  if (opts.placeholder) ta.placeholder = opts.placeholder;
  updateGutter();
  applyStyles();

  return {
    el: root,
    textarea: ta,
    update,
    destroy() { ta.removeEventListener("input", opts.onChange); },
  };
}

// -------------------------
// SamplePanel (vanilla)
// -------------------------

const SAMPLE_PANEL_STYLE_ID = "am-vanilla-sample-panel";

function ensureSamplePanelStyle(): void {
  ensureStyle(SAMPLE_PANEL_STYLE_ID, `
.am-sp-root{border-top:1px solid var(--am-color-divider);flex-shrink:0;}
.am-sp-header{display:flex;align-items:center;padding:4px 8px;cursor:pointer;user-select:none;}
.am-sp-header:hover{background:var(--am-sp-hover-bg);}
.am-sp-header-text{font-size:${FS_PANEL_HEADER_FONT_SIZE};flex:1;}
.am-sp-chips{display:flex;flex-wrap:wrap;gap:4px;padding:4px 8px 8px;}
.am-sp-chip{font-size:${CHIP_FONT_SIZE};height:${FS_CHIP_HEIGHT}px;padding:0 8px;border-radius:12px;border:1px solid var(--am-color-divider);cursor:pointer;background:transparent;color:inherit;}
.am-sp-chip:hover{background:var(--am-sp-hover-bg);}
`);
}

export interface SamplePanelHandle {
  el: HTMLElement;
  destroy: () => void;
}

export function createSamplePanel(opts: {
  samples: SampleItem[];
  onInsert: (code: string) => void;
  isDark: boolean;
  t: (key: string) => string;
}): SamplePanelHandle {
  ensureSamplePanelStyle();

  const root = document.createElement("div");
  root.className = "am-sp-root";
  root.style.borderColor = getDivider(opts.isDark);
  root.style.setProperty("--am-sp-hover-bg", getActionHover(opts.isDark));

  const header = document.createElement("div");
  header.className = "am-sp-header";

  const headerText = document.createElement("span");
  headerText.className = "am-sp-header-text";
  headerText.textContent = opts.t("sampleContent");

  const arrow = document.createElement("span");
  arrow.textContent = "▾";
  arrow.style.fontSize = "14px";
  arrow.style.color = getTextSecondary(opts.isDark);

  header.appendChild(headerText);
  header.appendChild(arrow);
  root.appendChild(header);

  const chipsDiv = document.createElement("div");
  chipsDiv.className = "am-sp-chips";
  chipsDiv.style.display = "none";
  root.appendChild(chipsDiv);

  let open = false;
  header.addEventListener("click", () => {
    open = !open;
    chipsDiv.style.display = open ? "flex" : "none";
    arrow.textContent = open ? "▴" : "▾";
  });

  for (const sample of opts.samples) {
    const chip = document.createElement("button");
    chip.className = "am-sp-chip";
    chip.type = "button";
    chip.textContent = opts.t(sample.i18nKey);
    chip.addEventListener("click", () => opts.onInsert(sample.code));
    chipsDiv.appendChild(chip);
  }

  return {
    el: root,
    destroy() {},
  };
}

// -------------------------
// ZoomToolbar (vanilla)
// -------------------------

const ZOOM_TOOLBAR_STYLE_ID = "am-vanilla-zoom-toolbar";

function ensureZoomToolbarStyle(): void {
  ensureStyle(ZOOM_TOOLBAR_STYLE_ID, `
.am-zt-toolbar{display:flex;align-items:center;gap:2px;padding:2px 8px;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;}
.am-zt-label{min-width:${FS_ZOOM_LABEL_WIDTH}px;text-align:center;font-size:${SMALL_CAPTION_FONT_SIZE};color:inherit;}
.am-zt-btn{background:none;border:none;cursor:pointer;padding:2px 4px;color:inherit;border-radius:4px;display:flex;align-items:center;}
.am-zt-btn:hover{background:var(--am-color-action-hover);}
`);
}

export interface ZoomToolbarHandle {
  el: HTMLElement;
  update: (state: { zoom: number; isDirty: boolean; isDark: boolean }) => void;
  destroy: () => void;
}

export function createZoomToolbar(opts: {
  zp: ZoomPanController;
  isDark: boolean;
  t: (key: string) => string;
  onExport?: () => void;
  onExportSource?: () => void;
  exportSourceKey?: string;
}): ZoomToolbarHandle {
  ensureZoomToolbarStyle();

  const toolbar = document.createElement("div");
  toolbar.className = "am-zt-toolbar";

  // export menu button
  let menuCleanup: (() => void) | undefined;
  if (opts.onExport) {
    const exportBtn = document.createElement("button");
    exportBtn.className = "am-zt-btn";
    exportBtn.setAttribute("aria-label", opts.t("capture"));
    exportBtn.setAttribute("aria-haspopup", "true");
    exportBtn.title = opts.t("capture");
    exportBtn.textContent = "⬇";

    if (opts.onExportSource) {
      exportBtn.addEventListener("click", () => {
        const menu = createMenu({
          anchorEl: exportBtn,
          onClose: () => { menu.destroy(); menuCleanup = undefined; },
          placement: "bottom-start",
          minWidth: 180,
        });
        const item1 = createMenuItem({ children: document.createTextNode(opts.t("exportPng")) });
        item1.el.addEventListener("click", () => { menu.destroy(); opts.onExport?.(); });
        menu.el.appendChild(item1.el);
        const item2 = createMenuItem({ children: document.createTextNode(opts.t(opts.exportSourceKey ?? "exportMmd")) });
        item2.el.addEventListener("click", () => { menu.destroy(); opts.onExportSource?.(); });
        menu.el.appendChild(item2.el);
        menuCleanup = () => menu.destroy();
      });
    } else {
      exportBtn.addEventListener("click", () => opts.onExport?.());
    }
    toolbar.appendChild(exportBtn);
  }

  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.className = "am-zt-btn";
  zoomOutBtn.setAttribute("aria-label", opts.t("zoomOut"));
  zoomOutBtn.title = opts.t("zoomOut");
  zoomOutBtn.textContent = "−";
  zoomOutBtn.addEventListener("click", () => opts.zp.zoomOut());
  toolbar.appendChild(zoomOutBtn);

  const zoomInBtn = document.createElement("button");
  zoomInBtn.className = "am-zt-btn";
  zoomInBtn.setAttribute("aria-label", opts.t("zoomIn"));
  zoomInBtn.title = opts.t("zoomIn");
  zoomInBtn.textContent = "+";
  zoomInBtn.addEventListener("click", () => opts.zp.zoomIn());
  toolbar.appendChild(zoomInBtn);

  const resetBtn = document.createElement("button");
  resetBtn.className = "am-zt-btn";
  resetBtn.setAttribute("aria-label", opts.t("zoomReset"));
  resetBtn.title = opts.t("zoomReset");
  resetBtn.textContent = "⟳";
  resetBtn.style.display = "none";
  resetBtn.addEventListener("click", () => opts.zp.reset());
  toolbar.appendChild(resetBtn);

  const label = document.createElement("span");
  label.className = "am-zt-label";
  label.textContent = "100%";
  toolbar.appendChild(label);

  const unsub = opts.zp.subscribe((state) => {
    label.textContent = `${Math.round(state.zoom * 100)}%`;
    resetBtn.style.display = state.isDirty ? "" : "none";
    toolbar.style.borderColor = getDivider(opts.isDark);
  });

  return {
    el: toolbar,
    update(state) {
      label.textContent = `${Math.round(state.zoom * 100)}%`;
      resetBtn.style.display = state.isDirty ? "" : "none";
      toolbar.style.borderColor = getDivider(state.isDark);
    },
    destroy() {
      unsub();
      menuCleanup?.();
    },
  };
}

// -------------------------
// ZoomablePreview (vanilla)
// -------------------------

const ZOOM_PREVIEW_STYLE_ID = "am-vanilla-zoom-preview";

function ensureZoomPreviewStyle(): void {
  ensureStyle(ZOOM_PREVIEW_STYLE_ID, `
.am-zp-outer{flex:1;overflow:hidden;position:relative;cursor:grab;}
.am-zp-outer.panning{cursor:grabbing;}
.am-zp-inner{display:flex;justify-content:center;align-items:center;min-width:100%;min-height:100%;}
`);
}

export interface ZoomablePreviewHandle {
  el: HTMLElement;
  inner: HTMLElement;
  destroy: () => void;
}

export function createZoomablePreview(opts: {
  zp: ZoomPanController;
  isDark: boolean;
  origin?: "center" | "top-left";
  children?: HTMLElement | HTMLElement[];
}): ZoomablePreviewHandle {
  ensureZoomPreviewStyle();

  const outer = document.createElement("div");
  outer.className = "am-zp-outer";
  outer.style.backgroundColor = opts.isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;

  const inner = document.createElement("div");
  inner.className = "am-zp-inner";
  if (opts.origin === "top-left") {
    inner.style.justifyContent = "flex-start";
    inner.style.alignItems = "flex-start";
  }
  outer.appendChild(inner);

  if (opts.children) {
    const nodes = Array.isArray(opts.children) ? opts.children : [opts.children];
    for (const n of nodes) inner.appendChild(n);
  }

  function applyTransform(state: { zoom: number; pan: { x: number; y: number }; isDirty: boolean }): void {
    const DURATION_FAST = "150ms";
    inner.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    inner.style.transformOrigin = opts.origin === "top-left" ? "top left" : "center center";
  }

  const unsub = opts.zp.subscribe(applyTransform);
  applyTransform(opts.zp.getState());

  const detachEvents = opts.zp.attach(outer);

  return {
    el: outer,
    inner,
    destroy() {
      unsub();
      detachEvents();
    },
  };
}

// -------------------------
// DraggableSplitLayout (vanilla)
// -------------------------

const SPLIT_STYLE_ID = "am-vanilla-split";

function ensureSplitStyle(): void {
  ensureStyle(SPLIT_STYLE_ID, `
.am-split-container{display:flex;flex:1 1 auto;overflow:hidden;min-height:0;}
.am-split-container.row{flex-direction:row;}
.am-split-container.col{flex-direction:column;}
.am-split-left{display:flex;flex-direction:column;overflow:hidden;min-width:${FS_CODE_MIN_WIDTH}px;}
.am-split-divider{width:5px;cursor:col-resize;background:var(--am-color-divider);flex-shrink:0;}
.am-split-divider:hover,.am-split-divider:focus{background:var(--am-color-primary-main);}
.am-split-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
`);
}

export interface SplitLayoutHandle {
  el: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  destroy: () => void;
}

export function createDraggableSplitLayout(opts: {
  initialPercent?: number;
  isDark: boolean;
  t: (key: string) => string;
}): SplitLayoutHandle {
  ensureSplitStyle();

  const container = document.createElement("div");
  container.className = "am-split-container row";

  const leftPanel = document.createElement("div");
  leftPanel.className = "am-split-left";

  const divider = document.createElement("div");
  divider.className = "am-split-divider";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  divider.setAttribute("aria-label", opts.t("resizeSplitter"));
  divider.tabIndex = 0;
  divider.style.backgroundColor = getDivider(opts.isDark);

  const rightPanel = document.createElement("div");
  rightPanel.className = "am-split-right";

  container.appendChild(leftPanel);
  container.appendChild(divider);
  container.appendChild(rightPanel);

  let splitPx = FS_CODE_INITIAL_WIDTH;
  let dragging = false;

  function applySplit(): void {
    leftPanel.style.width = `${splitPx}px`;
    divider.setAttribute("aria-valuenow", String(splitPx));
  }

  // % 指定がある場合は初期 rAF で計算
  if (opts.initialPercent != null) {
    const pct = opts.initialPercent;
    requestAnimationFrame(() => {
      const w = container.getBoundingClientRect().width;
      if (w > 0) {
        splitPx = Math.round(w * pct / 100);
        applySplit();
      }
    });
  } else {
    applySplit();
  }

  divider.addEventListener("pointerdown", (e) => {
    dragging = true;
    divider.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  container.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    splitPx = Math.min(rect.width - FS_CODE_MIN_WIDTH, Math.max(FS_CODE_MIN_WIDTH, px));
    applySplit();
  });

  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };
  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", endDrag);

  divider.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      splitPx = Math.max(FS_CODE_MIN_WIDTH, splitPx - 40);
      applySplit();
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      splitPx += 40;
      applySplit();
      e.preventDefault();
    }
  });

  // mobile: 600px 未満では縦積みに切り替え
  function updateLayout(): void {
    const mobile = globalThis.innerWidth < 900;
    container.className = `am-split-container ${mobile ? "col" : "row"}`;
    leftPanel.style.width = mobile ? "" : `${splitPx}px`;
    divider.style.display = mobile ? "none" : "";
  }
  updateLayout();
  const mq = createMediaQuery("(max-width:899.95px)");
  mq.subscribe(() => updateLayout());

  return {
    el: container,
    left: leftPanel,
    right: rightPanel,
    destroy() {
      mq.destroy();
    },
  };
}

// -------------------------
// ダイアログ共通ヘッダー (vanilla)
// -------------------------

const DIALOG_HEADER_STYLE_ID = "am-vanilla-dialog-header";

function ensureDialogHeaderStyle(): void {
  ensureStyle(DIALOG_HEADER_STYLE_ID, `
.am-dh-header{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;}
.am-dh-close{background:none;border:none;cursor:pointer;padding:4px;color:inherit;border-radius:4px;font-size:18px;line-height:1;}
.am-dh-close:hover{background:var(--am-color-action-hover);}
.am-dh-label{flex:1;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.am-dh-apply-btn{padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px;border:1px solid;}
.am-dh-apply-btn.clean{border-color:var(--am-color-divider);background:transparent;color:inherit;}
.am-dh-apply-btn.dirty{border-color:var(--am-color-primary-main);background:var(--am-color-primary-main);color:#fff;}
`);
}

export interface DialogHeaderHandle {
  el: HTMLElement;
  update: (opts: { label?: string; dirty?: boolean; isDark?: boolean }) => void;
  destroy: () => void;
}

export function createDialogHeader(opts: {
  label: string;
  isDark: boolean;
  iconText?: string;
  dirty?: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onApply?: () => void;
}): DialogHeaderHandle {
  ensureDialogHeaderStyle();

  const header = document.createElement("div");
  header.className = "am-dh-header";

  const closeBtn = document.createElement("button");
  closeBtn.className = "am-dh-close";
  closeBtn.setAttribute("aria-label", opts.t("close"));
  closeBtn.title = opts.t("close");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", opts.onClose);
  header.appendChild(closeBtn);

  if (opts.iconText) {
    const icon = document.createElement("span");
    icon.textContent = opts.iconText;
    icon.style.fontSize = "16px";
    header.appendChild(icon);
  }

  const labelEl = document.createElement("span");
  labelEl.className = "am-dh-label";
  labelEl.textContent = opts.label;
  header.appendChild(labelEl);

  let applyBtn: HTMLButtonElement | null = null;
  if (opts.onApply) {
    const btn = document.createElement("button");
    btn.className = `am-dh-apply-btn ${opts.dirty ? "dirty" : "clean"}`;
    btn.textContent = `✓ ${opts.t("apply")}`;
    btn.addEventListener("click", opts.onApply);
    header.appendChild(btn);
    applyBtn = btn;
  }

  return {
    el: header,
    update(u) {
      if (u.label !== undefined) labelEl.textContent = u.label;
      if (u.dirty !== undefined && applyBtn) {
        applyBtn.className = `am-dh-apply-btn ${u.dirty ? "dirty" : "clean"}`;
      }
    },
    destroy() {},
  };
}

// -------------------------
// インラインスタイル注入ヘルパー
// -------------------------

// 実体は ui-vanilla/dom の ensureStyle（SSR ガード付き）。互換のため再 export する。
export { ensureStyle };

// -------------------------
// ハイライト (lowlight) ヘルパー
// -------------------------

export { getHljsCssVars };

export function hastToHtmlString(tree: { children: unknown[] }): string {
  // hastToHtml は CodeBlockEditDialog で使うので bare 実装
  function nodeToHtml(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    const n = node as Record<string, unknown>;
    if (n["type"] === "text") return escapeHtml(String(n["value"] ?? ""));
    if (n["type"] !== "element") return "";
    const tag = String(n["tagName"] ?? "span");
    const props = (n["properties"] ?? {}) as Record<string, unknown>;
    const classNames = Array.isArray(props["className"]) ? (props["className"] as string[]).join(" ") : "";
    const attrStr = classNames ? ` class="${escapeHtml(classNames)}"` : "";
    const children = (n["children"] ?? []) as unknown[];
    return `<${tag}${attrStr}>${children.map(nodeToHtml).join("")}</${tag}>`;
  }
  return tree.children.map(nodeToHtml).join("");
}

export { DOMPurify };
