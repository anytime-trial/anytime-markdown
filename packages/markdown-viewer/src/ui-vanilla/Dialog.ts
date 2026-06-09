/**
 * 脱React の vanilla DOM Dialog ファクトリ（MUI Dialog / ui/Dialog.tsx 置換）。
 *
 * Portal 相当（呼び元で append）+ backdrop + ESC + Tab フォーカストラップ + 初期フォーカス +
 * 背景スクロールロック + 背景 a11y 隠蔽 + aria-modal を素 DOM で実装する。構成パーツ
 * （DialogTitle / DialogContent / DialogActions / DialogContentText）と title id 生成も提供する。
 * テーマ色は `--am-color-*` CSS 変数で追従し React テーマ API に依存しない。
 */

import { appendContent, applyStyle, FOCUSABLE, type VanillaContent } from "./dom";

/** MUI breakpoint 名 → max-width(px)（ui/Dialog と同値）。 */
const MAX_WIDTH_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 444,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
};

let dialogTitleIdSeq = 0;

/**
 * Dialog title と aria-labelledby を連携するための一意 id を生成する（React useId 相当）。
 * hook ではなく純粋関数。
 */
export function nextDialogTitleId(): string {
  dialogTitleIdSeq += 1;
  return `am-dialog-title-${dialogTitleIdSeq}`;
}

// --- Dialog 構成パーツ -------------------------------------------------------

/** {@link createDialogTitle} のオプション。 */
export interface CreateDialogTitleOptions {
  /** aria-labelledby 連携用の id。 */
  id?: string;
  /** タイトル本文（string / Node / その配列）。 */
  children?: VanillaContent;
}

/** {@link createDialogContent} のオプション。 */
export interface CreateDialogContentOptions {
  /** 本文（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 上下罫線 + 内部スクロール（MUI DialogContent dividers）。 */
  dividers?: boolean;
}

/** {@link createDialogActions} のオプション。 */
export interface CreateDialogActionsOptions {
  /** アクション群（ボタン等）。右寄せ flex で並ぶ。 */
  children?: VanillaContent;
}

