/**
 * Mermaid 全画面編集ダイアログ (vanilla) — MermaidEditDialog の React 非依存移植。
 * Code/Config タブ・リアルタイム SVG プレビュー・ZoomPan・サンプルパネルを素 DOM で実装。
 */

import {
  getDivider, MERMAID_SAMPLES,
} from "@anytime-markdown/markdown-viewer";
import { createDialog } from "@anytime-markdown/markdown-viewer/src/ui-vanilla/Dialog";
import { createTabs } from "@anytime-markdown/markdown-viewer/src/ui-vanilla/Tabs";

import { createZoomPanState } from "./zoomPanState";
import type { CodeEditState } from "./codeEditState";
import {
  createLineNumberTextarea,
  createSamplePanel,
  createZoomToolbar,
  createZoomablePreview,
  createDraggableSplitLayout,
  createDialogHeader,
  ensureStyle,
} from "./dialogHelpers";
import { requestMermaidRender } from "../hooks/useMermaidRender";
import { extractMermaidConfig, mergeMermaidConfig } from "../utils/mermaidConfig";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { captureDiagramPng, exportDiagramSource } from "./diagramCapture";
import type { SampleItem } from "./dialogHelpers";

type DiagramSample = SampleItem & { enabled?: boolean };

export interface CreateMermaidEditDialogOptions {
  label: string;
  code: string;
  svg: string | undefined;
  isDark: boolean;
  editorBg: string;
  fontSize: number;
  lineHeight: number;
  readOnly?: boolean;
  state: CodeEditState;
  t: (key: string) => string;
  onClose: () => void;
  onExport?: () => void;
  onExportSource?: () => void;
  exportSourceKey?: string;
}

export interface MermaidEditDialogHandle {
  el: HTMLElement;
  /** SVG を更新する（外部から非同期で取得した svg を反映） */
  updateSvg: (svg: string) => void;
  destroy: () => void;
}

const STYLE_ID = "am-vanilla-mermaid-dialog";

function ensureDialogStyle(): void {
  ensureStyle(STYLE_ID, `
.am-med-svg img,.am-med-svg svg{max-width:100%;height:auto;}
.am-med-tabs-row{display:flex;align-items:center;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;}
`);
}

