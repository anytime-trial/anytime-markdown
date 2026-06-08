import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";

/**
 * codeBlock（CodeBlockWithMermaid）の content-only native NodeView（React 非依存）。
 *
 * framework-decoupling Phase 2「反転」設計: NodeView はドキュメント内容
 * （編集可能なコードテキスト = contentDOM + language 別プレビュー）のみを
 * vanilla DOM で描画する。編集 chrome（ツールバー・全画面編集ダイアログ・
 * 削除/破棄ダイアログ・図のズーム/グラフ操作）はページ層の `CodeBlockOverlay`
 * （React）が選択中ノードに対して提供する。
 *
 * テーマ色は CSS 変数（applyEditorThemeCssVars 注入）を参照し、ダーク/ライトは
 * ホスト側の変数切替で追従する。`codeCollapsed`（折畳み）は overlay が選択検出に
 * 応じて node 属性へ書き込み、本 NodeView は属性を読むだけ。
 *
 * 本ファイルは段階導入: S2a=骨格 + contentDOM + 折畳み + regular code、
 * S2b=string プレビュー（html/math/mermaid/plantuml）+ リサイズ、S2c=embed。
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

export function createCodeBlockNodeView(
  { node, editor, getPos }: Pick<NodeViewRendererProps, "node" | "editor" | "getPos">,
): NodeView {
  let currentNode = node;
  let kind = classifyCodeBlock(node.attrs.language);

  // --- DOM 構築 ---
  const dom = document.createElement("div");
  dom.className = "rich-codeblock block-node-wrapper";
  dom.setAttribute("data-rich-codeblock", "");

  const frame = document.createElement("div");
  frame.className = "rich-codeblock-frame";
  frame.style.cssText =
    "border:1px solid transparent;border-radius:4px;overflow:hidden;margin:8px 0;";
  dom.appendChild(frame);

  // コード表示エリア（contentDOM を内包）。折畳み対象。
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

  // プレビュー領域（S2b 以降で language 別に描画）。regular は空。
  const previewEl = document.createElement("div");
  previewEl.className = "rich-codeblock-preview";
  previewEl.contentEditable = "false";
  frame.appendChild(previewEl);

  const setCodeLanguageClass = (language: unknown): void => {
    const first = typeof language === "string" && language ? language.split(/\s+/)[0] : "";
    code.className = first ? `language-${first}` : "";
  };
  setCodeLanguageClass(node.attrs.language);

  // クリックでコードへ選択を移し overlay に選択を認識させる（プレビュークリック時）。
  const focusBlock = (): void => {
    const pos = safeGetPos(getPos);
    if (pos == null || !editor) return;
    editor.commands.setTextSelection(pos + 1);
  };
  const onPreviewClick = (): void => { focusBlock(); };
  previewEl.addEventListener("click", onPreviewClick);

  // ダブルクリックで全画面編集の意図を overlay へ通知。
  const onDoubleClick = (e: MouseEvent): void => {
    if (kind === "regular") return; // regular はプレビューが無く dblclick 編集の対象外
    const pos = safeGetPos(getPos);
    if (pos == null) return;
    e.preventDefault();
    dom.dispatchEvent(new CustomEvent(CODE_BLOCK_EDIT_INTENT_EVENT, { bubbles: true, detail: { pos } }));
  };
  dom.addEventListener("dblclick", onDoubleClick);

  /** 折畳み・枠線・プレビュー表示を属性から反映する。 */
  const applyChrome = (n = currentNode): void => {
    const collapsed = !!n.attrs.codeCollapsed;
    const isPreview = kind !== "regular";
    // preview ブロックは collapsed のときコードを隠す。regular は常時表示。
    const hideCode = isPreview && collapsed;
    preWrap.style.display = hideCode ? "none" : "";
    pre.style.maxHeight = isPreview ? "200px" : "400px";
    // 枠線は「展開中（= 選択中）」に表示。overlay が選択検出で codeCollapsed を切替える。
    frame.style.borderColor = collapsed ? "transparent" : "var(--am-color-divider)";
    previewEl.style.display = isPreview ? "" : "none";
  };
  applyChrome();

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
      applyChrome(updatedNode);
      return true;
    },
    ignoreMutation(mutation) {
      // contentDOM（コードテキスト）内の変化は ProseMirror に処理させる。
      // それ以外（プレビュー領域などの命令的更新）は無視させる。
      if (mutation.type === "selection") return false;
      return !code.contains(mutation.target as Node);
    },
    destroy() {
      previewEl.removeEventListener("click", onPreviewClick);
      dom.removeEventListener("dblclick", onDoubleClick);
    },
  };
}
