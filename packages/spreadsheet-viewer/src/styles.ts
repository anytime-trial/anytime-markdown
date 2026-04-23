export const DARK_DIVIDER = "rgba(255,255,255,0.12)";
export const LIGHT_DIVIDER = "rgba(0,0,0,0.12)";

export function getDivider(isDark: boolean): string {
  return isDark ? DARK_DIVIDER : LIGHT_DIVIDER;
}
