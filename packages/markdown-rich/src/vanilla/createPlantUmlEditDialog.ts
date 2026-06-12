/**
 * PlantUML 全画面編集ダイアログ (vanilla) — PlantUmlEditDialog の React 非依存移植。
 * Code/Config タブ・同意フロー・img プレビュー・ZoomPan を素 DOM で実装。
 */

import {
  getDivider, PLANTUML_SAMPLES,
  PLANTUML_CONSENT_KEY,
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
import { buildPlantUmlImageUrl } from "../hooks/usePlantUmlRender";
import { getPlantUmlConsent } from "../hooks/usePlantUmlRender";
import { extractPlantUmlConfig, mergePlantUmlConfig } from "../utils/plantumlConfig";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { captureDiagramPng, exportDiagramSource } from "./diagramCapture";
import type { SampleItem } from "./dialogHelpers";

type DiagramSample = SampleItem & { enabled?: boolean };

export interface CreatePlantUmlEditDialogOptions {
  label: string;
  code: string;
  plantUmlUrl: string | undefined;
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

export interface PlantUmlEditDialogHandle {
  el: HTMLElement;
  updateUrl: (url: string) => void;
  destroy: () => void;
}

const STYLE_ID = "am-vanilla-plantuml-dialog";

function ensureDialogStyle(): void {
  ensureStyle(STYLE_ID, `
.am-pued-tabs-row{display:flex;align-items:center;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;}
.am-pued-preview-img{max-width:100%;height:auto;display:block;}
.am-pued-consent{padding:24px;display:flex;flex-direction:column;gap:12px;align-items:flex-start;}
.am-pued-consent-text{font-size:14px;}
.am-pued-consent-btn{padding:6px 16px;border-radius:4px;cursor:pointer;border:1px solid var(--am-color-primary-main);background:var(--am-color-primary-main);color:#fff;font-size:13px;}
.am-pued-consent-btn.reject{background:transparent;color:inherit;border-color:var(--am-color-divider);}
`);
}

function buildConsentPanel(t: (key: string) => string, onAccept: () => void, onReject: () => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "am-pued-consent";

  const text = document.createElement("p");
  text.className = "am-pued-consent-text";
  text.textContent = t("plantUmlConsent");
  panel.appendChild(text);

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;";

  const acceptBtn = document.createElement("button");
  acceptBtn.className = "am-pued-consent-btn";
  acceptBtn.textContent = t("accept");
  acceptBtn.addEventListener("click", onAccept);

  const rejectBtn = document.createElement("button");
  rejectBtn.className = "am-pued-consent-btn reject";
  rejectBtn.textContent = t("reject");
  rejectBtn.addEventListener("click", onReject);

  row.appendChild(acceptBtn);
  row.appendChild(rejectBtn);
  panel.appendChild(row);

  return panel;
}

export function createPlantUmlEditDialog(opts: CreatePlantUmlEditDialogOptions): PlantUmlEditDialogHandle {
  ensureDialogStyle();

  const { state, t, isDark, fontSize, lineHeight, readOnly } = opts;

  const zp = createZoomPanState();
  let activeTab: "code" | "config" = "code";

  const { config: initConfig, body: initBody } = extractPlantUmlConfig(state.getFsCode());
  let configText = initConfig;
  let bodyText = initBody;

  // ---- ダイアログ ----
  const dlg = createDialog({
    onClose: opts.onClose,
    fullScreen: true,
    labelledBy: "plantuml-edit-title",
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
  header.el.id = "plantuml-edit-title";
  dlg.paper.appendChild(header.el);

  // ---- split layout ----
  const split = createDraggableSplitLayout({ isDark, t });
  dlg.paper.appendChild(split.el);
  split.el.style.flex = "1 1 auto";

  // ---- 左: Tabs + Textarea + SamplePanel ----
  const tabsRow = document.createElement("div");
  tabsRow.className = "am-pued-tabs-row";
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

  const lntCode = createLineNumberTextarea({
    value: bodyText,
    onChange: (e) => {
      const newBody = (e.target as HTMLTextAreaElement).value;
      bodyText = newBody;
      state.onFsTextChange(mergePlantUmlConfig(configText, newBody));
      refreshPreview();
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
      state.onFsTextChange(mergePlantUmlConfig(newConfig, bodyText));
      refreshPreview();
    },
    fontSize, lineHeight, isDark, readOnly,
    placeholder: "skinparam backgroundColor #FEFECE\nskinparam handwritten true\n!theme cerulean",
  });
  lntConfig.el.style.flex = "1 1 auto";
  lntConfig.el.style.display = "none";
  split.left.appendChild(lntConfig.el);

  const samples = (PLANTUML_SAMPLES as DiagramSample[]).filter(s => s.enabled !== false);
  if (!readOnly && samples.length > 0) {
    const sp = createSamplePanel({
      samples,
      onInsert: (code) => {
        bodyText = code;
        lntCode.update({ value: code });
        state.onFsTextChange(mergePlantUmlConfig(configText, code));
        activeTab = "code";
        tabs.update({ value: "code" });
        lntCode.el.style.display = "flex";
        lntConfig.el.style.display = "none";
        refreshPreview();
      },
      isDark, t,
    });
    split.left.appendChild(sp.el);
  }

  // ---- 右: 同意フロー OR ZoomToolbar + img ----
  let consent = getPlantUmlConsent();
  const rightContent = document.createElement("div");
  rightContent.style.cssText = "display:flex;flex-direction:column;flex:1 1 auto;overflow:hidden;";
  split.right.appendChild(rightContent);

  let imgEl: HTMLImageElement | null = null;
  let zvHandle: ReturnType<typeof createZoomablePreview> | null = null;
  let ztHandle: ReturnType<typeof createZoomToolbar> | null = null;

  function buildPreviewPane(): void {
    rightContent.innerHTML = "";

    let handleExport: (() => void) | undefined;
    let handleExportSource: (() => void) | undefined;
    if (opts.onExport) {
      handleExport = () => {
        const url = buildPlantUmlImageUrl(state.getFsCode(), isDark);
        void captureDiagramPng({ isMermaid: false, isPlantUml: true, svg: undefined, plantUmlUrl: url, code: state.getFsCode(), isDark });
      };
    }
    if (opts.onExportSource) {
      handleExportSource = () => { void exportDiagramSource(state.getFsCode(), false); };
    }

    ztHandle = createZoomToolbar({ zp, isDark, t, onExport: handleExport, onExportSource: handleExportSource, exportSourceKey: opts.exportSourceKey });
    rightContent.appendChild(ztHandle.el);

    imgEl = document.createElement("img");
    imgEl.className = "am-pued-preview-img";
    imgEl.referrerPolicy = "no-referrer";
    imgEl.alt = extractDiagramAltText(opts.code, "plantuml");
    imgEl.style.transform = `scale(${fontSize / 16})`;

    zvHandle = createZoomablePreview({ zp, isDark, children: imgEl });
    rightContent.appendChild(zvHandle.el);
    zvHandle.el.style.flex = "1 1 auto";

    refreshPreview();
  }

  function buildConsentPane(): void {
    rightContent.innerHTML = "";
    const panel = buildConsentPanel(
      t,
      () => {
        sessionStorage.setItem(PLANTUML_CONSENT_KEY, "accepted");
        consent = "accepted";
        buildPreviewPane();
      },
      () => {
        sessionStorage.setItem(PLANTUML_CONSENT_KEY, "rejected");
        consent = "rejected";
        rightContent.innerHTML = "";
      },
    );
    rightContent.appendChild(panel);
  }

  function refreshPreview(): void {
    if (!imgEl) return;
    const url = buildPlantUmlImageUrl(state.getFsCode(), isDark);
    if (url) imgEl.src = url;
  }

  if (consent === "accepted") {
    buildPreviewPane();
  } else if (consent === "pending") {
    buildConsentPane();
  }
  // rejected: right は空のまま

  // ---- 状態同期 ----
  state.onOpen();
  const unsub = state.subscribe(() => {
    header.update({ dirty: state.isFsDirty() });
  });

  return {
    el: dlg.el,
    updateUrl(url) {
      if (imgEl && url) imgEl.src = url;
    },
    destroy() {
      unsub();
      split.destroy();
      tabs.destroy();
      zvHandle?.destroy();
      ztHandle?.destroy();
      dlg.destroy();
    },
  };
}
