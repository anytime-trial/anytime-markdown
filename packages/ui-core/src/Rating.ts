/**
 * 脱React の vanilla DOM ファクトリ — Rating（MUI Rating / `trail-viewer/src/ui/Rating.tsx` 置換）。
 *
 * 星評価コンポーネント（`<span>` + 複数 `<button>`）。
 * - 最大星数 `max`（既定 5）の星ボタンを生成し、選択値以下を塗り済み（★）で描画する。
 * - `readOnly` / `disabled` のとき星ボタンは pointer-events を無効化する。
 * - hover エフェクト（ホバー中の星を塗り済みで表示）を `mouseenter` / `mouseleave` で再現する。
 * - `setValue(v)` ハンドルで現在の選択値を外部から更新できる。
 *
 * React 版の `onChange(e, value)` は `onClick(value)` に変換。`sx` は受理しない（ui-core 方針）。
 * テーマ色は `--am-color-*` CSS 変数で追従する。
 */

import { applyStyle, ensureStyle } from "./dom";

const RATING_STYLE_ID = "am-ui-rating-styles";

/** Rating の共有 CSS を 1 度だけ注入する。 */
function ensureRatingStyles(): void {
  ensureStyle(
    RATING_STYLE_ID,
    ".am-rating{display:inline-flex;align-items:center;}" +
      ".am-rating-btn{display:inline-flex;align-items:center;justify-content:center;" +
      "background:none;border:0;padding:2px;margin:0;cursor:pointer;" +
      "color:var(--am-color-warning-main,#ed6c02);font-size:1.5rem;line-height:1;" +
      "transition:color 0.15s;}" +
      ".am-rating-btn:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:2px;}" +
      ".am-rating-btn:disabled{cursor:default;pointer-events:none;color:var(--am-color-action-disabled,rgba(0,0,0,0.26));}" +
      ".am-rating--small .am-rating-btn{font-size:1.125rem;}" +
      ".am-rating--large .am-rating-btn{font-size:2rem;}" +
      ".am-rating--readonly .am-rating-btn{cursor:default;pointer-events:none;}",
  );
}

/** {@link createRating} のオプション。`trail-viewer/src/ui/Rating.tsx` の RatingProps 対応範囲。 */
export interface CreateRatingOptions {
  /** 初期値（null は未評価）。 */
  value?: number | null;
  /** 最大星数（既定 5）。 */
  max?: number;
  /** 読み取り専用（クリック・ホバー無効）。 */
  readOnly?: boolean;
  /** 無効化（クリック・ホバー無効、グレーアウト）。 */
  disabled?: boolean;
  /** サイズ（既定 "medium"）。 */
  size?: "small" | "medium" | "large";
  /** 星クリック時のコールバック。引数は新しい値（同じ星の場合は null）。 */
  onClick?: (value: number | null) => void;
  /** 追加クラス名。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
  /** 追加スタイル（cssText の後に上書き）。 */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * MUI Rating 相当の vanilla 版（`trail-viewer/src/ui/Rating.tsx` 置換）。
 *
 * @returns `el`（`<span class="am-rating">`）と `setValue(v)` ハンドル。
 *   `setValue` で選択値を変更すると星の塗り状態が再描画される。
 */
export function createRating(opts: CreateRatingOptions = {}): {
  el: HTMLSpanElement;
  setValue: (v: number | null) => void;
  /** 全イベントリスナーを除去してリソースを解放する。 */
  destroy: () => void;
} {
  ensureRatingStyles();

  const max = opts.max ?? 5;
  const readOnly = opts.readOnly ?? false;
  const disabled = opts.disabled ?? false;
  let currentValue: number | null = opts.value ?? null;
  let hoverValue = -1;
  let onClick = opts.onClick;

  const el = document.createElement("span");
  const classes = [
    "am-rating",
    opts.size === "small" ? "am-rating--small" : "",
    opts.size === "large" ? "am-rating--large" : "",
    readOnly ? "am-rating--readonly" : "",
    opts.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  el.className = classes;

  // Interactive rating → radiogroup; read-only → img
  if (readOnly || disabled) {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${currentValue ?? 0}/${max} stars`);
  } else {
    el.setAttribute("role", "radiogroup");
  }

  if (opts.testId) el.setAttribute("data-testid", opts.testId);
  applyStyle(el, opts.style);

  /** 現在の displayValue（ホバー中はホバー値を優先）に基づき全星ボタンを再描画する。 */
  const renderStars = (): void => {
    const displayValue = hoverValue > 0 ? hoverValue : (currentValue ?? 0);
    if (readOnly || disabled) {
      el.setAttribute("aria-label", `${currentValue ?? 0}/${max} stars`);
    } else {
      el.setAttribute("aria-label", `${currentValue ?? 0} stars`);
    }
    for (let i = 0; i < starBtns.length; i++) {
      const starValue = i + 1;
      const filled = starValue <= displayValue;
      starBtns[i].textContent = filled ? "★" : "☆";
      if (!readOnly && !disabled) {
        starBtns[i].setAttribute("aria-checked", String(starValue === (currentValue ?? 0)));
      }
    }
  };

  // 星ボタンを生成する。
  const starBtns: HTMLButtonElement[] = [];
  // リスナー参照（destroy 用）
  const listeners: Array<{ btn: HTMLButtonElement; type: string; handler: EventListener }> = [];

  const addListener = (btn: HTMLButtonElement, type: string, handler: EventListener): void => {
    btn.addEventListener(type, handler);
    listeners.push({ btn, type, handler });
  };

  for (let i = 0; i < max; i++) {
    const starValue = i + 1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "am-rating-btn";
    btn.setAttribute("aria-label", `${starValue} star${starValue !== 1 ? "s" : ""}`);
    if (disabled) btn.disabled = true;

    if (!readOnly && !disabled) {
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");

      addListener(btn, "mouseenter", () => {
        hoverValue = starValue;
        renderStars();
      });
      addListener(btn, "mouseleave", () => {
        hoverValue = -1;
        renderStars();
      });
      addListener(btn, "click", () => {
        const next = starValue === currentValue ? null : starValue;
        currentValue = next;
        hoverValue = -1;
        renderStars();
        onClick?.(next);
      });
    }

    starBtns.push(btn);
    el.appendChild(btn);
  }

  // ArrowLeft / ArrowRight keyboard navigation (interactive only)
  const onKeyDown = (e: KeyboardEvent): void => {
    if (readOnly || disabled) return;
    const focused = document.activeElement;
    const idx = starBtns.indexOf(focused as HTMLButtonElement);
    if (idx === -1) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(idx + 1, max - 1);
      starBtns[next].focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(idx - 1, 0);
      starBtns[next].focus();
    }
  };
  if (!readOnly && !disabled) {
    el.addEventListener("keydown", onKeyDown);
  }

  renderStars();

  return {
    el,
    setValue(v: number | null) {
      currentValue = v;
      renderStars();
    },
    destroy(): void {
      for (const { btn, type, handler } of listeners) {
        btn.removeEventListener(type, handler);
      }
      listeners.length = 0;
      if (!readOnly && !disabled) {
        el.removeEventListener("keydown", onKeyDown);
      }
      onClick = undefined;
    },
  };
}
