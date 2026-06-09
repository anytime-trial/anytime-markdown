/**
 * 脱React の vanilla DOM Alert ファクトリ（Phase 3 / ホスト隔離）。
 *
 * 既存 React 実装 `ui/Alert.tsx`（+ `Alert.module.css`）の見た目・API を素 DOM で再現する。
 * MUI Alert(filled) 相当の snackbar 通知バナー。severity（success / error）ごとに
 * `--am-color-success-main` / `--am-color-error-main` を背景に敷き、白文字 + filled アイコン +
 * メッセージ + 任意の close ボタンで構成する。
 *
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従し、useIsDark 等の
 * React テーマ API には依存しない。`chrome/vanillaToolbar.ts` の cssText + svgIcon +
 * addEventListener パターンに揃える。
 */

import { appendContent, svgIcon, type VanillaContent } from "./dom";

export type AlertSeverity = "success" | "error";

/** severity ごとの Material アイコン SVG path（ui/Alert.tsx の ICON_PATHS と同一）。 */
const ICON_PATHS: Record<AlertSeverity, string> = {
  success:
    "M20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4C12.76,4 13.5,4.11 14.2,4.31L15.77,2.74C14.61,2.26 13.34,2 12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12M7.91,10.08L6.5,11.5L11,16L21,6L19.59,4.58L11,13.17L7.91,10.08Z",
  error:
    "M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
};

/** Material の close（×）SVG path（ui/icons.tsx の CloseIcon と同一）。 */
const CLOSE_ICON_PATH =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/** severity ごとの背景色（Alert.module.css の .success / .error と一致）。 */
const SEVERITY_BG: Record<AlertSeverity, string> = {
  success: "var(--am-color-success-main)",
  error: "var(--am-color-error-main)",
};

/** root（.root）の基本スタイル（Alert.module.css と一致）。背景は severity 別に追加する。 */
const ROOT_CSS =
  "display:flex;align-items:flex-start;box-sizing:border-box;" +
  "padding:6px 16px;border-radius:var(--am-radius-md);" +
  "font-size:0.875rem;line-height:1.43;color:#fff;";

/** アイコン枠（.icon）のスタイル。 */
const ICON_CSS = "display:flex;padding:7px 0;margin-right:12px;opacity:0.9;";

/** メッセージ枠（.message）のスタイル。 */
const MESSAGE_CSS = "padding:8px 0;min-width:0;overflow:auto;";

/** close ボタン（.close）のスタイル。color:inherit で白文字を継承。 */
const CLOSE_CSS =
  "margin-left:auto;align-self:flex-start;color:inherit;" +
  "display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;" +
  "border:none;border-radius:50%;background:transparent;cursor:pointer;padding:4px;" +
  "transition:background-color var(--am-duration-fast) var(--am-ease-standard);";

/** vanilla Alert のオプション。React `AlertProps` のうち vanilla で再現する範囲。 */
export interface CreateAlertOptions {
  /** 通知種別。既定 "success"。背景色（success/error-main）を決める。 */
  severity?: AlertSeverity;
  /** メッセージ本文。string は span、Node はそのまま、配列は順に追加。 */
  children?: VanillaContent;
  /** close ボタンのハンドラ。指定時のみ close ボタンを描画する。 */
  onClose?: () => void;
  /** 追加クラス名（root に付与）。 */
  className?: string;
  /** data-testid 属性。 */
  testId?: string;
}

/** Alert ファクトリの戻り値。 */
export interface AlertHandle {
  /** root の `<div role="alert">` 要素。 */
  el: HTMLDivElement;
  /** 可変プロパティ（severity / children / className）の更新。 */
  update: (opts: Partial<CreateAlertOptions>) => void;
  /** close ボタンの event listener 削除。 */
  destroy: () => void;
}


/**
 * MUI Alert(filled) の置換（vanilla）。snackbar 通知用に severity 色地・白文字。
 *
 * @returns `el`（div[role=alert]）と `update`（可変プロパティ反映）/ `destroy`（listener 削除）。
 */
export function createAlert(opts: CreateAlertOptions = {}): AlertHandle {
  const el = document.createElement("div");
  el.setAttribute("role", "alert");

  let severity: AlertSeverity = opts.severity ?? "success";

  const applySeverity = (s: AlertSeverity) => {
    el.style.cssText = ROOT_CSS + `background-color:${SEVERITY_BG[s]};`;
    el.setAttribute("data-severity", s);
  };
  applySeverity(severity);

  if (opts.className) el.className = opts.className;
  if (opts.testId !== undefined) el.setAttribute("data-testid", opts.testId);

  // アイコン枠（.icon）。severity 別 filled アイコンを currentColor（=白）で描画。
  const iconEl = document.createElement("span");
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.style.cssText = ICON_CSS;
  iconEl.appendChild(svgIcon(ICON_PATHS[severity], 22));
  el.appendChild(iconEl);

  const renderIcon = (s: AlertSeverity) => {
    for (const node of [...iconEl.childNodes]) iconEl.removeChild(node);
    iconEl.appendChild(svgIcon(ICON_PATHS[s], 22));
  };

  // メッセージ枠（.message）。
  const messageEl = document.createElement("span");
  messageEl.style.cssText = MESSAGE_CSS;
  if (opts.children !== undefined) appendContent(messageEl, opts.children);
  el.appendChild(messageEl);

  // close ボタン（.close）。onClose 指定時のみ描画する。
  let closeBtn: HTMLButtonElement | undefined;
  let closeHandler: (() => void) | undefined = opts.onClose;
  if (closeHandler) {
    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.style.cssText = CLOSE_CSS;
    closeBtn.appendChild(svgIcon(CLOSE_ICON_PATH, 20));
    closeBtn.addEventListener("click", closeHandler);
    el.appendChild(closeBtn);
  }

  function update(next: Partial<CreateAlertOptions>): void {
    if (next.severity !== undefined && next.severity !== severity) {
      severity = next.severity;
      applySeverity(severity);
      renderIcon(severity);
    }
    if (next.className !== undefined) el.className = next.className;
    if (next.children !== undefined) {
      for (const node of [...messageEl.childNodes]) messageEl.removeChild(node);
      appendContent(messageEl, next.children);
    }
  }

  function destroy(): void {
    if (closeBtn && closeHandler) {
      closeBtn.removeEventListener("click", closeHandler);
      closeHandler = undefined;
    }
  }

  return { el, update, destroy };
}
