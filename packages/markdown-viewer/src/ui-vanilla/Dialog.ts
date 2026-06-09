/**
 * 脱React の vanilla DOM Dialog ファクトリ（Phase 3 / ホスト隔離）。
 *
 * 既存 React 実装 `ui/Dialog.tsx`（+ `Dialog.module.css` / `useModalFocusTrap.ts`）の見た目・API を
 * 素 DOM で再現する。Portal 相当（呼び元で append）+ backdrop + ESC + Tab フォーカストラップ +
 * 初期フォーカス + 背景スクロールロック + 背景 a11y 隠蔽 + aria-modal を実装する。
 * テーマ色は `--am-color-*` CSS 変数（`applyEditorThemeCssVars` 注入）で追従し、React テーマ API
 * （useIsDark 等）には依存しない。`vanillaToolbar.ts` の cssText + addEventListener + attribute API
 * パターンに揃える。
 *
 * Dialog の構成パーツ（DialogTitle / DialogContent / DialogActions / DialogContentText）と
 * title の id 連携用ヘルパ（React useId 相当）も同モジュールで vanilla 提供する。
 *
 * 実装本体は sibling の `./Backdrop`（Dialog プリミティブ群）に集約済みのため、本モジュールは
 * 契約名（`createDialog` / `createDialogTitle` / … / `useDialogTitleId`）で再エクスポートする。
 * import は ui-vanilla 内（`./Backdrop`）のみで、React / MUI には依存しない。
 */

import {
  createDialog as createDialogImpl,
  createDialogActions as createDialogActionsImpl,
  createDialogContent as createDialogContentImpl,
  createDialogContentText as createDialogContentTextImpl,
  createDialogTitle as createDialogTitleImpl,
  nextDialogTitleId,
  type CreateDialogOptions,
  type VanillaContent,
} from "./Backdrop";

export type { CreateDialogOptions, VanillaContent } from "./Backdrop";

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

/**
 * MUI Dialog の置換（素 DOM）。backdrop + paper(role=dialog) + ESC + Tab フォーカストラップ +
 * 初期フォーカス + 背景スクロールロック + 背景 a11y 隠蔽 + aria-modal を実装する。
 *
 * 返り値の `el`（backdrop ルート）を `document.body` 等へ append すると開く。`destroy()` で
 * listener 解除・背景 a11y / overflow 復元・直前フォーカス復帰・el の取り外しを行う。
 *
 * @returns `el`（backdrop ルート）/ `paper`（role=dialog 要素）/ `destroy`（cleanup）。
 */
export function createDialog(opts: CreateDialogOptions): {
  el: HTMLDivElement;
  paper: HTMLDivElement;
  destroy: () => void;
} {
  return createDialogImpl(opts);
}

/** DialogTitle（h2）。`id` は aria-labelledby 連携に使う（MUI DialogTitle 置換）。 */
export function createDialogTitle(opts: CreateDialogTitleOptions = {}): {
  el: HTMLHeadingElement;
} {
  return createDialogTitleImpl(opts);
}

/** DialogContent。`dividers` で上下罫線 + 内部スクロール（MUI DialogContent 置換）。 */
export function createDialogContent(opts: CreateDialogContentOptions = {}): {
  el: HTMLDivElement;
} {
  return createDialogContentImpl(opts);
}

/** DialogActions（右寄せ flex）。アクションボタン群を並べる（MUI DialogActions 置換）。 */
export function createDialogActions(opts: CreateDialogActionsOptions = {}): {
  el: HTMLDivElement;
} {
  return createDialogActionsImpl(opts);
}

/** DialogContentText（p / body1 / text.secondary）。MUI DialogContentText 置換。 */
export function createDialogContentText(opts: CreateDialogContentTextOptions = {}): {
  el: HTMLParagraphElement;
} {
  return createDialogContentTextImpl(opts);
}

/**
 * Dialog title と aria-labelledby を連携するための一意 id を生成する。
 * React `ui/Dialog.tsx` の `useDialogTitleId`（useId）相当の vanilla ヘルパ。
 * hook ではなく純粋関数として、呼び出すたびに一意な id 文字列を返す。
 */
export function useDialogTitleId(): string {
  return nextDialogTitleId();
}

export { nextDialogTitleId } from "./Backdrop";
