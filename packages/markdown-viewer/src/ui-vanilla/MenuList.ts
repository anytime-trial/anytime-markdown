/**
 * 脱React の vanilla DOM MenuList ファクトリ（MUI MenuList / ui/MenuList.tsx 置換）。
 *
 * `<ul>`（padding 8px 0）。`ui/MenuList.module.css` の見た目を素 DOM で再現する。React 版は dense を
 * context で子 MenuItem へ伝播するが、vanilla では各 MenuItem に dense を明示伝播する。
 *
 * 本ファイルはさらに **キーボードナビゲーションの state machine** を集約する（Menu / Select /
 * SlashCommand が再利用）。↑↓ で項目移動（wraparound）、Home/End で先頭/末尾、Enter で確定、
 * Esc で取消。disabled 項目はスキップする。roving tabindex（アクティブ項目のみ tabIndex 0）と
 * aria-activedescendant 連携を提供する。テーマ色は `--am-color-*` CSS 変数で追従し React テーマ
 * API に依存しない。`Button.ts` / `Dialog.ts` の cssText + addEventListener パターンに揃える。
 */

import { applyStyle } from "./dom";

/** menuitem として扱うセレクタ（createMenuItem の li / 一般の role=menuitem 双方）。 */
const MENUITEM_SELECTOR = '[role="menuitem"], [role="option"]';

/** {@link createMenuList} のオプション。React `MenuListProps` + キーボード制御を統合。 */
export interface CreateMenuListOptions {
  /** メニュー項目要素（createMenuItem の el 等）。複数 / 単一 / 配列を受ける。 */
  items?: HTMLElement | readonly HTMLElement[];
  /** 高密度（padding を詰める。子 MenuItem へは consumer が伝播する想定）。 */
  dense?: boolean;
  /** role 属性（既定 "menu"。Select 等で "listbox" に変更可能）。 */
  role?: string;
  /** ナビゲーション有効化（既定 true）。false で listener を張らない。 */
  keyboard?: boolean;
  /** ↑↓ が端で反対側へ回り込む（既定 true）。 */
  wraparound?: boolean;
  /** aria-label。 */
  ariaLabel?: string;
  /** 追加クラス名。 */
  className?: string;
  /** 追加スタイル。 */
  style?: Partial<CSSStyleDeclaration>;
  /** data-testid 属性。 */
  testId?: string;
  /**
   * アクティブ（ハイライト）項目が変わったときの通知。
   * @param index 新しいアクティブ index（項目が無ければ -1）
   * @param el 対応する項目要素（無ければ null）
   */
  onActiveChange?: (index: number, el: HTMLElement | null) => void;
  /**
   * Enter / アクティブ項目クリックでの確定。
   * @param index 確定した項目の index
   * @param el 対応する項目要素
   */
  onSelect?: (index: number, el: HTMLElement) => void;
  /** Esc での取消要求。 */
  onCancel?: () => void;
}

// ui/MenuList.module.css .menuList と一字一句対応（padding 8px 0）。
const BASE_CSS = "margin:0;padding:8px 0;list-style:none;outline:none;";

/** 要素が無効（aria-disabled=true / disabled）かを判定する。 */
function isDisabled(el: HTMLElement): boolean {
  return (
    el.getAttribute("aria-disabled") === "true" ||
    (el as HTMLElement & { disabled?: boolean }).disabled === true
  );
}

/**
 * vanilla MenuList を生成する。
 *
 * 返り値の `el`（ul）に items を append 済みで返す。キーボードナビゲーションは `el` の keydown を
 * 監視し、roving tabindex + aria-activedescendant でアクティブ項目を表現する。
 *
 * @returns `el`（ul）と各種操作 API（`update` / `setActiveIndex` / `getActiveIndex` /
 * `focusActive` / `destroy`）。
 */
