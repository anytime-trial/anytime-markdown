/**
 * 確認ダイアログ（Promise ベース・vanilla）。
 *
 * `createDialog` の self-append に乗せ、確定/取消/ESC/backdrop で解決して自前破棄する。
 * installBlockOverlays の `confirmDelete` と markdown-rich installCodeBlockOverlay の
 * `confirmVanilla` が同パターンを重複実装していたものの集約。
 */

import { createButton } from "./Button";
import {
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogTitle,
  nextDialogTitleId,
} from "./Dialog";

export interface ConfirmWithDialogOptions {
  /** ダイアログタイトル。 */
  title: string;
  /** 本文メッセージ。 */
  message: string;
  /** 確定ボタンのラベル。 */
  confirmLabel: string;
  /** 取消ボタンのラベル。 */
  cancelLabel: string;
  /** 確定ボタンの色（既定 "error" — 破壊的操作の確認が主用途のため）。 */
  confirmColor?: "primary" | "error";
}

/**
 * 確認ダイアログを開き、確定で `true`、取消 / ESC / backdrop で `false` に解決する。
 */
export function confirmWithDialog(opts: ConfirmWithDialogOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const titleId = nextDialogTitleId();
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      cancelBtn.destroy();
      okBtn.destroy();
      dialog.destroy();
      resolve(ok);
    };
    const cancelBtn = createButton({ label: opts.cancelLabel, onClick: () => finish(false) });
    const okBtn = createButton({
      label: opts.confirmLabel,
      color: opts.confirmColor ?? "error",
      variant: "contained",
      onClick: () => finish(true),
    });
    const messageEl = document.createElement("div");
    messageEl.textContent = opts.message;
    const dialog = createDialog({
      onClose: () => finish(false),
      labelledBy: titleId,
      maxWidth: "xs",
      children: [
        createDialogTitle({ id: titleId, children: opts.title }).el,
        createDialogContent({ children: messageEl }).el,
        createDialogActions({ children: [cancelBtn.el, okBtn.el] }).el,
      ],
    });
  });
}
