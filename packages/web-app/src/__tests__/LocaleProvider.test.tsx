import { renderHook, act } from "@testing-library/react";
import React from "react";

// next-intl の NextIntlClientProvider をモック（children をそのまま返す）
jest.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { LocaleProvider, useLocaleSwitch } from "../app/LocaleProvider";

describe("useLocaleSwitch (via LocaleProvider)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "NEXT_LOCALE=; max-age=0";
  });

  const createWrapper =
    (serverLocale: string) =>
    ({ children }: { children: React.ReactNode }) => (
      <LocaleProvider serverLocale={serverLocale}>{children}</LocaleProvider>
    );

  test("localStorage が空の場合は serverLocale を使用する", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("en"),
    });
    expect(result.current.locale).toBe("en");
  });

  test("localStorage の値を serverLocale より優先する", () => {
    localStorage.setItem("NEXT_LOCALE", "en");
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });
    expect(result.current.locale).toBe("en");
  });

  test("デフォルトは ja", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("unknown"),
    });
    expect(result.current.locale).toBe("ja");
  });

  test("setLocale でロケールを切替し localStorage に永続化する", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });

    act(() => {
      result.current.setLocale("en");
    });

    expect(result.current.locale).toBe("en");
    expect(localStorage.getItem("NEXT_LOCALE")).toBe("en");
    expect(document.cookie).toContain("NEXT_LOCALE=en");
  });

  test("不正なロケールは無視する", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });

    act(() => {
      result.current.setLocale("fr");
    });

    expect(result.current.locale).toBe("ja");
  });

  test("Provider 外で useLocaleSwitch を使うとエラー", () => {
    expect(() => {
      renderHook(() => useLocaleSwitch());
    }).toThrow("useLocaleSwitch must be used within LocaleProvider");
  });
});
