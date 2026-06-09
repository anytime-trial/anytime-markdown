import type { Editor } from "@anytime-markdown/markdown-core";

import { GIF_RECORD_INTENT_EVENT } from "../components/GifBlockContent";
import { createBlockChromeAnchor, createSelectedBlockTracker } from "./blockChrome";

/**
 * gifBlock の編集 chrome を **React なし**で提供する vanilla コントローラ
 * （framework-decoupling Phase 3 / ホスト隔離ゴールの E-first 参照実装）。
 *
 * 選択追従・配置・インラインツールバー（drag-handle / label / edit / delete）を
 * 素 DOM で構成し、編集操作は intent コールバックで host へ委譲する。録画 / 再生 /
 * 削除の各ダイアログ（React・重量 UI）は host（{@link GifDialogHost}）が intent を
 * 受けて表示する。これにより editor + chrome は React-free、React は host へ隔離される。
 *
 * テーマ色は CSS 変数（applyEditorThemeCssVars 注入）で追従するため `useIsDark` 等の
 * React テーマ API に依存しない。
 */

/** 指定 pos のブロック属性を更新する（React useSelectedBlock.updateAttrs の vanilla 版）。 */
export function setBlockAttrs(
  editor: Editor,
  pos: number,
  attrs: Record<string, unknown>,
): void {
  if (pos < 0) return;
  editor
    .chain()
    .command(({ tr }) => {
      for (const [k, v] of Object.entries(attrs)) {
        tr.setNodeAttribute(pos, k, v);
      }
      return true;
    })
    .run();
}

/** 指定 pos のブロックを削除する（React useSelectedBlock.deleteBlock の vanilla 版）。 */
export function deleteBlockAt(editor: Editor, pos: number): void {
  if (pos < 0) return;
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const n = state.doc.nodeAt(pos);
      if (!n) return false;
      tr.delete(pos, pos + n.nodeSize);
      return true;
    })
    .run();
}

/** Material アイコン SVG（24x24・ui/icons と同一 path）を currentColor で描く。 */
function svgIcon(path: string, size: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", path);
  svg.appendChild(p);
  return svg;
}

const DRAG_PATH =
  "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2m-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2";
const EDIT_PATH =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z";
const DELETE_PATH =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM8 9h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z";

function mkIconButton(label: string, iconPath: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;padding:2px;" +
    "border:none;background:transparent;cursor:pointer;border-radius:4px;" +
    "color:var(--am-color-text-secondary);";
  b.appendChild(svgIcon(iconPath, 16));
  b.addEventListener("click", onClick);
  return b;
}

export interface GifBlockChromeCallbacks {
  /** i18n（aria-label 用）。 */
  t: (key: string) => string;
  /** 編集 intent。`src` 有無で host が再生 / 録画を出し分ける。 */
  onEdit: (pos: number, ctx: { src: string; settings: string | null }) => void;
  /** 削除 intent（host が確認ダイアログを表示）。 */
  onDelete: (pos: number) => void;
  /** 録画 intent（placeholder クリック / autoEditOpen / src 無し編集）。 */
  onRecord: (pos: number) => void;
}

/**
 * gifBlock の vanilla chrome を生成する。戻り値は破棄関数。
 */
export function createGifBlockChrome(
  editor: Editor,
  cb: GifBlockChromeCallbacks,
): () => void {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;

  // --- インラインツールバー（素 DOM） ---
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-block-toolbar", "");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "GIF");
  toolbar.style.cssText =
    "background-color:var(--am-color-action-hover);padding:2px 6px;" +
    "display:flex;align-items:center;gap:2px;border-radius:4px;";
  // ツールバー操作で editor の NodeSelection を失わないよう mousedown を抑止する。
  toolbar.addEventListener("mousedown", (e) => e.preventDefault());

  const dragHandle = document.createElement("div");
  dragHandle.setAttribute("data-drag-handle", "");
  dragHandle.setAttribute("role", "button");
  dragHandle.tabIndex = 0;
  dragHandle.setAttribute("aria-roledescription", "draggable item");
  dragHandle.setAttribute("aria-label", cb.t("dragHandle"));
  dragHandle.style.cssText =
    "display:inline-flex;align-items:center;cursor:grab;color:var(--am-color-text-secondary);";
  dragHandle.appendChild(svgIcon(DRAG_PATH, 16));

  const labelEl = document.createElement("span");
  labelEl.textContent = "GIF";
  labelEl.style.cssText =
    "font-weight:600;font-size:0.75rem;flex-shrink:0;color:var(--am-color-text-secondary);";

  const editBtn = mkIconButton(cb.t("edit"), EDIT_PATH, () => {
    if (currentPos < 0) return;
    const node = editor.state.doc.nodeAt(currentPos);
    const src = (node?.attrs.src as string) ?? "";
    const settings = (node?.attrs.gifSettings as string) ?? null;
    cb.onEdit(currentPos, { src, settings });
  });

  const spacer = document.createElement("div");
  spacer.style.flex = "1";

  const deleteBtn = mkIconButton(cb.t("delete"), DELETE_PATH, () => {
    if (currentPos >= 0) cb.onDelete(currentPos);
  });

  toolbar.append(dragHandle, labelEl, editBtn, spacer, deleteBtn);
  anchor.el.appendChild(toolbar);

  // --- placeholder クリック（native NodeView 発火）→ 録画 intent ---
  const root = editor.view?.dom;
  const onRecordIntent = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { pos?: number } | undefined;
    const pos = typeof detail?.pos === "number" ? detail.pos : currentPos;
    if (pos >= 0) cb.onRecord(pos);
  };
  root?.addEventListener(GIF_RECORD_INTENT_EVENT, onRecordIntent as EventListener);

  // --- 選択追従（vanilla tracker） ---
  const stop = createSelectedBlockTracker(editor, "gifBlock", ({ pos, node, rect }) => {
    currentPos = pos;
    anchor.setRect(editor.isEditable && pos >= 0 ? rect : null);
    // autoEditOpen: スラッシュコマンド作成直後に録画を開く（属性は即クリア）。
    if (pos >= 0 && node?.attrs?.autoEditOpen && editor.isEditable) {
      setBlockAttrs(editor, pos, { autoEditOpen: false });
      cb.onRecord(pos);
    }
  });

  return () => {
    stop();
    root?.removeEventListener(GIF_RECORD_INTENT_EVENT, onRecordIntent as EventListener);
    anchor.destroy();
  };
}
