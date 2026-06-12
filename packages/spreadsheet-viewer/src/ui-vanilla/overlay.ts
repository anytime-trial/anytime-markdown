import { injectSpreadsheetUiStyles } from "../ui/injectStyles";

/**
 * Menu / Dialog の vanilla ファクトリ（React 版 ui/Menu.tsx・ui/Dialog.tsx の置換）。
 * backdrop + paper の DOM 構造・クラス名・配置ロジック（transform translate %）は React 版と同一。
 */

export interface SvMenuOrigin {
  vertical: "top" | "center" | "bottom";
  horizontal: "left" | "center" | "right";
}

export interface SvMenuPosition {
  top: number;
  left: number;
}

const DEFAULT_ANCHOR_ORIGIN: SvMenuOrigin = { vertical: "bottom", horizontal: "left" };
const DEFAULT_TRANSFORM_ORIGIN: SvMenuOrigin = { vertical: "top", horizontal: "left" };

function axisPercent(value: SvMenuOrigin["vertical"] | SvMenuOrigin["horizontal"]): string {
  if (value === "center") return "-50%";
  if (value === "bottom" || value === "right") return "-100%";
  return "0";
}

function anchorPoint(el: HTMLElement, origin: SvMenuOrigin): SvMenuPosition {
  const r = el.getBoundingClientRect();
  let left: number;
  if (origin.horizontal === "left") left = r.left;
  else if (origin.horizontal === "right") left = r.right;
  else left = r.left + r.width / 2;
  let top: number;
  if (origin.vertical === "top") top = r.top;
  else if (origin.vertical === "bottom") top = r.bottom;
  else top = r.top + r.height / 2;
  return { top, left };
}

export interface SvMenuItemOptions {
  label: string;
  icon?: Node;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/** MUI MenuItem + ListItemIcon + ListItemText 相当の 1 項目を生成する。 */
export function createSvMenuItem(options: SvMenuItemOptions): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.className = ["sv-menu-item", options.className ?? ""].filter(Boolean).join(" ");
  if (options.disabled) {
    item.disabled = true;
    item.setAttribute("aria-disabled", "true");
  }
  if (options.icon) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "sv-list-item-icon";
    iconWrap.appendChild(options.icon);
    item.appendChild(iconWrap);
  }
  const text = document.createElement("span");
  text.className = "sv-list-item-text";
  text.textContent = options.label;
  item.appendChild(text);
  if (options.onClick) item.addEventListener("click", options.onClick);
  return item;
}

export interface OpenSvMenuOptions {
  /** anchorEl 方式（要素基準で配置）。 */
  anchorEl?: HTMLElement | null;
  /** anchorPosition 方式（絶対座標基準）。指定時はこちらを優先する。 */
  anchorPosition?: SvMenuPosition;
  anchorOrigin?: SvMenuOrigin;
  transformOrigin?: SvMenuOrigin;
  /** backdrop mousedown / Escape で呼ばれる（呼び元が close() を実行する）。 */
  onClose: () => void;
}

export interface SvMenuHandle {
  /** メニュー項目を append する paper 要素（role=menu）。 */
  paper: HTMLDivElement;
  close(): void;
}

/**
 * MUI Menu 相当を body 直下に開く。paper へ createSvMenuItem の項目を append して使う。
 */
export function openSvMenu(options: OpenSvMenuOptions): SvMenuHandle | null {
  injectSpreadsheetUiStyles();
  let point: SvMenuPosition | null = null;
  let xform = DEFAULT_TRANSFORM_ORIGIN;
  if (options.anchorPosition) {
    point = options.anchorPosition;
  } else if (options.anchorEl) {
    point = anchorPoint(options.anchorEl, options.anchorOrigin ?? DEFAULT_ANCHOR_ORIGIN);
    xform = options.transformOrigin ?? DEFAULT_TRANSFORM_ORIGIN;
  }
  if (!point) return null;

  const backdrop = document.createElement("div");
  backdrop.className = "sv-menu-backdrop";
  backdrop.addEventListener("mousedown", () => options.onClose());

  const paper = document.createElement("div");
  paper.className = "sv-menu-paper";
  paper.setAttribute("role", "menu");
  paper.tabIndex = -1;
  paper.style.top = `${point.top}px`;
  paper.style.left = `${point.left}px`;
  paper.style.transform = `translate(${axisPercent(xform.horizontal)}, ${axisPercent(xform.vertical)})`;
  paper.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      options.onClose();
    }
  });

  document.body.append(backdrop, paper);
  paper.focus();

  return {
    paper,
    close() {
      backdrop.remove();
      paper.remove();
    },
  };
}

export interface OpenSvDialogOptions {
  title?: string;
  /** sv-dialog-content へ append するノード。 */
  content: Node;
  /** sv-dialog-actions へ append するノード列（未指定時は actions 領域なし）。 */
  actions?: readonly Node[];
  /** backdrop クリック / Escape で呼ばれる（呼び元が close() を実行する）。 */
  onClose: () => void;
  /** content 領域の style 上書き（旧 DialogContent の style prop 相当）。 */
  contentStyle?: Partial<CSSStyleDeclaration>;
}

export interface SvDialogHandle {
  backdrop: HTMLDivElement;
  paper: HTMLDivElement;
  close(): void;
}

/** MUI Dialog 相当を body 直下に開く。 */
export function openSvDialog(options: OpenSvDialogOptions): SvDialogHandle {
  injectSpreadsheetUiStyles();
  const backdrop = document.createElement("div");
  backdrop.className = "sv-dialog-backdrop";
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) options.onClose();
  });

  const paper = document.createElement("div");
  paper.className = "sv-dialog-paper";
  paper.setAttribute("role", "dialog");
  paper.setAttribute("aria-modal", "true");

  if (options.title) {
    const title = document.createElement("div");
    title.className = "sv-dialog-title";
    title.textContent = options.title;
    paper.appendChild(title);
  }
  const content = document.createElement("div");
  content.className = "sv-dialog-content";
  if (options.contentStyle) Object.assign(content.style, options.contentStyle);
  content.appendChild(options.content);
  paper.appendChild(content);
  if (options.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "sv-dialog-actions";
    actions.append(...options.actions);
    paper.appendChild(actions);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") options.onClose();
  };
  document.addEventListener("keydown", onKey);

  backdrop.appendChild(paper);
  document.body.appendChild(backdrop);

  return {
    backdrop,
    paper,
    close() {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    },
  };
}
