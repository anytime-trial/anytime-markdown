import { describe, expect, it } from "@jest/globals";
import { THEME_PRESETS, DEFAULT_PRESET_NAME, isPresetName } from "../constants/themePresets";

describe("themePresets", () => {
  it("DEFAULT_PRESET_NAME がプリセット一覧に存在する", () => {
    expect(THEME_PRESETS[DEFAULT_PRESET_NAME]).toBeDefined();
  });

  it("全プリセットが必須プロパティを持つ", () => {
    for (const [, preset] of Object.entries(THEME_PRESETS)) {
      expect(preset.label).toBeTruthy();
      expect(preset.fontFamily).toBeTruthy();
      expect(preset.displayFont).toBeTruthy();
      expect(preset.borderRadius).toBeDefined();
      expect(preset.borderRadius.sm).toBeGreaterThanOrEqual(0);
      expect(preset.borderRadius.md).toBeGreaterThanOrEqual(preset.borderRadius.sm);
      expect(preset.borderRadius.lg).toBeGreaterThanOrEqual(preset.borderRadius.md);
      expect(preset.easing).toBeDefined();
      expect(preset.easing.enter).toBeTruthy();
      expect(preset.easing.standard).toBeTruthy();
      expect(preset.easing.exit).toBeTruthy();
    }
  });

  it("isPresetName が有効な名前を判定する", () => {
    expect(isPresetName("professional")).toBe(true);
    expect(isPresetName("comical")).toBe(true);
    expect(isPresetName("unknown")).toBe(false);
    expect(isPresetName("")).toBe(false);
  });
});
