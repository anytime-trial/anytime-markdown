import { DEFAULT_SETTINGS, type EditorSettings } from "../../editorSettings";
import type { ToolbarModeState } from "../../types/toolbar";

/**
 * chrome の初期状態（設定・モード）の解決。
 *
 * ホストは同じ関心に対して複数の prop を持つ（`settings` と `initialFontSize`、`settings` と
 * `defaultFontSize` / `defaultBlockAlign`）。どれが優先されるかは prop 名からは読み取れないため、
 * 優先順位の規則をこの 3 関数へ閉じ込める。
 *
 * - `initialFontSize`: マウント時に一度だけ効く初期値（以後はユーザー操作が上書きする）
 * - `default*`: ホストが常時強制する値（ユーザー設定より優先し、毎回の実効値計算で被せる）
 */

/** 初期設定に関わる prop。 */
export interface InitialSettingsProps {
  readonly settings?: EditorSettings;
  readonly initialFontSize?: number;
}

/** ホストが常時強制する設定の prop。 */
export interface SettingsOverrideProps {
  readonly defaultFontSize?: number;
  readonly defaultBlockAlign?: "left" | "center" | "right";
}

/** 初期モード状態に関わる prop。 */
export interface InitialModeProps {
  readonly readOnly?: boolean;
  readonly defaultOutlineOpen?: boolean;
  readonly defaultNoteGraphOpen?: boolean;
}

/** マウント時の設定。`initialFontSize` は settings のフォントサイズより優先する。 */
export function resolveInitialSettings(props: InitialSettingsProps): EditorSettings {
  const settings = { ...(props.settings ?? DEFAULT_SETTINGS) };
  if (props.initialFontSize) settings.fontSize = props.initialFontSize;
  return settings;
}

/** 実効設定 = 現在の設定にホスト強制値を被せたもの。 */
export function applySettingsOverrides(
  settings: EditorSettings,
  overrides: SettingsOverrideProps,
): EditorSettings {
  return {
    ...settings,
    ...(overrides.defaultFontSize ? { fontSize: overrides.defaultFontSize } : {}),
    ...(overrides.defaultBlockAlign ? { blockAlign: overrides.defaultBlockAlign } : {}),
  };
}

/** モード状態の初期値。開閉系はホストの default* があればそれ、無ければ閉じた状態。 */
export function createInitialModeState(props: InitialModeProps): ToolbarModeState {
  return {
    sourceMode: false,
    readonlyMode: false,
    hostReadOnly: props.readOnly ?? false,
    reviewMode: false,
    outlineOpen: props.defaultOutlineOpen ?? false,
    inlineMergeOpen: false,
    commentOpen: false,
    explorerOpen: false,
    noteGraphOpen: props.defaultNoteGraphOpen ?? false,
  };
}
