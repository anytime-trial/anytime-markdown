import { renderHook, act } from "@testing-library/react";
import { useEditorSettings, DEFAULT_SETTINGS } from "../useEditorSettings";

const SETTINGS_KEY = "markdown-editor-settings";

describe("useEditorSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("初期状態でデフォルト設定を返す", () => {
    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("localStorageから設定を復元する", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ fontSize: 18, lineHeight: 1.8 }),
    );

    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings.fontSize).toBe(18);
    expect(result.current.settings.lineHeight).toBe(1.8);
    // 未保存のキーはデフォルト値
    expect(result.current.settings.tableWidth).toBe(DEFAULT_SETTINGS.tableWidth);
  });

  test("updateSettingsで設定を更新しlocalStorageに永続化", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSettings({ fontSize: 20 });
    });

    expect(result.current.settings.fontSize).toBe(20);
    // 他の設定は変更されない
    expect(result.current.settings.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);

    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(stored.fontSize).toBe(20);
  });

  test("resetSettingsでデフォルトに戻しlocalStorageから削除", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSettings({ fontSize: 20, lineHeight: 2.0 });
    });

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  test("localStorageの値が壊れている場合はデフォルトにフォールバック", () => {
    localStorage.setItem(SETTINGS_KEY, "not-json{{{");

    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("部分的な設定のみ保存されている場合、残りはデフォルトで補完", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontSize: 16 }));

    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      fontSize: 16,
    });
  });
});