/** {@link createDialogContentText} のオプション。 */
export interface CreateDialogContentTextOptions {
  /** aria-describedby 連携用の id。 */
  id?: string;
  /** 説明文（string / Node / その配列）。 */
  children?: VanillaContent;
  /** 追加スタイル（pre-line 等の上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/** DialogTitle（h2）。`id` は aria-labelledby 連携に使う。 */
export function createDialogTitle(opts: CreateDialogTitleOptions = {}): { el: HTMLHeadingElement } {
  const el = document.createElement("h2");
  if (opts.id) el.id = opts.id;
  el.style.cssText =
    "margin:0;padding:var(--am-space-4) var(--am-space-4) var(--am-space-2);" +
    "font-size:1.25rem;font-weight:600;";
  appendContent(el, opts.children);
  return { el };
}

/** DialogContent。`dividers` で上下罫線 + 内部スクロール（MUI dividers）。 */
export function createDialogContent(opts: CreateDialogContentOptions = {}): { el: HTMLDivElement } {
  const el = document.createElement("div");
  if (opts.dividers) {
    el.style.cssText =
      "padding:var(--am-space-2) var(--am-space-4);flex:1 1 auto;overflow-y:auto;" +
      "border-top:1px solid var(--am-color-divider);" +
      "border-bottom:1px solid var(--am-color-divider);";
  } else {
    el.style.cssText = "padding:var(--am-space-2) var(--am-space-4);";
  }
  appendContent(el, opts.children);
  return { el };
}

/** DialogActions（右寄せ flex）。 */
export function createDialogActions(opts: CreateDialogActionsOptions = {}): { el: HTMLDivElement } {
  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;justify-content:flex-end;gap:var(--am-space-2);" +
    "padding:var(--am-space-2) var(--am-space-3) var(--am-space-3);";
  appendContent(el, opts.children);
  return { el };
}

/** DialogContentText（p / body1 / text.secondary）。 */
export function createDialogContentText(opts: CreateDialogContentTextOptions = {}): {
  el: HTMLParagraphElement;
} {
  const el = document.createElement("p");
  if (opts.id) el.id = opts.id;
  el.style.cssText =
    "margin:0;color:var(--am-color-text-secondary);font-size:1rem;line-height:1.5;";
  applyStyle(el, opts.style);
  appendContent(el, opts.children);
  return { el };
}

// --- Dialog ------------------------------------------------------------------

/** {@link createDialog} のオプション。MUI Dialog（ui/Dialog.tsx）置換。 */
export interface CreateDialogOptions {
  /** 閉じる要求（背景クリック / ESC）時のコールバック。 */
  onClose: () => void;
  /** paper（role=dialog）内に入れる中身。 */
  children?: VanillaContent;
  /** aria-label。 */
  ariaLabel?: string;
  /** aria-labelledby に渡す title 要素の id。 */
  labelledBy?: string;
  /** aria-describedby に渡す説明要素の id。 */
  describedBy?: string;
  /** 最大幅。false で上限なし。既定 "sm"。 */
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
  /** maxWidth まで横いっぱいに広げる。 */
  fullWidth?: boolean;
  /** 全画面表示（余白・角丸なし）。 */
  fullScreen?: boolean;
  /** paper への追加クラス。 */
  paperClassName?: string;
  /** paper への追加スタイル（背景色上書き等）。 */
  paperStyle?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Dialog の置換（素 DOM）。backdrop + paper(role=dialog) + ESC + Tab フォーカストラップ +
 * 背景スクロールロック + aria-modal を実装する。
 *
 * 返り値の `el`（backdrop ルート）を `document.body` 等へ append すると開く。`destroy()` で
 * listener 解除・背景 a11y / overflow 復元・直前フォーカス復帰・el の取り外しを行う。
 *
 * - 背景（backdrop 自身）の mousedown で `onClose`（paper 内クリックは無視）。
 * - paper 内 keydown: ESC → `onClose`、Tab → 先頭/末尾の循環トラップ。
 * - 生成直後に paper 内の最初の focusable（無ければ paper 自体）へフォーカス。
 */
export function createDialog(opts: CreateDialogOptions): {
  el: HTMLDivElement;
  paper: HTMLDivElement;
  destroy: () => void;
} {
  const { onClose, maxWidth = "sm", fullWidth, fullScreen } = opts;

  // backdrop（ui/Dialog.module.css .backdrop 相当）。z-index 12000。
  const el = document.createElement("div");
  el.setAttribute("data-am-dialog-backdrop", "");
  el.style.cssText =
    "position:fixed;inset:0;z-index:12000;display:flex;align-items:center;" +
    "justify-content:center;background:rgba(0,0,0,0.5);";

  // paper（role=dialog）。
  const paper = document.createElement("div");
  paper.setAttribute("role", "dialog");
  paper.setAttribute("aria-modal", "true");
  if (opts.labelledBy) paper.setAttribute("aria-labelledby", opts.labelledBy);
  if (opts.describedBy) paper.setAttribute("aria-describedby", opts.describedBy);
  if (opts.ariaLabel) paper.setAttribute("aria-label", opts.ariaLabel);
  paper.tabIndex = -1;

  const baseCss =
    "outline:none;display:flex;flex-direction:column;min-width:280px;margin:32px;" +
    "max-height:calc(100% - 64px);overflow-y:auto;border-radius:var(--am-radius-md);" +
    "background:var(--am-color-bg-paper);color:var(--am-color-text-primary);" +
    "box-shadow:var(--am-elevation-3);";
  let layoutCss = "";
  if (fullScreen) {
    layoutCss =
      "width:100%;height:100%;max-width:100%;max-height:100%;margin:0;border-radius:0;";
  } else {
    const maxWidthValue =
      maxWidth === false ? "" : `max-width:min(${MAX_WIDTH_PX[maxWidth]}px, calc(100vw - 64px));`;
    const fullWidthCss = fullWidth ? "width:calc(100% - 64px);" : "";
    layoutCss = maxWidthValue + fullWidthCss;
  }
  paper.style.cssText = baseCss + layoutCss;
  if (opts.paperClassName) paper.className = opts.paperClassName;
  applyStyle(paper, opts.paperStyle);
  appendContent(paper, opts.children);
  el.appendChild(paper);

  // 背景クリックで閉じる（backdrop 自身のときのみ）。
  const onBackdropMouseDown = (e: MouseEvent): void => {
    if (e.target === e.currentTarget) onClose();
  };
  el.addEventListener("mousedown", onBackdropMouseDown);

  // ESC + Tab フォーカストラップ（ui/useModalFocusTrap の onKeyDown 相当）。
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = paper.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  paper.addEventListener("keydown", onKeyDown);

  // open 時のフォーカス退避・背景スクロールロック。
  const restore = document.activeElement as HTMLElement | null;
  const firstFocusable = paper.querySelector<HTMLElement>(FOCUSABLE);
  (firstFocusable ?? paper).focus();

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  let destroyed = false;
  return {
    el,
    paper,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      el.removeEventListener("mousedown", onBackdropMouseDown);
      paper.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restore?.focus?.();
      el.remove();
    },
  };
}
