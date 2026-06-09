/**
 * 脱React の vanilla DOM ファクトリ（Backdrop / Dialog プリミティブ）。
 *
 * `ui/Backdrop.tsx` / `ui/Dialog.tsx`（React + CSS Modules）と等価な見た目・挙動を素 DOM で
 * 再現する。テーマ色は `--am-color-*` CSS 変数（`applyEditorThemeCssVars` 注入）で追従し、
 * React テーマ API（useIsDark 等）に依存しない。`vanillaToolbar.ts` のパターン
 * （cssText + addEventListener + attribute API）に従う。
 *
 * 提供物:
 * - {@link createBackdrop}: 全画面オーバーレイ + フェード（MUI Backdrop 置換）
 * - {@link createDialog}: Portal + backdrop + ESC + フォーカストラップ（MUI Dialog 置換）
 * - {@link createDialogTitle} / {@link createDialogContent} / {@link createDialogActions} /
 *   {@link createDialogContentText}: Dialog の構成パーツ
 * - {@link nextDialogTitleId}: title 連携用の id 生成（React useId 相当）
 */

/** Dialog / Drawer 共有のフォーカス可能要素セレクタ（ui/useModalFocusTrap と同一）。 */
export const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** MUI breakpoint 名 → max-width(px)（ui/Dialog と同値）。 */
const MAX_WIDTH_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 444,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
};

/** 受け入れ可能な content 形式（string / Node / その配列）。 */
export type VanillaContent = string | Node | readonly (string | Node)[];

/** content を root へ流し込む（string は span、Node は appendChild、配列は順次）。 */
function appendContent(root: HTMLElement, content: VanillaContent | undefined): void {
  if (content == null) return;
  const items = Array.isArray(content) ? content : [content];
  for (const item of items) {
    if (typeof item === "string") {
      const span = document.createElement("span");
      span.textContent = item;
      root.appendChild(span);
    } else {
      root.appendChild(item as Node);
    }
  }
}

/** Partial<CSSStyleDeclaration> を要素へ適用する。 */
function applyStyle(el: HTMLElement, style: Partial<CSSStyleDeclaration> | undefined): void {
  if (!style) return;
  Object.assign(el.style, style);
}

// ---------------------------------------------------------------------------
// Backdrop
// ---------------------------------------------------------------------------

/** {@link createBackdrop} のオプション。MUI Backdrop（ui/Backdrop.tsx）置換。 */
export interface CreateBackdropOptions {
  /** 初期表示状態。既定 false（生成直後はフェードイン対象）。 */
  open?: boolean;
  /** フェード時間(ms)。既定 225。 */
  timeout?: number;
  /** root への追加クラス。 */
  className?: string;
  /** root への追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** オーバーレイ内の中身。 */
  children?: VanillaContent;
  /** オーバーレイ（背景）クリック時のコールバック。target===currentTarget のときのみ発火。 */
  onClick?: () => void;
}

/**
 * 全画面固定オーバーレイ + フェード（MUI Backdrop 置換）。
 *
 * - `position:fixed; inset:0` の半透明黒オーバーレイ。z-index / レイアウトは消費側 className で上書き。
 * - `setOpen(true)` で opacity 0→1、`setOpen(false)` で 1→0（CSS transition）。
 * - `onClick` は背景（自身）クリック時のみ発火（中身クリックは無視）。
 * - `destroy()` で listener を解除し、親から el を取り外す。
 */
