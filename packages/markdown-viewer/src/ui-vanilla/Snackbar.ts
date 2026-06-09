/**
 * 脱React の vanilla DOM Snackbar ファクトリ（MUI Snackbar / ui/Snackbar.tsx + .module.css 置換）。
 *
 * Portal 相当（document.body へ append）+ anchorOrigin 配置 + フェード/スライド遷移 +
 * autoHideDuration タイマーを素 DOM で再現する。テーマ色は `--am-color-*` / `--am-*` CSS 変数で
 * 追従し、React テーマ API（useIsDark 等）には依存しない。
 *
 * マウント/遷移ライフサイクルは `createTransitionMount`（前フェーズ生成）を再利用する:
 * - `setOpen(true)`: body へ append（mounted）→ 次フレームで visible（opacity 0→1 / translateY）。
 * - `setOpen(false)`: visible を落とし（フェードアウト）、timeout 経過後に body から取り外す。
 *
 * autoHideDuration が指定され open のときのみ、その ms 経過で `onClose` を 1 度発火する。
 * `destroy()` で transitionMount の進行中タイマー・autoHide タイマー・el の取り外しを行う。
 */

import { appendContent, type VanillaContent } from "./dom";
import { createTransitionMount } from "./transitionMount";

/** Snackbar の配置原点（React `SnackbarAnchorOrigin` と同義）。 */
export interface SnackbarAnchorOrigin {
  vertical: "top" | "bottom";
  horizontal: "left" | "center" | "right";
}

/** {@link createSnackbar} のオプション。MUI Snackbar（ui/Snackbar.tsx）置換。 */
export interface CreateSnackbarOptions {
  /** 初期 open 状態。既定 false。 */
  open?: boolean;
  /** 自動非表示までの ms。null / 未指定で無効。 */
  autoHideDuration?: number | null;
  /** autoHideDuration 経過時のコールバック。 */
  onClose?: () => void;
  /** 配置原点。既定 { vertical: "bottom", horizontal: "center" }。 */
  anchorOrigin?: SnackbarAnchorOrigin;
  /** フェード/スライド時間(ms)。既定 225。 */
  timeout?: number;
  /** Snackbar 内の中身（Alert 等）。 */
  children?: VanillaContent;
  /** body 以外へ portal する場合のコンテナ（既定 document.body）。 */
  container?: HTMLElement;
}

const DEFAULT_ANCHOR: SnackbarAnchorOrigin = { vertical: "bottom", horizontal: "center" };

/** anchorOrigin から root の cssText 断片（配置 + 初期 transform）を返す。.module.css と一字対応。 */
function anchorCss(anchor: SnackbarAnchorOrigin): string {
  // vertical: bottom=24px / translateY(16px)、top=24px / translateY(-16px)。
  const vertical =
    anchor.vertical === "top"
      ? "top:24px;transform:translateY(-16px);"
      : "bottom:24px;transform:translateY(16px);";
  // horizontal: justify-content（left=flex-start / center=center / right=flex-end）。
  let justify = "center";
  if (anchor.horizontal === "left") justify = "flex-start";
  else if (anchor.horizontal === "right") justify = "flex-end";
  return vertical + `justify-content:${justify};`;
}

/**
 * vanilla Snackbar を生成する（素 DOM）。
 *
 * 返り値の `setOpen(open)` で表示/非表示を切り替える（open=true で container へ append しフェードイン、
 * open=false でフェードアウト後に取り外す）。`destroy()` で全タイマー解除 + el の取り外しを行う。
 *
 * @returns `el`（root div）と `setOpen` / `update` / `destroy`。
 */
export function createSnackbar(opts: CreateSnackbarOptions = {}): {
  el: HTMLDivElement;
  setOpen: (open: boolean) => void;
  update: (next: Partial<CreateSnackbarOptions>) => void;
  destroy: () => void;
} {
  const timeout = opts.timeout ?? 225;
  let anchor: SnackbarAnchorOrigin = opts.anchorOrigin ?? DEFAULT_ANCHOR;
  let autoHideDuration: number | null = opts.autoHideDuration ?? null;
  let onClose = opts.onClose;
  const container = opts.container ?? document.body;

  const el = document.createElement("div");
  el.setAttribute("data-am-snackbar", "");

  // ui/Snackbar.module.css .root + anchor クラス相当を cssText に展開。
  // --snackbar-duration は timeout 連動。初期 opacity:0（visible で 1）。
  const baseCss =
    "position:fixed;z-index:1400;left:8px;right:8px;display:flex;" +
    "pointer-events:none;opacity:0;" +
    "transition:opacity var(--snackbar-duration," +
    `${timeout}ms) var(--am-ease-standard, ease),` +
    "transform var(--snackbar-duration," +
    `${timeout}ms) var(--am-ease-standard, ease);`;
  const applyLayout = (): void => {
    el.style.cssText = baseCss + anchorCss(anchor);
    el.style.setProperty("--snackbar-duration", `${timeout}ms`);
  };
  applyLayout();
  appendContent(el, opts.children);

  // autoHide タイマー（open かつ autoHideDuration 指定時のみ）。
  let autoHideId: ReturnType<typeof setTimeout> | null = null;
  const clearAutoHide = (): void => {
    if (autoHideId !== null) {
      clearTimeout(autoHideId);
      autoHideId = null;
    }
  };
  const scheduleAutoHide = (open: boolean): void => {
    clearAutoHide();
    if (!open || autoHideDuration == null) return;
    autoHideId = setTimeout(() => {
      autoHideId = null;
      onClose?.();
    }, autoHideDuration);
  };

  // マウント/遷移ライフサイクル。mounted=true で container へ append（Portal 相当）、
  // visible で .visible（opacity:1 / translateY(0)）を反映する。
  const tm = createTransitionMount({
    open: opts.open ?? false,
    timeout,
    unmountOnExit: true,
    onMountedChange(mounted) {
      if (mounted) {
        container.appendChild(el);
      } else {
        el.remove();
      }
    },
    onVisibleChange(visible) {
      // .visible: opacity:1; transform:translateY(0)。非 visible は anchor の初期 transform に戻す。
      if (visible) {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      } else {
        el.style.opacity = "0";
        el.style.transform =
          anchor.vertical === "top" ? "translateY(-16px)" : "translateY(16px)";
      }
    },
  });

  // 初期 open=true のときは即 mounted（container へ append）+ visible にする
  // （createTransitionMount は初期 open を副作用なしで状態反映するのみのため）。
  if (opts.open) {
    container.appendChild(el);
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
    scheduleAutoHide(true);
  }

  const setOpen = (open: boolean): void => {
    tm.setOpen(open);
    scheduleAutoHide(open);
  };

  return {
    el,
    setOpen,
    update(next) {
      if (next.anchorOrigin !== undefined) {
        anchor = next.anchorOrigin;
        const { mounted, visible } = tm.getState();
        applyLayout();
        // 現在の visible 状態に応じて transform/opacity を再適用（applyLayout で初期化されるため）。
        if (visible) {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
        }
        // mounted=false（DOM 未付与）でも cssText だけは更新済み。
        void mounted;
      }
      if (next.onClose !== undefined) onClose = next.onClose;
      if (next.autoHideDuration !== undefined) {
        autoHideDuration = next.autoHideDuration;
        // open 中なら新しい duration で再スケジュールする。
        if (tm.getState().mounted) scheduleAutoHide(true);
      }
      if (next.children !== undefined) {
        for (const node of [...el.childNodes]) el.removeChild(node);
        appendContent(el, next.children);
      }
    },
    destroy() {
      clearAutoHide();
      tm.dispose();
      el.remove();
    },
  };
}
