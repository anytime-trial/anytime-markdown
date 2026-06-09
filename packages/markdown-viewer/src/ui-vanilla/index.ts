/**
 * vanilla DOM ファクトリのエクスポート集約（脱React chrome 用 UI プリミティブ）。
 *
 * React 非依存・`--am-color-*` CSS 変数でテーマ追従する素 DOM 部品を提供する。
 */

export {
  appendContent,
  applyStyle,
  FOCUSABLE,
  svgIcon,
  type VanillaContent,
} from "./dom";

export {
  createButton,
  type ButtonColor,
  type ButtonSize,
  type ButtonVariant,
  type CreateButtonOptions,
} from "./Button";

export {
  createIconButton,
  type CreateIconButtonOptions,
  type IconButtonHandle,
  type IconButtonSize,
} from "./IconButton";

export {
  createText,
  type CreateTextOptions,
  type TextChild,
  type TextHandle,
  type TextVariant,
} from "./Text";

export { createDivider, type CreateDividerOptions } from "./Divider";

export { createSpinner, type CreateSpinnerOptions } from "./Spinner";

export { createBackdrop, type CreateBackdropOptions } from "./Backdrop";

export {
  createAlert,
  type AlertHandle,
  type AlertSeverity,
  type CreateAlertOptions,
} from "./Alert";

export {
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogContentText,
  createDialogTitle,
  nextDialogTitleId,
  type CreateDialogActionsOptions,
  type CreateDialogContentOptions,
  type CreateDialogContentTextOptions,
  type CreateDialogOptions,
  type CreateDialogTitleOptions,
} from "./Dialog";