export function createBackdrop(opts: CreateBackdropOptions = {}): {
  el: HTMLDivElement;
  setOpen: (open: boolean) => void;
  update: (next: Partial<CreateBackdropOptions>) => void;
  destroy: () => void;
} {
  const timeout = opts.timeout ?? 225;
  const el = document.createElement("div");
  el.setAttribute("data-am-backdrop", "");
  // ui/Backdrop.module.css .root 相当を cssText に展開。--backdrop-duration は timeout 連動。
  el.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
    "background-color:rgba(0,0,0,0.5);color:#fff;opacity:0;" +
    "transition:opacity var(--backdrop-duration," +
    `${timeout}ms) var(--am-ease-standard, ease);` +
    "-webkit-tap-highlight-color:transparent;";
  el.style.setProperty("--backdrop-duration", `${timeout}ms`);
  if (opts.className) el.className = opts.className;
  applyStyle(el, opts.style);
  appendContent(el, opts.children);

  let clickHandler: ((e: MouseEvent) => void) | null = null;
  const attachClick = (cb: (() => void) | undefined): void => {
    if (clickHandler) {
      el.removeEventListener("mousedown", clickHandler);
      clickHandler = null;
    }
    if (!cb) return;
    clickHandler = (e: MouseEvent) => {
      if (e.target === e.currentTarget) cb();
    };
    el.addEventListener("mousedown", clickHandler);
  };
  attachClick(opts.onClick);

  const setOpen = (open: boolean): void => {
    el.style.opacity = open ? "1" : "0";
  };
  setOpen(opts.open ?? false);

  return {
    el,
    setOpen,
    update(next) {
      if (next.className !== undefined) el.className = next.className;
      if (next.style !== undefined) applyStyle(el, next.style);
      if (next.timeout !== undefined) {
        el.style.setProperty("--backdrop-duration", `${next.timeout}ms`);
      }
      if (next.onClick !== undefined) attachClick(next.onClick);
      if (next.open !== undefined) setOpen(next.open);
    },
    destroy() {
      if (clickHandler) {
        el.removeEventListener("mousedown", clickHandler);
        clickHandler = null;
      }
      el.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Dialog title id 生成（React useId 相当）
// ---------------------------------------------------------------------------

let dialogTitleIdSeq = 0;

/** Dialog title と aria-labelledby を連携するための一意 id（React useId 相当）。 */
export function nextDialogTitleId(): string {
  dialogTitleIdSeq += 1;
  return `am-dialog-title-${dialogTitleIdSeq}`;
}

// ---------------------------------------------------------------------------
// Dialog 構成パーツ（DialogTitle / DialogContent / DialogActions / DialogContentText）
// ---------------------------------------------------------------------------

/** DialogTitle（h2）。`id` は aria-labelledby 連携に使う。 */
export function createDialogTitle(opts: {
  id?: string;
  children?: VanillaContent;
} = {}): { el: HTMLHeadingElement } {
  const el = document.createElement("h2");
  if (opts.id) el.id = opts.id;
  el.style.cssText =
    "margin:0;padding:var(--am-space-4) var(--am-space-4) var(--am-space-2);" +
    "font-size:1.25rem;font-weight:600;";
  appendContent(el, opts.children);
  return { el };
}

/** DialogContent。`dividers` で上下罫線 + 内部スクロール（MUI dividers）。 */
export function createDialogContent(opts: {
  children?: VanillaContent;
  dividers?: boolean;
} = {}): { el: HTMLDivElement } {
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
export function createDialogActions(opts: {
  children?: VanillaContent;
} = {}): { el: HTMLDivElement } {
  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;justify-content:flex-end;gap:var(--am-space-2);" +
    "padding:var(--am-space-2) var(--am-space-3) var(--am-space-3);";
  appendContent(el, opts.children);
  return { el };
}

/** DialogContentText（p / body1 / text.secondary）。 */
export function createDialogContentText(opts: {
  id?: string;
  children?: VanillaContent;
  style?: Partial<CSSStyleDeclaration>;
} = {}): { el: HTMLParagraphElement } {
  const el = document.createElement("p");
  if (opts.id) el.id = opts.id;
  el.style.cssText =
    "margin:0;color:var(--am-color-text-secondary);font-size:1rem;line-height:1.5;";
  applyStyle(el, opts.style);
  appendContent(el, opts.children);
  return { el };
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

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
  const {
    onClose,
    maxWidth = "sm",
    fullWidth,
    fullScreen,
  } = opts;

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
    // .fullScreen: 余白・角丸なし。
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

  // open 時のフォーカス退避・背景スクロールロック・背景 a11y 隠蔽。
  const restore = document.activeElement as HTMLElement | null;
  const firstFocusable = paper.querySelector<HTMLElement>(FOCUSABLE);
  (firstFocusable ?? paper).focus();

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  // 背景を a11y ツリーから隠す。el の body 直下祖先（Portal ルート）以外に aria-hidden。
  const portalRoot = el.closest("body > *");
  const hidden: Element[] = [];
  if (portalRoot) {
    for (const child of Array.from(document.body.children)) {
      if (child !== portalRoot && child.getAttribute("aria-hidden") !== "true") {
        child.setAttribute("aria-hidden", "true");
        hidden.push(child);
      }
    }
  }

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
      for (const child of hidden) child.removeAttribute("aria-hidden");
      restore?.focus?.();
      el.remove();
    },
  };
}
