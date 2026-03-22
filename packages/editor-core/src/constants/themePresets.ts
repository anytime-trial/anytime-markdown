export interface ThemePreset {
  /** UI 表示用ラベル */
  label: string;
  /** 本文フォントスタック */
  fontFamily: string;
  /** 見出し・ディスプレイフォントスタック */
  displayFont: string;
  /** 角丸 (px) */
  borderRadius: { sm: number; md: number; lg: number };
  /** イージング関数 */
  easing: {
    /** 出現用 */
    enter: string;
    /** 標準 */
    standard: string;
    /** 退場用 */
    exit: string;
  };
  /** ホバー時の追加トランスフォーム（省略時: なし） */
  hoverTransform?: string;
  /** アクセントカラー差し色（省略時: ACCENT_COLOR を使用） */
  accentColors?: string[];
}

export const THEME_PRESETS = {
  professional: {
    label: "Professional",
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    displayFont: '"Playfair Display", Georgia, "Times New Roman", serif',
    borderRadius: { sm: 4, md: 8, lg: 12 },
    easing: {
      enter: "cubic-bezier(0, 0, 0.2, 1)",
      standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
    },
  },
  comical: {
    label: "Comical",
    fontFamily: '"Nunito", "Helvetica Neue", "Arial", sans-serif',
    displayFont: '"Fredoka", "Arial Rounded MT Bold", sans-serif',
    borderRadius: { sm: 8, md: 16, lg: 24 },
    easing: {
      enter: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
    },
    hoverTransform: "translateY(-2px) scale(1.02)",
    accentColors: ["#FF4081", "#76FF03", "#B388FF"],
  },
} as const satisfies Record<string, ThemePreset>;

export type ThemePresetName = keyof typeof THEME_PRESETS;

export const PRESET_NAMES = Object.keys(THEME_PRESETS) as ThemePresetName[];

export const DEFAULT_PRESET_NAME: ThemePresetName = "professional";

export function isPresetName(value: string): value is ThemePresetName {
  return value in THEME_PRESETS;
}

export function getPreset(name: ThemePresetName): ThemePreset {
  return THEME_PRESETS[name];
}
