/**
 * vanilla DOM ファクトリのエクスポート集約（脱React chrome 用 UI プリミティブ）。
 *
 * React 非依存・`--am-color-*` CSS 変数でテーマ追従する素 DOM 部品を提供する。
 * 依存方向は chrome → ui-vanilla → dom（逆流させない）。
 */

// --- 共通 helper / hook の素関数版 ---
export {
  appendContent,
  applyStyle,
  ensureStyle,
  FOCUSABLE,
  nextId,
  svgIcon,
  TRANSPARENT_BACKDROP_CSS,
  type VanillaContent,
} from "./dom";
export {
  createTransitionMount,
  type CreateTransitionMountOptions,
  type TransitionMountState,
} from "./transitionMount";
export { createFocusTrap, type CreateFocusTrapOptions } from "./focusTrap";
export {
  createFloating,
  createVirtualAnchor,
  type CreateFloatingOptions,
  type FloatingState,
  type Placement,
} from "./floating";
export {
  createMediaQuery,
  type CreateMediaQueryOptions,
  type MediaQueryHandle,
  type MediaQueryListener,
} from "./mediaQuery";
export { createClickAway, type CreateClickAwayOptions } from "./clickAway";

// --- simple ---
export { createBox, type CreateBoxOptions } from "./Box";
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
  createPaper,
  type CreatePaperOptions,
  type PaperElevation,
  type PaperVariant,
} from "./Paper";
export { createStack, type CreateStackOptions, type StackDirection } from "./Stack";
export {
  createProgressBar,
  type CreateProgressBarOptions,
  type ProgressBarHandle,
  type ProgressBarVariant,
} from "./ProgressBar";
export {
  createSkeleton,
  type CreateSkeletonOptions,
  type SkeletonVariant,
} from "./Skeleton";
export {
  createTab,
  createTabs,
  type CreateTabOptions,
  type CreateTabsOptions,
  type TabsItemOptions,
} from "./Tabs";

// --- interactive ---
export {
  createChip,
  type ChipSize,
  type ChipVariant,
  type CreateChipOptions,
} from "./Chip";
export { createSwitch, type CreateSwitchOptions } from "./Switch";
export {
  createSlider,
  type CreateSliderOptions,
  type SliderHandle,
  type SliderSize,
} from "./Slider";
export {
  createTextField,
  type CreateTextFieldOptions,
  type TextFieldHandle,
  type TextFieldSize,
} from "./TextField";
export { createCollapse, type CreateCollapseOptions } from "./Collapse";
export {
  createToggleButton,
  createToggleButtonGroup,
  type CreateToggleButtonGroupOptions,
  type CreateToggleButtonOptions,
  type ToggleGroupHandle,
  type ToggleSize,
  type ToggleVariant,
} from "./ToggleButton";
export {
  createFormControlLabel,
  createRadio,
  createRadioGroup,
  type CreateFormControlLabelOptions,
  type CreateRadioGroupOptions,
  type CreateRadioOptions,
  type RadioGroupChild,
  type RadioGroupRegistration,
  type RadioSize,
} from "./Radio";

// --- positioned ---
export { createTooltip, type CreateTooltipOptions } from "./Tooltip";
export { createPopover, type CreatePopoverOptions } from "./Popover";
export {
  createSnackbar,
  type CreateSnackbarOptions,
  type SnackbarAnchorOrigin,
} from "./Snackbar";

// --- complex ---
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
export { createMenuList, type CreateMenuListOptions } from "./MenuList";
export { createMenuItem, type CreateMenuItemOptions } from "./MenuItem";
export { createListItemIcon, type CreateListItemIconOptions } from "./ListItemIcon";
export { createListItemText, type CreateListItemTextOptions } from "./ListItemText";
export { createMenu, type CreateMenuOptions } from "./Menu";
export {
  createSelect,
  type CreateSelectOptions,
  type SelectOption,
} from "./Select";
export { createDrawer, type CreateDrawerOptions, type DrawerAnchor } from "./Drawer";
export { confirmWithDialog, type ConfirmWithDialogOptions } from "./confirmDialog";
export {
  createTable,
  type CreateTableOptions,
  type TableController,
  type TableColumn,
  type TableCellAlign,
  type TableSize,
} from "./Table";

// --- trail-viewer parity 層（S0: vanilla 化のために追加したプリミティブ + アイコン） ---
// icons.ts は createIcon / IconFactory / IconOptions / IconFontSize + 49 アイコンを公開。
export * from "./icons";
export { createButtonBase, type CreateButtonBaseOptions } from "./ButtonBase";
export { createButtonGroup, type CreateButtonGroupOptions } from "./ButtonGroup";
export { createToolbar, type CreateToolbarOptions } from "./Toolbar";
export { createAvatar, type CreateAvatarOptions } from "./Avatar";
export { createRating, type CreateRatingOptions } from "./Rating";
export { createCheckbox, type CreateCheckboxOptions } from "./Checkbox";
export { createFormControl, type CreateFormControlOptions } from "./FormControl";
export { createFormLabel, type CreateFormLabelOptions } from "./FormLabel";
export {
  createInputAdornment,
  type CreateInputAdornmentOptions,
} from "./InputAdornment";
export { createInputLabel, type CreateInputLabelOptions } from "./InputLabel";
export {
  createTextareaAutosize,
  type CreateTextareaAutosizeOptions,
} from "./TextareaAutosize";
export { createList, type CreateListOptions } from "./List";
export { createListItem, type CreateListItemOptions } from "./ListItem";
export {
  createListItemButton,
  type CreateListItemButtonOptions,
} from "./ListItemButton";
