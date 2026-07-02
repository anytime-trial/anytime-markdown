/**
 * 脱React の vanilla DOM Tooltip ファクトリ（MUI Tooltip / ui/Tooltip.tsx 置換）。
 *
 * 既存 React 実装 `ui/Tooltip.tsx`（+ `Tooltip.module.css`）の見た目・API・a11y を素 DOM で
 * 再現する。引数で受けた対象要素（reference）に hover / focus の listener を装着し、open 時に
 * tooltip(`role="tooltip"`) を Portal 相当（document.body）へ append、`createFloating`（offset /
 * flip / shift + autoUpdate）で viewport 端でも見切れない配置を行う。open 中は reference に
 * `aria-describedby` を張る。
 *
 * テーマ色は `--am-color-tooltip-*` / `--am-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し
 * React hook（useIsDark 等）には依存しない。共有 helper（appendContent）は `./dom` から import
 * （再実装禁止）。floating は `./floating` の createFloating を再利用する。
 */

import { appendContent, type VanillaContent } from "./dom";
import { createFloating, type Placement } from "./floating";

let tooltipIdSeq = 0;

/** Tooltip の一意 id を生成する（React useId 相当）。aria-describedby 連携に使う。 */
function nextTooltipId(): string {
  tooltipIdSeq += 1;
  return `am-tooltip-${tooltipIdSeq}`;
}

/**
 * tooltip 本体の cssText（Tooltip.module.css .tooltip 相当）。z-index 13000。位置は createFloating が付与。
 *
 * multiline=false（既定）は単一行（white-space:nowrap）。multiline=true は改行を保持し
 * （white-space:pre-line）max-width を緩める。複数行の説明テキスト（`\n` 区切り）を渡す用途。
 */
function tooltipCss(multiline: boolean): string {
  return (
    `z-index:13000;max-width:${multiline ? "min(420px, 90vw)" : "320px"};` +
    "padding:var(--am-space-1) var(--am-space-2);border-radius:var(--am-radius-sm);" +
    "background:var(--am-color-tooltip-bg);color:var(--am-color-tooltip-text);" +
    `font-size:0.6875rem;line-height:1.4;pointer-events:none;white-space:${multiline ? "pre-line" : "nowrap"};`
  );
}

/** {@link createTooltip} のオプション。MUI Tooltip（ui/Tooltip.tsx）置換。 */
export interface CreateTooltipOptions {
  /**
   * tooltip を張る対象要素（React の children 相当）。hover / focus の listener を装着する。
   */
  reference: HTMLElement;
  /** tooltip の中身（string / Node / その配列）。React `title` 相当。 */
  title: VanillaContent;
  /** 希望配置。衝突時は flip で反転する。既定 "bottom"（React Tooltip と同値）。 */
  placement?: Placement;
  /** tooltip を append する portal ルート（既定 document.body）。 */
  portalRoot?: HTMLElement;
  /**
   * 複数行表示。true で `\n` を改行として保持し（white-space:pre-line）max-width を緩める。
   * 既定 false（単一行 nowrap）。複数行の説明テキストを渡す場合に指定する。
   */
  multiline?: boolean;
}

/**
 * vanilla Tooltip を生成する。
 *
 * 返り値の `update` で title を差し替え、`destroy` で listener 解除・open 中の tooltip 撤去・
 * autoUpdate 解除・reference の `aria-describedby` 復元を行う。`open()` / `close()` で外部から
 * 表示制御もできる（hover / focus と独立）。
 *
 * - reference の `mouseenter` / `focusin` で open、`mouseleave` / `focusout` で close。
 * - open 時のみ tooltip を portalRoot へ append し、createFloating で配置 + autoUpdate 購読。
 * - open 中は reference に `aria-describedby={tooltipId}` を張り、close 時に元の値へ戻す。
 *
 * @returns `el`（tooltip 要素）と `update` / `open` / `close` / `destroy`。
 */
export function createTooltip(opts: CreateTooltipOptions): {
  el: HTMLDivElement;
  update: (next: { title: VanillaContent }) => void;
  open: () => void;
  close: () => void;
  destroy: () => void;
} {
  const { reference, placement = "bottom", multiline = false } = opts;
  const portalRoot = opts.portalRoot ?? document.body;
  const id = nextTooltipId();

  // tooltip 本体（open 時に portalRoot へ append、close 時に detach）。
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "tooltip");
  el.setAttribute("data-am-tooltip", "");
  el.style.cssText = tooltipCss(multiline);
  appendContent(el, opts.title);

  let floating: { update: () => void; destroy: () => void } | null = null;
  let isOpen = false;
  let destroyed = false;

  // open 時に上書きする前の aria-describedby を退避する（close 時に復元）。
  const prevDescribedBy = reference.getAttribute("aria-describedby");

  const open = (): void => {
    if (destroyed || isOpen) return;
    isOpen = true;
    reference.setAttribute("aria-describedby", id);
    portalRoot.appendChild(el);
    floating = createFloating({
      reference,
      floating: el,
      placement,
    });
  };

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    floating?.destroy();
    floating = null;
    // aria-describedby を元の値へ戻す（無ければ削除）。
    if (prevDescribedBy === null) {
      reference.removeAttribute("aria-describedby");
    } else {
      reference.setAttribute("aria-describedby", prevDescribedBy);
    }
    el.remove();
  };

  // hover / focus の listener（React onMouseEnter/Leave/Focus/Blur 相当）。
  const onMouseEnter = (): void => open();
  const onMouseLeave = (): void => close();
  const onFocusIn = (): void => open();
  const onFocusOut = (): void => close();
  reference.addEventListener("mouseenter", onMouseEnter);
  reference.addEventListener("mouseleave", onMouseLeave);
  reference.addEventListener("focusin", onFocusIn);
  reference.addEventListener("focusout", onFocusOut);

  return {
    el,
    update(next: { title: VanillaContent }) {
      for (const node of [...el.childNodes]) el.removeChild(node);
      appendContent(el, next.title);
      // open 中なら再配置（内容変更で寸法が変わるため）。
      floating?.update();
    },
    open,
    close,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      close();
      reference.removeEventListener("mouseenter", onMouseEnter);
      reference.removeEventListener("mouseleave", onMouseLeave);
      reference.removeEventListener("focusin", onFocusIn);
      reference.removeEventListener("focusout", onFocusOut);
    },
  };
}
