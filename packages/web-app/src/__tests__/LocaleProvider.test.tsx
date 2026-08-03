import { renderHook, act } from "@testing-library/react";
import React from "react";

// next-intl の NextIntlClientProvider をモック（children をそのまま返す）
jest.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// 自己完結 i18n プロバイダを mock し、markdown-core の重い依存（ESM ライブラリ等）を巻き込まないようにする
jest.mock("@anytime-markdown/markdown-react-islands", () => ({
  MarkdownCoreI18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// messages.ts が読み込む i18n メッセージ束（元は en.json / ja.json を個別に mock していたが、
// 公開 subpath 経由へ移行したため実際に読まれるモジュールを mock する）
jest.mock("@anytime-markdown/markdown-editor/i18n/messages", () => ({
  enMessages: {},
  jaMessages: {},
}));
jest.mock("@anytime-markdown/spreadsheet-viewer", () => ({
  SpreadsheetI18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@anytime-markdown/database-viewer", () => ({
  DatabaseI18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { LocaleProvider, useLocaleSwitch } from "../app/[locale]/LocaleProvider";
import {
  __resetNavigationMock,
  __setMockPathname,
  mockRouter,
} from "../__mocks__/i18nNavigation";

describe("useLocaleSwitch (via LocaleProvider)", () => {
  beforeEach(() => {
    __resetNavigationMock();
    localStorage.clear();
  });

  const createWrapper =
    (serverLocale: string) =>
    ({ children }: { children: React.ReactNode }) => (
      <LocaleProvider serverLocale={serverLocale}>{children}</LocaleProvider>
    );

  test("URL 由来の serverLocale をそのまま使う", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("en"),
    });
    expect(result.current.locale).toBe("en");
  });

  test("localStorage は参照しない（URL がロケールの唯一の決定要因）", () => {
    localStorage.setItem("NEXT_LOCALE", "en");
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });
    expect(result.current.locale).toBe("ja");
  });

  test("ブラウザ言語で自動切替しない", () => {
    const langSpy = jest.spyOn(window.navigator, "language", "get").mockReturnValue("en-US");
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });
    expect(result.current.locale).toBe("ja");
    expect(mockRouter.replace).not.toHaveBeenCalled();
    langSpy.mockRestore();
  });

  test("未知の serverLocale は既定ロケール（ja）へ縮退する", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("unknown"),
    });
    expect(result.current.locale).toBe("ja");
  });

  test("setLocale は同じパスの対応ロケールへ遷移する", () => {
    __setMockPathname("/markdown");
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });

    act(() => {
      result.current.setLocale("en");
    });

    expect(mockRouter.replace).toHaveBeenCalledWith("/markdown", { locale: "en" });
  });

  test("クエリとハッシュを保持して遷移する", () => {
    __setMockPathname("/report");
    window.history.replaceState({}, "", "/report?page=2#latest");

    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });

    act(() => {
      result.current.setLocale("en");
    });

    expect(mockRouter.replace).toHaveBeenCalledWith("/report?page=2#latest", { locale: "en" });
  });

  test("同じロケールを指定しても遷移しない", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });

    act(() => {
      result.current.setLocale("ja");
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("不正なロケールは無視する", () => {
    const { result } = renderHook(() => useLocaleSwitch(), {
      wrapper: createWrapper("ja"),
    });

    act(() => {
      result.current.setLocale("fr");
    });

    expect(result.current.locale).toBe("ja");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("Provider 外で useLocaleSwitch を使うとエラー", () => {
    expect(() => {
      renderHook(() => useLocaleSwitch());
    }).toThrow("useLocaleSwitch must be used within LocaleProvider");
  });
});
