import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";
import { PREVIEW_MAX_HEIGHT } from "@anytime-markdown/markdown-viewer";

import { renderCodeBlockPreview } from "./codeBlockPreview";
import {
  buildEmbedBaselineLanguage,
  buildEmbedWidthLanguage,
  type EmbedMountHandle,
  getEmbedStoredWidth,
  isEmbedResizable,
  mountEmbedPreview,
} from "./embedPreviewMount";
import { type GraphMountHandle, mountGraphPreview } from "./graphPreviewMount";
import type { EmbedBaseline } from "@anytime-markdown/markdown-viewer";

/**
 * codeBlock（CodeBlockWithMermaid）の content-only native NodeView（React 非依存）。
 *
 * framework-decoupling Phase 2「反転」設計: NodeView はドキュメント内容
 * （編集可能なコードテキスト = contentDOM + language 別プレビュー + リサイズ）を
 * vanilla DOM で描画する。編集 chrome（ツールバー・全画面編集ダイアログ・
 * 削除/破棄ダイアログ・図のズーム/グラフ操作）はページ層の `CodeBlockOverlay`
 * （React）が選択中ノードに対して提供する。
 *
 * テーマ色は CSS 変数（applyEditorThemeCssVars 注入）を参照する。`codeCollapsed`
 * （折畳み）と dark/font-size（`--am-editor-dark` / `--am-code-font-size`）は
 * overlay が選択検出・設定に応じて書き込み、本 NodeView は読むだけ。
 *
 * 段階導入: S2a=骨格、S2b=string プレビュー(html/math/mermaid/plantuml)+リサイズ
 * （本コミット）、S2c=embed、S4=graph/zoom。
 */

/** ダブルクリック等の「全画面編集を開きたい」意図を overlay へ伝える DOM イベント名 */
export const CODE_BLOCK_EDIT_INTENT_EVENT = "md-codeblock-edit-intent";

/** codeBlock の language 属性からブロック種別を判定する（MermaidNodeView と同一ロジック）。 */
export type CodeBlockKind = "math" | "html" | "diagram" | "embed" | "regular";
export function classifyCodeBlock(language: unknown): CodeBlockKind {
  if (language === "math") return "math";
  if (language === "html") return "html";
  if (language === "mermaid" || language === "plantuml") return "diagram";
  if (language === "embed" || (typeof language === "string" && language.startsWith("embed "))) return "embed";
  return "regular";
}

const MIN_RESIZE_WIDTH = 50;

/** getPos を安全に取得する（detached ノードでは throw するため try/catch）。 */
function safeGetPos(getPos: (() => number | undefined) | boolean | undefined): number | null {
  if (typeof getPos !== "function") return null;
  try {
    const pos = getPos();
    return pos == null ? null : pos;
  } catch {
    return null;
  }
}

/** エディタの dark/light を CSS 変数から読む（overlay が `--am-editor-dark` を書く）。 */
function isEditorDark(): boolean {
  if (typeof document === "undefined") return false;
  return getComputedStyle(document.documentElement).getPropertyValue("--am-editor-dark").trim() === "1";
}

/** エディタのコードフォントサイズ(px)を CSS 変数から読む（既定 16）。 */
function getEditorFontSize(): number {
  if (typeof document === "undefined") return 16;
  const v = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--am-code-font-size"));
  return Number.isFinite(v) && v > 0 ? v : 16;
}

