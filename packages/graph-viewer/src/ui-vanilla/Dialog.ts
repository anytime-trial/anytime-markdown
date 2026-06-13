/**
 * MUI Dialog / ui/Dialog.tsx の vanilla DOM 置換（graph-viewer 専用）。
 *
 * backdrop + paper(role=dialog) + Escape キー閉じる + backdrop クリック閉じる を素 DOM で実装する。
 * 生成時に document.body へ portal mount する（呼び元は append 不要）。
 * gv-* クラスは injectStyles.ts で定義済みのものを流用する。
 */

import { injectGraphUiStyles } from '../ui/injectStyles';
import { appendContent, type VanillaContent } from './dom';

// --- 構成パーツ ---------------------------------------------------------------

/** {@link createDialogTitle} の戻り値。 */
export interface DialogTitleHandle {
  readonly el: HTMLDivElement;
}

/** DialogTitle — gv-dialog-title div。 */
export function createDialogTitle(children?: VanillaContent): DialogTitleHandle {
  const el = document.createElement('div');
  el.className = 'gv-dialog-title';
  appendContent(el, children);
  return { el };
}

/** {@link createDialogContent} の戻り値。 */
export interface DialogContentHandle {
  readonly el: HTMLDivElement;
}

/** DialogContent — gv-dialog-content div。 */
export function createDialogContent(
  children?: VanillaContent,
  style?: Partial<CSSStyleDeclaration>,
): DialogContentHandle {
  const el = document.createElement('div');
  el.className = 'gv-dialog-content';
  if (style) {
    for (const [key, value] of Object.entries(style)) {
      if (value != null) {
        (el.style as unknown as Record<string, string>)[key] = String(value);
      }
    }
  }
  appendContent(el, children);
  return { el };
}

/** {@link createDialogContentText} の戻り値。 */
export interface DialogContentTextHandle {
  readonly el: HTMLParagraphElement;
}

/** DialogContentText — gv-dialog-content-text p。 */
export function createDialogContentText(children?: VanillaContent): DialogContentTextHandle {
  const el = document.createElement('p');
  el.className = 'gv-dialog-content-text';
  appendContent(el, children);
  return { el };
}

/** {@link createDialogActions} の戻り値。 */
export interface DialogActionsHandle {
  readonly el: HTMLDivElement;
}

/** DialogActions — gv-dialog-actions div。 */
export function createDialogActions(children?: VanillaContent): DialogActionsHandle {
  const el = document.createElement('div');
  el.className = 'gv-dialog-actions';
  appendContent(el, children);
  return { el };
}

// --- Dialog ------------------------------------------------------------------

/** {@link createDialog} のオプション。 */
export interface CreateDialogOptions {
  /** 閉じる要求（backdrop クリック / Escape キー）時のコールバック。 */
  readonly onClose: () => void;
  /** paper(role=dialog) 内に入れる中身。 */
  readonly children?: VanillaContent;
  /** マウント先（ポータル）。既定 document.body。 */
  readonly portalTarget?: HTMLElement;
}

/** {@link createDialog} の戻り値。 */
export interface DialogHandle {
  /** backdrop 要素（参照用）。 */
  readonly el: HTMLDivElement;
  /** paper 要素（role=dialog）。 */
  readonly paper: HTMLDivElement;
  /**
   * ダイアログを閉じて DOM から取り外す。
   * listener 解除・el の取り外しを行う。二重呼び出しは安全（no-op）。
   */
  close(): void;
}

/**
 * MUI Dialog の vanilla 置換（graph-viewer 専用）。
 *
 * 生成時に portalTarget（既定 document.body）へ自前マウントする（呼び元は append 不要）。
 * - backdrop 自身の mousedown で onClose。
 * - Escape キーで onClose。
 */
export function createDialog(opts: CreateDialogOptions): DialogHandle {
  injectGraphUiStyles();

  const { onClose } = opts;

  // backdrop
  const el = document.createElement('div');
  el.className = 'gv-dialog-backdrop';

  // paper
  const paper = document.createElement('div');
  paper.className = 'gv-dialog-paper';
  paper.setAttribute('role', 'dialog');
  paper.setAttribute('aria-modal', 'true');
  appendContent(paper, opts.children);
  el.appendChild(paper);

  // backdrop クリック（paper 内クリックは無視）。
  const onBackdropMouseDown = (e: MouseEvent): void => {
    if (e.target === e.currentTarget) onClose();
  };
  el.addEventListener('mousedown', onBackdropMouseDown);

  // Escape キー。
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  (opts.portalTarget ?? document.body).appendChild(el);

  let closed = false;
  return {
    el,
    paper,
    close() {
      if (closed) return;
      closed = true;
      el.removeEventListener('mousedown', onBackdropMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      el.remove();
    },
  };
}
