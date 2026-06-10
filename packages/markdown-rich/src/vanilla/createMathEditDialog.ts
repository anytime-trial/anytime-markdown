/**
 * Math 全画面編集ダイアログ (vanilla) — MathEditDialog の React 非依存移植。
 * KaTeX プレビュー・ZoomPan・サンプルパネルを素 DOM で実装。
 *
 * GraphView（関数グラフ・React 133 行）は React 依存が深く vanilla 移植は工数過大なため省略。
 * グラフ切り替えボタンは未実装（TODO コメントで明記）。
 * KaTeX CSS の自動挿入は renderKatexHtml 内の getKatex() 経由で行われる。
 */

import DOMPurify from "dompurify";
import {
  getDivider, MATH_SAMPLES, FS_PANEL_HEADER_FONT_SIZE,
} from "@anytime-markdown/markdown-viewer";
import { createDialog } from "@anytime-markdown/markdown-viewer/src/ui-vanilla/Dialog";

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
import { renderKatexHtml, MATH_SANITIZE_CONFIG } from "../hooks/useKatexRender";
import type { SampleItem } from "./dialogHelpers";

type DiagramSample = SampleItem & { enabled?: boolean };

export interface CreateMathEditDialogOptions {
  label: string;
  isDark: boolean;
  editorBg: string;
  fontSize: number;
  lineHeight: number;
  readOnly?: boolean;
  state: CodeEditState;
  t: (key: string) => string;
  onClose: () => void;
}

export interface MathEditDialogHandle {
  el: HTMLElement;
  destroy: () => void;
}

const STYLE_ID = "am-vanilla-math-dialog";

function ensureDialogStyle(): void {
  ensureStyle(STYLE_ID, `
.am-mted-code-header{display:flex;align-items:center;padding:4px 8px;border-bottom:1px solid var(--am-color-divider);flex-shrink:0;font-size:${FS_PANEL_HEADER_FONT_SIZE};}
.am-mted-right{display:flex;flex-direction:column;flex:1 1 auto;overflow:hidden;}
.am-mted-katex-box{padding:16px;font-size:16px;overflow:auto;}
.am-mted-katex-error{font-family:monospace;padding:8px;color:var(--am-color-error-main);}
`);
}

export function createMathEditDialog(opts: CreateMathEditDialogOptions): MathEditDialogHandle {
  ensureDialogStyle();

  const { state, t, isDark, fontSize, lineHeight, readOnly } = opts;

  const zp = createZoomPanState();
  let renderTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- ダイアログ ----
  const dlg = createDialog({
    onClose: opts.onClose,
    fullScreen: true,
    labelledBy: "math-edit-title",
    paperStyle: { backgroundColor: opts.editorBg },
  });

  // ---- ヘッダー ----
  const header = createDialogHeader({
    label: opts.label,
    isDark,
    iconText: "∑",
    dirty: state.isFsDirty(),
    t,
    onClose: opts.onClose,
    onApply: readOnly ? undefined : () => state.onApply(),
  });
  header.el.id = "math-edit-title";
  dlg.paper.appendChild(header.el);

  // ---- split layout ----
  const split = createDraggableSplitLayout({ isDark, t });
  dlg.paper.appendChild(split.el);
  split.el.style.flex = "1 1 auto";

  // ---- 左: コードヘッダー + Textarea + SamplePanel ----
  const codeHeader = document.createElement("div");
  codeHeader.className = "am-mted-code-header";
  codeHeader.style.borderBottomColor = getDivider(isDark);
  codeHeader.textContent = t("codeTab");
  split.left.appendChild(codeHeader);

  const lnt = createLineNumberTextarea({
    value: state.getFsCode(),
    onChange: (e) => {
      state.onFsCodeChange({ target: { value: (e.target as HTMLTextAreaElement).value } });
    },
    fontSize, lineHeight, isDark, readOnly,
  });
  lnt.el.style.flex = "1 1 auto";
  split.left.appendChild(lnt.el);

  const samples = (MATH_SAMPLES as DiagramSample[]).filter(s => s.enabled !== false);
  if (!readOnly && samples.length > 0) {
    const sp = createSamplePanel({
      samples,
      onInsert: (code) => state.onFsTextChange(code),
      isDark, t,
    });
    split.left.appendChild(sp.el);
  }

  // ---- 右: ZoomToolbar + katex preview ----
  // TODO: GraphView（関数グラフ）は React 依存が深く vanilla 移植工数過大のため未実装。
  // グラフ切り替えボタン（showGraph / hideGraph）も省略。
  // 将来的に vanilla GraphView が提供された場合に統合する。

  const rightCol = document.createElement("div");
  rightCol.className = "am-mted-right";
  split.right.appendChild(rightCol);

  const zt = createZoomToolbar({ zp, isDark, t });
  rightCol.appendChild(zt.el);

  const katexContainer = document.createElement("div");
  katexContainer.className = "am-mted-katex-box";
  katexContainer.setAttribute("role", "img");

  const zv = createZoomablePreview({ zp, isDark, children: katexContainer });
  rightCol.appendChild(zv.el);
  zv.el.style.flex = "1 1 auto";

  // ---- KaTeX レンダー（デバウンス） ----
  async function renderMath(): Promise<void> {
    const code = state.getFsCode();
    katexContainer.setAttribute("aria-label", `${t("mathFormula")}: ${code}`);

    const { html, error } = await renderKatexHtml(code);
    // エラー
    if (error) {
      katexContainer.innerHTML = `<span class="am-mted-katex-error">${error}</span>`;
      return;
    }
    if (html) {
      // MATH_SANITIZE_CONFIG の型を dompurify ビルドバリアント差で生じる型不一致を unknown 経由で迂回
      katexContainer.innerHTML = String(DOMPurify.sanitize(html, MATH_SANITIZE_CONFIG as unknown as Parameters<typeof DOMPurify.sanitize>[1]));
    } else {
      katexContainer.innerHTML = "";
    }
  }

  function scheduleRender(): void {
    if (renderTimer != null) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderTimer = null;
      void renderMath();
    }, 200);
  }

  // ---- 状態同期 ----
  state.onOpen();
  void renderMath();

  const unsub = state.subscribe(() => {
    lnt.update({ value: state.getFsCode() });
    header.update({ dirty: state.isFsDirty() });
    scheduleRender();
  });

  return {
    el: dlg.el,
    destroy() {
      if (renderTimer != null) clearTimeout(renderTimer);
      unsub();
      split.destroy();
      zv.destroy();
      zt.destroy();
      dlg.destroy();
    },
  };
}