export function createCodeBlockNodeView(
  { node, editor, getPos }: Pick<NodeViewRendererProps, "node" | "editor" | "getPos">,
): NodeView {
  let currentNode = node;
  let kind = classifyCodeBlock(node.attrs.language);
  let previewCancel: () => void = () => {};
  let renderedKey = "";
  let embedMount: EmbedMountHandle | null = null;
  let graphMount: GraphMountHandle | null = null;

  // resize 状態
  let resizing = false;
  let startX = 0;
  let startWidth = 0;
  let draftWidth: number | null = null;

  // --- DOM 構築 ---
  const dom = document.createElement("div");
  dom.className = "rich-codeblock block-node-wrapper";
  dom.setAttribute("data-rich-codeblock", "");

  const frame = document.createElement("div");
  frame.className = "rich-codeblock-frame";
  frame.style.cssText = "border:1px solid transparent;border-radius:4px;overflow:hidden;margin:8px 0;";
  dom.appendChild(frame);

  const preWrap = document.createElement("div");
  const pre = document.createElement("pre");
  pre.spellcheck = false;
  pre.style.cssText =
    "margin:0;padding:12px;overflow:auto;" +
    "background:var(--am-color-code-bg);" +
    "font-size:var(--am-code-font-size,16px);line-height:var(--am-code-line-height,1.6);";
  const code = document.createElement("code");
  pre.appendChild(code);
  preWrap.appendChild(pre);
  frame.appendChild(preWrap);

  // プレビュー領域（container = previewEl, 実体 = previewInner, 右下 = resizeGrip）。
  const previewEl = document.createElement("div");
  previewEl.className = "rich-codeblock-preview";
  previewEl.contentEditable = "false";
  previewEl.style.cssText =
    "position:relative;overflow:auto;background:var(--am-color-bg-default);" +
    `max-height:${PREVIEW_MAX_HEIGHT}px;`;
  const previewInner = document.createElement("div");
  previewEl.appendChild(previewInner);

  const resizeGrip = document.createElement("div");
  resizeGrip.style.cssText =
    "position:absolute;right:2px;bottom:2px;width:12px;height:12px;cursor:nwse-resize;" +
    "border-radius:2px;background:var(--am-color-primary-main);display:none;";
  previewEl.appendChild(resizeGrip);

  const sizeBadge = document.createElement("div");
  sizeBadge.style.cssText =
    "position:absolute;right:16px;bottom:2px;padding:1px 6px;border-radius:3px;" +
    "background:rgba(0,0,0,0.7);color:#fff;font-size:0.6875rem;display:none;";
  previewEl.appendChild(sizeBadge);

  frame.appendChild(previewEl);

  // math グラフ（GraphView を createRoot でマウント）。graphEnabled 属性で表示切替。
  const graphEl = document.createElement("div");
  graphEl.className = "rich-codeblock-graph";
  graphEl.contentEditable = "false";
  graphEl.style.display = "none";
  frame.appendChild(graphEl);

  const setCodeLanguageClass = (language: unknown): void => {
    const first = typeof language === "string" && language ? language.split(/\s+/)[0] : "";
    code.className = first ? `language-${first}` : "";
  };
  setCodeLanguageClass(node.attrs.language);

  const focusBlock = (): void => {
    const pos = safeGetPos(getPos);
    if (pos == null || !editor) return;
    editor.commands.setTextSelection(pos + 1);
  };
  const onPreviewClick = (): void => { focusBlock(); };
  previewEl.addEventListener("click", onPreviewClick);

  const onDoubleClick = (e: MouseEvent): void => {
    if (kind === "regular") return;
    const pos = safeGetPos(getPos);
    if (pos == null) return;
    e.preventDefault();
    dom.dispatchEvent(new CustomEvent(CODE_BLOCK_EDIT_INTENT_EVENT, { bubbles: true, detail: { pos } }));
  };
  dom.addEventListener("dblclick", onDoubleClick);

  // --- プレビュー描画 ---
  const onBaselineWrite = (baseline: EmbedBaseline): void => {
    const pos = safeGetPos(getPos);
    if (pos == null || !editor) return;
    const nextLang = buildEmbedBaselineLanguage(String(currentNode.attrs.language ?? ""), baseline);
    editor.chain().command(({ tr }) => { tr.setNodeAttribute(pos, "language", nextLang); return true; }).run();
  };

  const disposeEmbed = (): void => {
    if (embedMount) { embedMount.destroy(); embedMount = null; }
  };

  const disposeGraph = (): void => {
    if (graphMount) { graphMount.destroy(); graphMount = null; }
  };

  // math グラフの mount/unmount を graphEnabled 属性から駆動する。
  const applyGraph = (): void => {
    if (kind === "math" && !!currentNode.attrs.graphEnabled) {
      if (!graphMount) graphMount = mountGraphPreview(graphEl);
      graphMount.render(currentNode.textContent, true, isEditorDark());
      graphEl.style.display = "";
    } else {
      disposeGraph();
      graphEl.style.display = "none";
    }
  };

  const requestRerender = (): void => { renderedKey = ""; renderPreview(); };
  function renderPreview(): void {
    if (kind === "regular") {
      disposeEmbed();
      previewInner.replaceChildren();
      return;
    }
    const lang = String(currentNode.attrs.language ?? "");
    const codeText = currentNode.textContent;
    const key = `${lang}\0${codeText}`;
    if (key === renderedKey) return;
    renderedKey = key;
    previewCancel();
    previewCancel = () => {};

    if (kind === "embed") {
      if (!embedMount) embedMount = mountEmbedPreview(previewInner);
      embedMount.render(lang, codeText, getEmbedStoredWidth(lang) ?? undefined, onBaselineWrite);
      return;
    }
    // 他種別へ切替わったら embed の React root を解放する。
    disposeEmbed();
    previewCancel = renderCodeBlockPreview(
      previewInner, lang, codeText,
      { isDark: isEditorDark(), fontSize: getEditorFontSize() },
      requestRerender,
    );
  }

  // --- 幅・折畳み・枠線の反映 ---
  const storedWidth = (): string => {
    if (kind === "embed") return getEmbedStoredWidth(String(currentNode.attrs.language ?? "")) ?? "";
    return (currentNode.attrs.width as string | null) || "";
  };
  const applyWidth = (): void => {
    const w = draftWidth != null ? `${draftWidth}px` : storedWidth();
    previewEl.style.width = w || "fit-content";
  };

  const applyChrome = (): void => {
    const collapsed = !!currentNode.attrs.codeCollapsed;
    const isPreview = kind !== "regular";
    preWrap.style.display = isPreview && collapsed ? "none" : "";
    pre.style.maxHeight = isPreview ? "200px" : "400px";
    frame.style.borderColor = collapsed ? "transparent" : "var(--am-color-divider)";
    previewEl.style.display = isPreview ? "" : "none";
    previewEl.style.borderTop = isPreview && !collapsed ? "1px solid var(--am-color-divider)" : "none";
    const resizableKind = kind === "embed" ? isEmbedResizable(String(currentNode.attrs.language ?? "")) : true;
    const canResize = isPreview && resizableKind && !collapsed && !!editor?.isEditable;
    resizeGrip.style.display = canResize ? "block" : "none";
    applyWidth();
  };

  // --- リサイズ ---
  const commitWidth = (w: number): void => {
    const pos = safeGetPos(getPos);
    if (pos == null || !editor) return;
    if (kind === "embed") {
      const nextLang = buildEmbedWidthLanguage(String(currentNode.attrs.language ?? ""), `${w}px`);
      editor.chain().command(({ tr }) => { tr.setNodeAttribute(pos, "language", nextLang); return true; }).run();
      return;
    }
    editor.chain().command(({ tr }) => { tr.setNodeAttribute(pos, "width", `${w}px`); return true; }).run();
  };
  const updateBadge = (): void => {
    if (resizing && draftWidth != null) {
      sizeBadge.textContent = `${draftWidth}px`;
      sizeBadge.style.display = "block";
    } else {
      sizeBadge.style.display = "none";
    }
  };
  const onGripPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    startX = e.clientX;
    startWidth = previewEl.getBoundingClientRect().width;
    resizing = true;
    draftWidth = Math.round(startWidth);
    try { resizeGrip.setPointerCapture(e.pointerId); } catch { /* jsdom 等で未対応 */ }
    updateBadge();
  };
  const onGripPointerMove = (e: PointerEvent): void => {
    if (!resizing) return;
    draftWidth = Math.max(MIN_RESIZE_WIDTH, Math.round(startWidth + (e.clientX - startX)));
    applyWidth();
    updateBadge();
  };
  const endResize = (commit: boolean): void => {
    if (!resizing) return;
    resizing = false;
    if (commit && draftWidth != null) commitWidth(draftWidth);
    draftWidth = null;
    applyWidth();
    updateBadge();
  };
  const onGripPointerUp = (): void => endResize(true);
  const onGripPointerCancel = (): void => endResize(false);
  resizeGrip.addEventListener("pointerdown", onGripPointerDown);
  resizeGrip.addEventListener("pointermove", onGripPointerMove);
  resizeGrip.addEventListener("pointerup", onGripPointerUp);
  resizeGrip.addEventListener("pointercancel", onGripPointerCancel);

  applyChrome();
  renderPreview();
  applyGraph();

  return {
    dom,
    contentDOM: code,
    update(updatedNode) {
      if (updatedNode.type.name !== currentNode.type.name) return false;
      const prev = currentNode;
      currentNode = updatedNode;
      if (updatedNode.attrs.language !== prev.attrs.language) {
        kind = classifyCodeBlock(updatedNode.attrs.language);
        setCodeLanguageClass(updatedNode.attrs.language);
      }
      applyChrome();
      renderPreview();
      applyGraph();
      return true;
    },
    ignoreMutation(mutation) {
      if (mutation.type === "selection") return false;
      return !code.contains(mutation.target as Node);
    },
    destroy() {
      previewCancel();
      disposeEmbed();
      disposeGraph();
      previewEl.removeEventListener("click", onPreviewClick);
      dom.removeEventListener("dblclick", onDoubleClick);
      resizeGrip.removeEventListener("pointerdown", onGripPointerDown);
      resizeGrip.removeEventListener("pointermove", onGripPointerMove);
      resizeGrip.removeEventListener("pointerup", onGripPointerUp);
      resizeGrip.removeEventListener("pointercancel", onGripPointerCancel);
    },
  };
}
