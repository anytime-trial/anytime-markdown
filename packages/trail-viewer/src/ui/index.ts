/**
 * trail-viewer 自前 UI キット。
 *
 * @mui/material を使わず trail-viewer 内で自己完結するコンポーネント群。
 * CSS は injectTrailUiStyles() が document.head に冪等注入する。
 * テーマ変数 (--trv-color-*) は applyTrailUiThemeVars(isDark) で documentElement に設定する。
 */

/* ---- Layout ---- */
export { Box } from "./Box";
export { Stack } from "./Stack";
export { Paper } from "./Paper";
export { Divider } from "./Divider";
export { Toolbar } from "./Toolbar";

/* ---- Typography ---- */
export { Text, Typography } from "./Text";
export type { TextVariant, TextProps } from "./Text";

/* ---- Buttons ---- */
export { Button } from "./Button";
export { ButtonBase } from "./ButtonBase";
export { ButtonGroup } from "./ButtonGroup";
export { IconButton } from "./IconButton";
export { ToggleButton } from "./ToggleButton";
export { ToggleButtonGroup } from "./ToggleButtonGroup";

/* ---- Inputs ---- */
export { TextField } from "./TextField";
export { TextareaAutosize } from "./TextareaAutosize";
export { Select } from "./Select";
export type { SelectChangeEvent } from "./Select";
export { InputAdornment } from "./InputAdornment";
export { Slider } from "./Slider";
export { Switch } from "./Switch";
export { Checkbox } from "./Checkbox";
export { Radio } from "./Radio";
export { RadioGroup } from "./RadioGroup";

/* ---- Form ---- */
export { FormControl } from "./FormControl";
export { FormLabel } from "./FormLabel";
export { InputLabel } from "./InputLabel";
export { FormControlLabel } from "./FormControlLabel";

/* ---- Navigation / Tabs ---- */
export { Tabs } from "./Tabs";
export { Tab } from "./Tab";
export type { TabProps } from "./Tab";

/* ---- Data Display ---- */
export { Chip } from "./Chip";
export { Avatar } from "./Avatar";
export { Rating } from "./Rating";
export { Table, TableContainer, TableHead, TableBody, TableRow, TableCell } from "./Table";

/* ---- Feedback / Overlays ---- */
export { Alert } from "./Alert";
export type { AlertSeverity } from "./Alert";
export { Tooltip } from "./Tooltip";
export { CircularProgress } from "./CircularProgress";
export { LinearProgress } from "./LinearProgress";
export { Skeleton } from "./Skeleton";
export { Menu } from "./Menu";
export type { MenuPosition, MenuProps } from "./Menu";
export { MenuItem } from "./MenuItem";
export { Dialog } from "./Dialog";
export { DialogTitle } from "./DialogTitle";
export { DialogContent } from "./DialogContent";
export { DialogActions } from "./DialogActions";

/* ---- List ---- */
export { List } from "./List";
export { ListItem } from "./ListItem";
export { ListItemButton } from "./ListItemButton";
export { ListItemIcon } from "./ListItemIcon";
export { ListItemText } from "./ListItemText";

/* ---- Collapse ---- */
export { Collapse } from "./Collapse";

/* ---- Foundation ---- */
export { injectTrailUiStyles } from "./injectStyles";
export { applyTrailUiThemeVars, trailUiCssVars } from "./tokens";
export { sxToStyle, mapColorToken } from "./sx";

/* ---- Icons (stub — icons.tsx を追加した時点で解決される) ---- */
export * from "./icons";
