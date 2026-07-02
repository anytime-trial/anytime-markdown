/**
 * 脱React の vanilla DOM Select ファクトリ（MUI outlined Select / ui/Select.tsx 置換）。
 *
 * 既存 React 実装 `ui/Select.tsx`（+ `Select.module.css`）の見た目・API・a11y を素 DOM で再現する。
 * closed 表示は枠線 + 値 + ▼ の combobox ボタン（VR 対象。常に DOM に存在）、open 時は
 * `document.body` 等へ append する overlay（透明 backdrop + role="listbox" の popup）。value 連動・
 * キーボードナビ（↑↓ / Home / End / Enter/Space / Esc / Tab）に対応する。
 *
 * このファイルは前フェーズ生成済みの低レイヤを **再利用** して組み立てる（再実装禁止）:
 *   - `./floating` の {@link createFloating} ... button→listbox の配置計算 + autoUpdate 購読。
 *   - `./MenuList` の {@link createMenuList} ... キーボード state machine（roving tabindex /
 *     aria-activedescendant / ↑↓ Home/End/Enter/Esc）。role を "listbox" に変更して使う。
 *   - `./MenuItem` の {@link createMenuItem} ... role="option" の項目（gutters / hover / selected）。
 *   - `./dom` の共有 helper（svgIcon）... currentColor inline SVG（▼ アイコン）。
 *
 * テーマ色は `--am-color-*` / `--am-*` CSS 変数で追従し、React テーマ API（useIsDark 等）には
 * 依存しない。`Button.ts` / `Dialog.ts` の cssText + addEventListener パターンに揃える。
 */

import { svgIcon, TRANSPARENT_BACKDROP_CSS } from "./dom";
import { createFloating } from "./floating";
import { createMenuItem } from "./MenuItem";
import { createMenuList } from "./MenuList";

/** Select の選択肢（React `SelectOption` と同形）。 */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** {@link createSelect} のオプション。React `SelectProps` の vanilla 再現範囲。 */
export interface CreateSelectOptions<T extends string> {
  /** 確定値（closed ボタンに表示する option の value）。 */
  value: T;
  /** 選択肢。 */
  options: ReadonlyArray<SelectOption<T>>;
  /** value 変更時のコールバック。 */
  onChange?: (value: T) => void;
  /** aria-label（combobox ボタン / listbox 双方に付与）。 */
  ariaLabel?: string;
  /** 既定 true（消費者は fullWidth で使用）。 */
  fullWidth?: boolean;
  /**
   * closed ボタンの min-width（MUI FormControl の sx.minWidth 相当）。数値は px、文字列はそのまま。
   * 選択値の文字数で幅がガタつくのを防ぐ。省略時は未指定。
   */
  minWidth?: number | string;
  /** popup の append 先（既定 document.body・createPortal 相当）。 */
  portalTarget?: HTMLElement;
}

/** ArrowDropDown（ui/icons ArrowDropDownIcon と同一 path）。 */
const ARROW_DROP_DOWN_PATH = "m7 10 5 5 5-5z";

// Select.module.css .select と一字一句対応（MUI outlined Select size=small の closed 表示）。
const BUTTON_BASE_CSS =
  "box-sizing:border-box;position:relative;display:inline-flex;align-items:center;" +
  "height:40px;padding:0 32px 0 14px;" +
  "border:1px solid var(--am-color-input-border);border-radius:var(--am-radius-md);" +
  "background:transparent;color:var(--am-color-text-primary);" +
  "font-size:1rem;font-family:inherit;text-align:left;cursor:pointer;" +
  "transition:border-color var(--am-duration-fast) var(--am-ease-standard);";

// .fullWidth: display flex + width 100%。
const BUTTON_FULLWIDTH_CSS = "display:flex;width:100%;";

// .value: flex 1 / ellipsis。
const VALUE_CSS =
  "flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

// .icon: 右端中央の ▼（24x24・action.active・pointer-events none）。
const ICON_CSS =
  "position:absolute;right:7px;top:calc(50% - 12px);width:24px;height:24px;" +
  "color:var(--am-color-action-active);pointer-events:none;";

// .backdrop（floating.module.css .backdrop 相当）。透明 click-away。z-index 1300。

