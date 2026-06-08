import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";

/**
 * gifBlock の content-only native NodeView（React 非依存）。
 *
 * framework-decoupling Phase 2「反転」設計: NodeView はドキュメント内容
 * （GIF 画像 / プレースホルダ / 再生切替）のみを vanilla DOM で描画する。
 * 編集 chrome（ツールバー・録画/再生/削除ダイアログ）はページ層の
 * `GifBlockOverlay`（React）が選択中ノードに対して提供する。
 *
 * テーマ色は CSS 変数（applyEditorThemeCssVars 注入）を参照し、ダーク/ライトは
 * ホスト側の変数切替で追従する。
 */

/** placeholder クリック等の「録画を開きたい」意図をオーバーレイへ伝える DOM イベント名 */
export const GIF_RECORD_INTENT_EVENT = "md-gif-record-intent";

/** GIF を一時停止（現在フレームを canvas へ焼いて img.src を差し替え）/ 再開する */
function togglePlayback(
  img: HTMLImageElement,
  src: string,
  playing: boolean,
  pausedSrcRef: { current: string | null },
): boolean {
  if (!src) return playing;
  if (playing) {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return playing; // canvas 不可: 一時停止できないので状態は変えない
    ctx.drawImage(img, 0, 0);
    pausedSrcRef.current = canvas.toDataURL("image/png");
    img.src = pausedSrcRef.current;
    return false;
  }
  img.src = src.startsWith("blob:")
    ? src
    : src + (src.includes("?") ? "&" : "?") + "_t=" + Date.now();
  pausedSrcRef.current = null;
  return true;
}

/**
 * gifBlock の native NodeView ファクトリ。`addNodeView` の戻り値として使う。
 */
export function createGifBlockNodeView({
  node,
  editor,
  getPos,
}: Pick<NodeViewRendererProps, "node" | "editor" | "getPos">): NodeView {
  let attrs = node.attrs;
  let playing = true;
  let mode: "src" | "placeholder" | null = null;
  const pausedSrcRef: { current: string | null } = { current: null };

  const dom = document.createElement("div");
  dom.className = "gif-block";
  dom.setAttribute("data-gif-block", "");
  dom.contentEditable = "false";
  dom.style.position = "relative";
  dom.style.lineHeight = "0";
  dom.style.borderRadius = "4px";
  dom.style.overflow = "hidden";
  dom.style.marginTop = "8px";
  dom.style.marginBottom = "8px";

  // --- 再生切替ボタン（選択時のみ表示） ---
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-label", "Pause");
  toggleBtn.style.cssText =
    "position:absolute;bottom:8px;right:8px;display:none;border:none;cursor:pointer;" +
    "background:rgba(0,0,0,0.6);color:#fff;border-radius:4px;padding:2px 6px;font-size:14px;line-height:1;";
  toggleBtn.textContent = "⏸";

  const img = document.createElement("img");
  img.style.cssText =
    "max-width:100%;height:auto;display:block;";

  const placeholder = document.createElement("div");
  placeholder.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "padding:32px 0;cursor:pointer;background:rgba(127,127,127,0.05);" +
    "border-top:1px solid var(--am-color-divider);color:var(--am-color-text-secondary);font-size:0.75rem;";
  placeholder.textContent = "Click to record GIF";

  const onToggle = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    playing = togglePlayback(img, (attrs.src as string) ?? "", playing, pausedSrcRef);
    toggleBtn.textContent = playing ? "⏸" : "▶";
    toggleBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  };

  const onPlaceholderClick = (): void => {
    if (!editor?.isEditable) return;
    let pos: number | null | undefined;
    try {
      pos = getPos?.();
    } catch {
      return;
    }
    if (pos == null) return;
    dom.dispatchEvent(
      new CustomEvent(GIF_RECORD_INTENT_EVENT, { bubbles: true, detail: { pos } }),
    );
  };

  toggleBtn.addEventListener("click", onToggle);
  placeholder.addEventListener("click", onPlaceholderClick);

  const renderContent = (): void => {
    const src = (attrs.src as string) ?? "";
    if (src) {
      img.src = src;
      img.alt = (attrs.alt as string) || "GIF";
      img.style.width = (attrs.width as string) || "";
      if (mode !== "src") {
        dom.replaceChildren(img, toggleBtn);
        mode = "src";
      }
    } else if (mode !== "placeholder") {
      dom.replaceChildren(placeholder);
      mode = "placeholder";
    }
  };
  renderContent();

  return {
    dom,
    update(updatedNode) {
      if (updatedNode.type.name !== "gifBlock") return false;
      attrs = updatedNode.attrs;
      renderContent();
      return true;
    },
    selectNode() {
      dom.style.outline = "2px solid var(--am-color-primary-main)";
      dom.style.outlineOffset = "1px";
      if (attrs.src) toggleBtn.style.display = "block";
    },
    deselectNode() {
      dom.style.outline = "";
      dom.style.outlineOffset = "";
      toggleBtn.style.display = "none";
    },
    ignoreMutation() {
      // 内容は属性駆動で更新するため、内部 DOM 変化は ProseMirror に無視させる
      return true;
    },
    destroy() {
      toggleBtn.removeEventListener("click", onToggle);
      placeholder.removeEventListener("click", onPlaceholderClick);
    },
  };
}
