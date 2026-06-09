import type { Editor } from "@anytime-markdown/markdown-core";

import { moveTableColumn, moveTableRow } from "../utils/tableHelpers";
import { createBlockChromeAnchor, createSelectedBlockTracker } from "./blockChrome";
import {
  ICON,
  createToolbarContainer,
  mkDragHandle,
  mkIconButton,
  mkLabel,
  mkSpacer,
  svgIcon,
} from "./vanillaToolbar";

/**
 * table ブロックの編集 chrome を **React なし**で提供する vanilla コントローラ
 * （Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・配置・操作ツールバー（列/行の追加削除・整列・移動）を素 DOM で構成し、
 * 列/行操作は editor コマンドへ直接発火する。スプレッドシート編集ダイアログ
 * （SpreadsheetGrid・React）と削除確認は host（{@link TableDialogHost}）が intent を
 * 受けて表示する。スプレッドシート編集中はツールバーを抑制する（`setEditing(true)`）。
 */

/** 操作ボタン（任意でバッジ・回転）。色は currentColor（text-secondary）。 */
function opButton(
  label: string,
  iconPath: string,
  onClick: () => void,
  opts: { badge?: string; badgeError?: boolean; rotate?: number } = {},
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;padding:3px;" +
    "border:none;background:transparent;cursor:pointer;color:var(--am-color-text-secondary);";
  const wrap = document.createElement("span");
  wrap.style.cssText = "position:relative;display:inline-flex;line-height:0;";
  const icon = svgIcon(iconPath);
  if (opts.rotate) icon.style.transform = `rotate(${opts.rotate}deg)`;
  wrap.appendChild(icon);
  if (opts.badge) {
    const badge = document.createElement("span");
    badge.textContent = opts.badge;
    badge.style.cssText =
      "position:absolute;top:-4px;right:-4px;font-size:9px;font-weight:700;line-height:1;" +
      (opts.badgeError ? "color:var(--am-color-error-main);" : "color:var(--am-color-text-secondary);");
    wrap.appendChild(badge);
  }
  b.appendChild(wrap);
  b.addEventListener("click", onClick);
  return b;
}

/** ToggleButtonGroup 相当のグルーピング枠。 */
function mkGroup(...buttons: HTMLElement[]): HTMLElement {
  const g = document.createElement("div");
  g.style.cssText =
    "display:inline-flex;align-items:center;border:1px solid var(--am-color-divider);" +
    "border-radius:4px;overflow:hidden;";
  g.append(...buttons);
  return g;
}

/** 列/行操作・整列・移動の vanilla ops ツールバー（旧 React TableOperationsToolbar 等価）。 */
function buildOpsToolbar(editor: Editor, t: (k: string) => string): HTMLElement {
  const ops = document.createElement("div");
  ops.style.cssText = "display:inline-flex;align-items:center;gap:4px;";

  const cols = mkGroup(
    opButton(t("addColumn"), ICON.viewColumn, () => editor.chain().focus().addColumnAfter().run(), { badge: "+" }),
    opButton(t("removeColumn"), ICON.viewColumn, () => editor.chain().focus().deleteColumn().run(), { badge: "x", badgeError: true }),
  );
  const rows = mkGroup(
    opButton(t("addRow"), ICON.tableRows, () => editor.chain().focus().addRowAfter().run(), { badge: "+" }),
    opButton(t("removeRow"), ICON.tableRows, () => editor.chain().focus().deleteRow().run(), { badge: "x", badgeError: true }),
  );
  const align = mkGroup(
    opButton(t("alignLeft"), ICON.alignLeft, () => editor.chain().focus().setCellAttribute("textAlign", "left").run()),
    opButton(t("alignCenter"), ICON.alignCenter, () => editor.chain().focus().setCellAttribute("textAlign", "center").run()),
    opButton(t("alignRight"), ICON.alignRight, () => editor.chain().focus().setCellAttribute("textAlign", "right").run()),
  );
  const moveRow = mkGroup(
    opButton(t("moveRowUp"), ICON.moveUp, () => moveTableRow(editor, "up")),
    opButton(t("moveRowDown"), ICON.moveDown, () => moveTableRow(editor, "down")),
  );
  const moveCol = mkGroup(
    opButton(t("moveColLeft"), ICON.moveUp, () => moveTableColumn(editor, "left"), { rotate: -90 }),
    opButton(t("moveColRight"), ICON.moveDown, () => moveTableColumn(editor, "right"), { rotate: -90 }),
  );

  ops.append(cols, rows, align, moveRow, moveCol);
  return ops;
}

export interface TableBlockChromeCallbacks {
  t: (key: string) => string;
  /** スプレッドシート編集 intent（host がダイアログを開く）。 */
  onEdit: (pos: number) => void;
  /** 削除 intent（host が確認ダイアログを開く）。 */
  onDelete: (pos: number) => void;
}

export interface TableBlockChromeHandle {
  /** スプレッドシート編集中のツールバー抑制を切り替える。 */
  setEditing(editing: boolean): void;
  destroy(): void;
}

/**
 * table ブロックの vanilla chrome を生成する。
 */
export function createTableBlockChrome(
  editor: Editor,
  cb: TableBlockChromeCallbacks,
): TableBlockChromeHandle {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;
  let currentRect: DOMRect | null = null;
  let editing = false;

  const applyVisibility = (): void => {
    anchor.setRect(editor.isEditable && currentPos >= 0 && !editing ? currentRect : null);
  };

  const toolbar = createToolbarContainer(cb.t("tableLabel"));
  const editBtn = mkIconButton(cb.t("edit"), ICON.edit, () => {
    if (currentPos >= 0) cb.onEdit(currentPos);
  });
  const deleteBtn = mkIconButton(cb.t("delete"), ICON.delete, () => {
    if (currentPos >= 0) cb.onDelete(currentPos);
  });
  toolbar.append(
    mkDragHandle(cb.t("dragHandle")),
    mkLabel(cb.t("tableLabel")),
    editBtn,
    buildOpsToolbar(editor, cb.t),
    mkSpacer(),
    deleteBtn,
  );
  anchor.el.appendChild(toolbar);

  const stop = createSelectedBlockTracker(editor, "table", ({ pos, rect }) => {
    currentPos = pos;
    currentRect = rect;
    applyVisibility();
  });

  return {
    setEditing(next) {
      editing = next;
      applyVisibility();
    },
    destroy() {
      stop();
      anchor.destroy();
    },
  };
}