// .listbox（floating.module.css .floatingPaper + Select.module.css .listbox）。
const LISTBOX_CSS =
  "z-index:1300;outline:none;box-sizing:border-box;" +
  "background-color:var(--am-color-bg-paper);border-radius:var(--am-radius-md);" +
  "box-shadow:var(--am-elevation-3);" +
  "margin:0;padding:8px 0;list-style:none;" +
  "max-height:calc(100vh - 96px);overflow:auto;";

let selectIdSeq = 0;

/**
 * vanilla Select を生成する。
 *
 * `el`（combobox ボタン）は常に DOM に存在する closed 表示で、これが VR 対象になる。open 時は
 * overlay（backdrop + listbox）を `portalTarget`（既定 document.body）へ append し、close 時に
 * 取り外す。listbox のキーボード制御は {@link createMenuList} の state machine に委譲する。
 *
 * @returns `el`（button）と `update`（value / options / disabled 反映）/ `destroy`
 *   （open 中の overlay 解体 + listener 解除）。
 */
export function createSelect<T extends string>(opts: CreateSelectOptions<T>): {
  el: HTMLButtonElement;
  /** value / options / ariaLabel / fullWidth の差し替え（open 中なら反映）。 */
  update: (next: Partial<CreateSelectOptions<T>>) => void;
  destroy: () => void;
} {
  let value = opts.value;
  let options = opts.options;
  let onChange = opts.onChange;
  let ariaLabel = opts.ariaLabel;
  let fullWidth = opts.fullWidth ?? true;
  let minWidth = opts.minWidth;
  const portalTarget = opts.portalTarget ?? document.body;

  selectIdSeq += 1;
  const baseId = `am-select-${selectIdSeq}`;

  // --- combobox ボタン（closed 表示・常駐） ---------------------------------
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("role", "combobox");
  el.setAttribute("aria-haspopup", "listbox");
  el.setAttribute("aria-expanded", "false");

  const valueSpan = document.createElement("span");
  valueSpan.style.cssText = VALUE_CSS;
  el.appendChild(valueSpan);

  const icon = svgIcon(ARROW_DROP_DOWN_PATH, 24);
  icon.style.cssText = ICON_CSS;
  el.appendChild(icon);

  const applyButtonStyle = (): void => {
    const minWidthCss =
      minWidth === undefined
        ? ""
        : `min-width:${typeof minWidth === "number" ? `${minWidth}px` : minWidth};`;
    el.style.cssText = BUTTON_BASE_CSS + (fullWidth ? BUTTON_FULLWIDTH_CSS : "") + minWidthCss;
  };
  const applyAriaLabel = (): void => {
    if (ariaLabel) el.setAttribute("aria-label", ariaLabel);
    else el.removeAttribute("aria-label");
  };
  const renderValue = (): void => {
    const selected = options.find((o) => o.value === value);
    valueSpan.textContent = selected?.label ?? "";
  };
  applyButtonStyle();
  applyAriaLabel();
  renderValue();

  // --- open / close state ---------------------------------------------------
  let overlay: {
    backdrop: HTMLDivElement;
    list: ReturnType<typeof createMenuList>;
    floating: ReturnType<typeof createFloating>;
  } | null = null;

  const isOpen = (): boolean => overlay !== null;

  const close = (refocusButton: boolean): void => {
    if (!overlay) return;
    overlay.floating.destroy();
    overlay.list.destroy();
    overlay.backdrop.removeEventListener("mousedown", onBackdropMouseDown);
    overlay.list.el.remove();
    overlay.backdrop.remove();
    overlay = null;
    el.setAttribute("aria-expanded", "false");
    if (refocusButton) el.focus();
  };

  const choose = (v: T): void => {
    value = v;
    renderValue();
    onChange?.(v);
    close(true);
  };

  const onBackdropMouseDown = (): void => close(true);

  const open = (): void => {
    if (overlay) return;

    // backdrop（透明 click-away）。
    const backdrop = document.createElement("div");
    backdrop.setAttribute("data-am-select-backdrop", "");
    backdrop.style.cssText = TRANSPARENT_BACKDROP_CSS;

    // listbox 項目（role="option"）。aria-selected=確定値の一致 / selected(CSS)=後で active 同期。
    const selectedIndex = options.findIndex((o) => o.value === value);
    const itemEls = options.map((o, i) => {
      const { el: li } = createMenuItem({
        children: o.label,
        role: "option",
        dense: false,
      });
      li.id = `${baseId}-opt-${i}`;
      li.setAttribute("aria-selected", o.value === value ? "true" : "false");
      // クリックで確定。
      li.addEventListener("click", () => choose(o.value));
      return li;
    });

    // role="listbox" の MenuList（キーボード state machine を委譲）。
    const list = createMenuList({
      items: itemEls,
      role: "listbox",
      ariaLabel,
      // active カーソル位置を CSS ハイライト（selected 背景）へ反映する。
      onActiveChange: (index) => {
        itemEls.forEach((li, i) => {
          if (i === index) {
            li.style.backgroundColor = "var(--am-color-action-selected)";
          } else {
            li.style.backgroundColor = "transparent";
          }
        });
      },
      onSelect: (index) => {
        const o = options[index];
        if (o) choose(o.value);
      },
      onCancel: () => close(true),
    });
    // createMenuList は style.cssText を直接受けないため、LISTBOX_CSS を直接適用する。
    list.el.style.cssText = LISTBOX_CSS;
    list.el.style.minWidth = `${el.offsetWidth}px`;

    // Tab でも閉じてボタンへ戻す（MenuList state machine は Tab を扱わないため listbox に直接張る）。
    const onListKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Tab") close(true);
    };
    list.el.addEventListener("keydown", onListKeyDown);

    portalTarget.appendChild(backdrop);
    portalTarget.appendChild(list.el);

    // floating 配置（offsetPx 4 = Select.tsx useFloating / placement bottom-start）。
    const floating = createFloating({
      reference: el,
      floating: list.el,
      placement: "bottom-start",
      offsetPx: 4,
    });

    backdrop.addEventListener("mousedown", onBackdropMouseDown);

    overlay = {
      backdrop,
      // onListKeyDown を destroy 時に外せるよう list を wrap せず直接 list を持ち、
      // close 内で list.el の listener も外す（下の close 拡張参照）。
      list: {
        ...list,
        destroy: () => {
          list.el.removeEventListener("keydown", onListKeyDown);
          list.destroy();
        },
      },
      floating,
    };

    el.setAttribute("aria-expanded", "true");

    // open 時に選択中 option をアクティブ化し、listbox（active 項目）へフォーカスする。
    list.setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    list.focusActive();
  };

  // --- combobox ボタンのイベント --------------------------------------------
  const onButtonMouseDown = (): void => {
    if (el.disabled) return;
    open();
  };
  const onButtonKeyDown = (e: KeyboardEvent): void => {
    if (el.disabled) return;
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      if (!isOpen()) open();
    }
  };
  el.addEventListener("mousedown", onButtonMouseDown);
  el.addEventListener("keydown", onButtonKeyDown);

  return {
    el,
    update(next: Partial<CreateSelectOptions<T>>) {
      let needsRender = false;
      if (next.options !== undefined) {
        options = next.options;
        needsRender = true;
      }
      if (next.value !== undefined) {
        value = next.value;
        needsRender = true;
      }
      if (next.onChange !== undefined) onChange = next.onChange;
      if (next.ariaLabel !== undefined) {
        ariaLabel = next.ariaLabel;
        applyAriaLabel();
        if (overlay) {
          if (ariaLabel) overlay.list.el.setAttribute("aria-label", ariaLabel);
          else overlay.list.el.removeAttribute("aria-label");
        }
      }
      if (next.fullWidth !== undefined) {
        fullWidth = next.fullWidth;
        applyButtonStyle();
      }
      if (next.minWidth !== undefined) {
        minWidth = next.minWidth;
        applyButtonStyle();
      }
      if (needsRender) {
        renderValue();
        // open 中に options / value が変わったら open し直す（シンプルさ優先）。
        if (overlay) {
          close(false);
          open();
        }
      }
    },
    destroy() {
      close(false);
      el.removeEventListener("mousedown", onButtonMouseDown);
      el.removeEventListener("keydown", onButtonKeyDown);
      onChange = undefined;
    },
  };
}