export function createMenuList(opts: CreateMenuListOptions = {}): {
  el: HTMLUListElement;
  /** 可変プロパティ反映（items 差し替え時はアクティブ index をクランプ）。 */
  update: (next: Partial<CreateMenuListOptions>) => void;
  /** アクティブ index を設定（範囲外 / disabled は無視。-1 で解除）。 */
  setActiveIndex: (index: number) => void;
  /** 現在のアクティブ index（無ければ -1）。 */
  getActiveIndex: () => number;
  /** アクティブ項目へ DOM フォーカスを移す。 */
  focusActive: () => void;
  destroy: () => void;
} {
  let useKeyboard = opts.keyboard ?? true;
  let wraparound = opts.wraparound ?? true;
  let onActiveChange = opts.onActiveChange;
  let onSelect = opts.onSelect;
  let onCancel = opts.onCancel;
  let activeIndex = -1;

  const el = document.createElement("ul");
  el.setAttribute("role", opts.role ?? "menu");
  el.style.cssText = BASE_CSS;
  applyStyle(el, opts.style);
  if (opts.className) el.className = opts.className;
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  // roving tabindex のためコンテナ自身はフォーカス経路から外す。
  el.tabIndex = -1;

  const appendItems = (items: CreateMenuListOptions["items"]): void => {
    if (!items) return;
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) el.appendChild(item);
  };
  appendItems(opts.items);

  /** 現在の menuitem 要素一覧（DOM 順）。 */
  const itemEls = (): HTMLElement[] =>
    [...el.querySelectorAll<HTMLElement>(MENUITEM_SELECTOR)];

  /** roving tabindex / aria-activedescendant をアクティブ index に同期する。 */
  const syncActive = (notify: boolean): void => {
    const items = itemEls();
    items.forEach((item, i) => {
      item.tabIndex = i === activeIndex ? 0 : -1;
      if (i === activeIndex) {
        if (!item.id) item.id = `am-menuitem-${Math.random().toString(36).slice(2, 9)}`;
        el.setAttribute("aria-activedescendant", item.id);
      }
    });
    if (activeIndex < 0) el.removeAttribute("aria-activedescendant");
    if (notify) onActiveChange?.(activeIndex, items[activeIndex] ?? null);
  };

  const setActiveIndex = (index: number, notify = true): void => {
    const items = itemEls();
    if (index < 0 || index >= items.length || isDisabled(items[index])) {
      if (index < 0) {
        activeIndex = -1;
        syncActive(notify);
      }
      return;
    }
    activeIndex = index;
    syncActive(notify);
  };

  /** start から step 方向に最初の有効項目 index を返す（wraparound 考慮）。無ければ -1。 */
  const findEnabled = (start: number, step: number): number => {
    const items = itemEls();
    const n = items.length;
    if (n === 0) return -1;
    for (let count = 0; count < n; count += 1) {
      let idx = start + step * count;
      if (wraparound) {
        idx = ((idx % n) + n) % n;
      } else if (idx < 0 || idx >= n) {
        break;
      }
      if (!isDisabled(items[idx])) return idx;
    }
    return -1;
  };

  const moveNext = (): void => {
    const items = itemEls();
    if (items.length === 0) return;
    const start = activeIndex < 0 ? 0 : activeIndex + 1;
    const next = findEnabled(wraparound ? start : Math.min(start, items.length - 1), 1);
    if (next >= 0) setActiveIndex(next);
  };

  const movePrev = (): void => {
    const items = itemEls();
    if (items.length === 0) return;
    const start = activeIndex < 0 ? items.length - 1 : activeIndex - 1;
    const prev = findEnabled(wraparound ? start : Math.max(start, 0), -1);
    if (prev >= 0) setActiveIndex(prev);
  };

  const moveHome = (): void => {
    const first = findEnabled(0, 1);
    if (first >= 0) setActiveIndex(first);
  };

  const moveEnd = (): void => {
    const items = itemEls();
    const last = findEnabled(items.length - 1, -1);
    if (last >= 0) setActiveIndex(last);
  };

  const confirm = (): void => {
    const items = itemEls();
    const item = items[activeIndex];
    if (item && !isDisabled(item)) onSelect?.(activeIndex, item);
  };

  // キーボード state machine（↑↓ / Home / End / Enter / Esc）。
  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveNext();
        break;
      case "ArrowUp":
        e.preventDefault();
        movePrev();
        break;
      case "Home":
        e.preventDefault();
        moveHome();
        break;
      case "End":
        e.preventDefault();
        moveEnd();
        break;
      case "Enter":
        e.preventDefault();
        confirm();
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
        break;
      default:
        break;
    }
  };
  if (useKeyboard) el.addEventListener("keydown", onKeyDown);

  // ポインタ移動でアクティブ追従（メニューはマウス hover でハイライトが動く慣習）。
  const onPointerOver = (e: Event): void => {
    const target = (e.target as HTMLElement | null)?.closest(MENUITEM_SELECTOR) as
      | HTMLElement
      | null;
    if (!target || isDisabled(target)) return;
    const idx = itemEls().indexOf(target);
    if (idx >= 0 && idx !== activeIndex) setActiveIndex(idx);
  };
  if (useKeyboard) el.addEventListener("pointerover", onPointerOver);

  let keyboardBound = useKeyboard;

  return {
    el,
    update(next: Partial<CreateMenuListOptions>) {
      if (next.role !== undefined) el.setAttribute("role", next.role);
      if (next.ariaLabel !== undefined) el.setAttribute("aria-label", next.ariaLabel);
      if (next.className !== undefined) el.className = next.className;
      if (next.style !== undefined) {
        el.style.cssText = BASE_CSS;
        applyStyle(el, next.style);
      }
      if (next.wraparound !== undefined) wraparound = next.wraparound;
      if (next.onActiveChange !== undefined) onActiveChange = next.onActiveChange;
      if (next.onSelect !== undefined) onSelect = next.onSelect;
      if (next.onCancel !== undefined) onCancel = next.onCancel;
      if (next.items !== undefined) {
        for (const child of [...el.children]) el.removeChild(child);
        el.removeAttribute("aria-activedescendant");
        appendItems(next.items);
        // items 差し替えでアクティブ index をクランプ（範囲外なら解除）。
        const count = itemEls().length;
        if (activeIndex >= count) activeIndex = -1;
        syncActive(false);
      }
      if (next.keyboard !== undefined && next.keyboard !== keyboardBound) {
        useKeyboard = next.keyboard;
        if (next.keyboard) {
          el.addEventListener("keydown", onKeyDown);
          el.addEventListener("pointerover", onPointerOver);
        } else {
          el.removeEventListener("keydown", onKeyDown);
          el.removeEventListener("pointerover", onPointerOver);
        }
        keyboardBound = next.keyboard;
      }
    },
    setActiveIndex(index: number) {
      setActiveIndex(index);
    },
    getActiveIndex() {
      return activeIndex;
    },
    focusActive() {
      const item = itemEls()[activeIndex];
      item?.focus?.();
    },
    destroy() {
      if (keyboardBound) {
        el.removeEventListener("keydown", onKeyDown);
        el.removeEventListener("pointerover", onPointerOver);
        keyboardBound = false;
      }
      onActiveChange = undefined;
      onSelect = undefined;
      onCancel = undefined;
    },
  };
}
