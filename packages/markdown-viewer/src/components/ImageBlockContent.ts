import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";

import { parseAnnotations } from "../types/imageAnnotation";
import { buildAnnotationSvg } from "../utils/annotationSvg";

/**
 * image ブロックの content-only native NodeView（React 非依存）。
 *
 * framework-decoupling Phase 2「反転」設計: NodeView はドキュメント内容
 * （画像 / アノテーション表示 / リサイズハンドル / エラー表示）のみを vanilla DOM
 * で描画する。ツールバー・各種編集ダイアログはページ層 `ImageBlockOverlay` が供給する。
 *
 * リサイズは選択時のみハンドルを表示し、editor.command で width を直接コミットする
 * （self-contained。chrome 越しの cross-component drag を避ける）。ダブルクリックは
 * 既存の集中編集ダイアログ（`editor.storage.image.onEditImage`）を開く。
 */
const MIN_WIDTH = 50;

export function createImageBlockNodeView({
  node,
  editor,
  getPos,
}: Pick<NodeViewRendererProps, "node" | "editor" | "getPos">): NodeView {
  let attrs = node.attrs;

  const posOrNull = (): number | null => {
    try {
      const p = getPos?.();
      return typeof p === "number" ? p : null;
    } catch {
      return null;
    }
  };

  const dom = document.createElement("div");
  dom.className = "image-block";
  dom.setAttribute("data-image-block", "");
  dom.contentEditable = "false";
  dom.style.cssText =
    "position:relative;display:inline-block;line-height:0;max-width:100%;";

  const img = document.createElement("img");
  img.style.cssText = "max-width:100%;height:auto;display:block;";

  // エラー表示（壊れた画像）。
  const errorBox = document.createElement("div");
  errorBox.style.cssText =
    "height:2em;border-top:1px solid var(--am-color-divider);background:var(--am-color-action-hover);";

  // リサイズハンドル（選択 + 編集可能時のみ表示）。
  const handle = document.createElement("div");
  handle.setAttribute("role", "slider");
  handle.setAttribute("aria-label", "Resize image");
  handle.style.cssText =
    "position:absolute;right:0;bottom:0;width:16px;height:16px;display:none;" +
    "cursor:nwse-resize;opacity:0.7;border-top-left-radius:4px;" +
    "clip-path:polygon(100% 0,100% 100%,0 100%);background:var(--am-color-primary-main);";

  // リサイズ中の幅バッジ。
  const badge = document.createElement("div");
  badge.style.cssText =
    "position:absolute;bottom:4px;left:50%;transform:translateX(-50%);display:none;" +
    "background:rgba(0,0,0,0.7);color:#fff;padding:2px 8px;border-radius:4px;" +
    "font:12px monospace;pointer-events:none;";

  let annotationSvg: SVGSVGElement | null = null;

  const renderAnnotations = (): void => {
    annotationSvg?.remove();
    annotationSvg = buildAnnotationSvg(
      parseAnnotations((attrs.annotations as string) ?? null),
    );
    if (annotationSvg) dom.insertBefore(annotationSvg, handle);
  };

  const applyImage = (): void => {
    const src = (attrs.src as string) ?? "";
    img.src = src;
    img.alt = (attrs.alt as string) || "image";
    const title = (attrs.title as string) || "";
    if (title) img.title = title;
    else img.removeAttribute("title");
    img.style.width = (attrs.width as string) || "";
  };

  let isError = false;
  const showError = (on: boolean): void => {
    isError = on;
    if (on) {
      dom.replaceChildren(errorBox);
    } else {
      dom.replaceChildren(img, handle, badge);
      renderAnnotations();
    }
  };

  img.addEventListener("error", () => showError(true));
  applyImage();
  showError(false);

  // --- リサイズ（native pointer drag、width を editor.command で直接コミット） ---
  let resizing = false;
  let startX = 0;
  let startWidth = 0;
  let currentWidth = 0;

  const onPointerMove = (e: PointerEvent): void => {
    if (!resizing) return;
    currentWidth = Math.max(MIN_WIDTH, Math.round(startWidth + (e.clientX - startX)));
    img.style.width = `${currentWidth}px`;
    badge.textContent = `${currentWidth}px`;
  };
  const endResize = (commit: boolean): void => {
    if (!resizing) return;
    resizing = false;
    badge.style.display = "none";
    handle.removeEventListener("pointermove", onPointerMove);
    if (commit) {
      const pos = posOrNull();
      if (pos != null) {
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeAttribute(pos, "width", `${currentWidth}px`);
            return true;
          })
          .run();
      }
    }
  };
  const onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    startX = e.clientX;
    startWidth = img.getBoundingClientRect().width;
    currentWidth = Math.round(startWidth);
    resizing = true;
    badge.textContent = `${currentWidth}px`;
    badge.style.display = "block";
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // 一部環境では未アクティブな pointerId で throw する。capture 失敗は致命的でない。
    }
    handle.addEventListener("pointermove", onPointerMove);
  };
  const onPointerUp = (): void => endResize(true);
  const onPointerCancel = (): void => endResize(false);

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerCancel);

  return {
    dom,
    update(updatedNode) {
      if (updatedNode.type.name !== node.type.name) return false;
      const prev = attrs;
      attrs = updatedNode.attrs;
      if (attrs.src !== prev.src) {
        applyImage();
        if (isError) showError(false);
      } else {
        applyImage();
      }
      if (!isError && attrs.annotations !== prev.annotations) renderAnnotations();
      return true;
    },
    selectNode() {
      dom.style.outline = "2px solid var(--am-color-primary-main)";
      dom.style.outlineOffset = "1px";
      if (!isError && editor?.isEditable) handle.style.display = "block";
    },
    deselectNode() {
      dom.style.outline = "";
      dom.style.outlineOffset = "";
      handle.style.display = "none";
    },
    ignoreMutation() {
      return true;
    },
    destroy() {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerCancel);
      handle.removeEventListener("pointermove", onPointerMove);
    },
  };
}