export function createMermaidEditDialog(opts: CreateMermaidEditDialogOptions): MermaidEditDialogHandle {
  ensureDialogStyle();

  const { state, t, isDark, fontSize, lineHeight, readOnly } = opts;

  const zp = createZoomPanState();
  let currentSvg = opts.svg ?? "";
  let cancelRender: (() => void) | null = null;
  let activeTab: "code" | "config" = "code";

  // extract config/body from initial code
  const { config: initConfig, body: initBody } = extractMermaidConfig(state.getFsCode());
  let configText = initConfig;
  let bodyText = initBody;

  // ---- ダイアログ ----
  const dlg = createDialog({
    onClose: opts.onClose,
    fullScreen: true,
    labelledBy: "mermaid-edit-title",
    paperStyle: { backgroundColor: opts.editorBg },
  });

  // ---- ヘッダー ----
  const header = createDialogHeader({
    label: opts.label,
    isDark,
    iconText: "⬡",
    dirty: state.isFsDirty(),
    t,
    onClose: opts.onClose,
    onApply: readOnly ? undefined : () => state.onApply(),
  });
  header.el.id = "mermaid-edit-title";
  dlg.paper.appendChild(header.el);

  // ---- split layout ----
  const split = createDraggableSplitLayout({ isDark, t });
  dlg.paper.appendChild(split.el);
  split.el.style.flex = "1 1 auto";

  // ---- 左: Tabs + Textarea + SamplePanel ----
  const tabsRow = document.createElement("div");
  tabsRow.className = "am-med-tabs-row";
  tabsRow.style.borderBottomColor = getDivider(isDark);
  split.left.appendChild(tabsRow);

  const tabs = createTabs({
    value: "code",
    tabs: [
      { value: "code", label: t("codeTab") },
      { value: "config", label: t("configTab") },
    ],
    onChange: (val) => {
      activeTab = val as "code" | "config";
      lntCode.el.style.display = val === "code" ? "flex" : "none";
      lntConfig.el.style.display = val === "config" ? "flex" : "none";
    },
  });
  tabsRow.appendChild(tabs.el);
  tabsRow.style.flex = "1 1 auto";

  const lntCode = createLineNumberTextarea({
    value: bodyText,
    onChange: (e) => {
      const newBody = (e.target as HTMLTextAreaElement).value;
      bodyText = newBody;
      const merged = mergeMermaidConfig(configText, newBody);
      state.onFsTextChange(merged);
    },
    fontSize, lineHeight, isDark, readOnly,
  });
  lntCode.el.style.flex = "1 1 auto";
  split.left.appendChild(lntCode.el);

  const lntConfig = createLineNumberTextarea({
    value: configText,
    onChange: (e) => {
      const newConfig = (e.target as HTMLTextAreaElement).value;
      configText = newConfig;
      const merged = mergeMermaidConfig(newConfig, bodyText);
      state.onFsTextChange(merged);
    },
    fontSize, lineHeight, isDark, readOnly,
    placeholder: '{\n  "theme": "forest"\n}',
  });
  lntConfig.el.style.flex = "1 1 auto";
  lntConfig.el.style.display = "none";
  split.left.appendChild(lntConfig.el);

  const samples = (MERMAID_SAMPLES as DiagramSample[]).filter(s => s.enabled !== false);
  if (!readOnly && samples.length > 0) {
    const sp = createSamplePanel({
      samples,
      onInsert: (code) => {
        bodyText = code;
        lntCode.update({ value: code });
        const merged = mergeMermaidConfig(configText, code);
        state.onFsTextChange(merged);
        // Switch to code tab
        activeTab = "code";
        tabs.update({ value: "code" });
        lntCode.el.style.display = "flex";
        lntConfig.el.style.display = "none";
      },
      isDark, t,
    });
    split.left.appendChild(sp.el);
  }

  // ---- 右: ZoomToolbar + ZoomablePreview + SVG ----
  const svgContainer = document.createElement("div");
  svgContainer.className = "am-med-svg";
  svgContainer.setAttribute("role", "img");
  svgContainer.setAttribute("aria-label", extractDiagramAltText(opts.code, "mermaid"));

  const zv = createZoomablePreview({ zp, isDark, children: svgContainer });

  let handleExport: (() => void) | undefined;
  let handleExportSource: (() => void) | undefined;
  if (opts.onExport) {
    handleExport = () => {
      void captureDiagramPng({ isMermaid: true, isPlantUml: false, svg: currentSvg, plantUmlUrl: undefined, code: opts.code, isDark });
    };
  }
  if (opts.onExportSource) {
    handleExportSource = () => {
      void exportDiagramSource(state.getFsCode(), true);
    };
  }

  const zt = createZoomToolbar({ zp, isDark, t, onExport: handleExport, onExportSource: handleExportSource, exportSourceKey: opts.exportSourceKey });
  split.right.appendChild(zt.el);
  split.right.appendChild(zv.el);
  zv.el.style.flex = "1 1 auto";

  // ---- SVG 更新 ----
  function updateSvgDisplay(svg: string): void {
    currentSvg = svg;
    if (svg) {
      // スケール調整 (settings.fontSize / 16 相当は省略: vanilla では固定 16px 基準)
      svgContainer.innerHTML = svg;
    } else {
      svgContainer.innerHTML = "";
    }
  }

  // ---- mermaid レンダー購読 ----
  function scheduleRender(): void {
    cancelRender?.();
    cancelRender = requestMermaidRender(state.getFsCode(), isDark, (svg, err) => {
      if (!err) updateSvgDisplay(svg);
    });
  }

  if (opts.svg) {
    updateSvgDisplay(opts.svg);
  } else {
    scheduleRender();
  }

  // ---- 状態同期 ----
  state.onOpen();
  const unsub = state.subscribe(() => {
    header.update({ dirty: state.isFsDirty() });
    scheduleRender();
  });

  return {
    el: dlg.el,
    updateSvg(svg) { updateSvgDisplay(svg); },
    destroy() {
      cancelRender?.();
      unsub();
      split.destroy();
      tabs.destroy();
      zv.destroy();
      zt.destroy();
      dlg.destroy();
    },
  };
}
