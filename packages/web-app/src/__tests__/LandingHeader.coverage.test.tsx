import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "light", setThemeMode: jest.fn() }),
}));

import LandingHeader from "../app/components/LandingHeader";

// ハンバーガー / モバイルドロワーは撤去し、言語・テーマ切替を狭幅でも常時表示する。
describe("LandingHeader nav (no hamburger)", () => {
  it("ハンバーガーメニュー（ariaMenu）を描画しない", () => {
    render(<LandingHeader />);
    expect(screen.queryByLabelText("ariaMenu")).toBeNull();
  });

  it("言語切替を常時1つだけ描画する（ドロワー複製なし）", () => {
    render(<LandingHeader />);
    expect(screen.getAllByText("EN")).toHaveLength(1);
  });

  it("テーマ切替を常時1つだけ描画する（ドロワー複製なし）", () => {
    render(<LandingHeader />);
    expect(screen.getAllByLabelText("ariaTheme")).toHaveLength(1);
  });

  it("言語切替クリックで setLocale が呼ばれる", () => {
    const setLocale = jest.fn();
    jest
      .spyOn(require("../app/LocaleProvider"), "useLocaleSwitch")
      .mockReturnValue({ locale: "en", setLocale });

    render(<LandingHeader />);
    fireEvent.click(screen.getByText("EN"));
    expect(setLocale).toHaveBeenCalledWith("ja");
  });

  it("テーマ切替クリックで setThemeMode が呼ばれる", () => {
    const setThemeMode = jest.fn();
    jest
      .spyOn(require("../app/providers"), "useThemeMode")
      .mockReturnValue({ themeMode: "light", setThemeMode });

    render(<LandingHeader />);
    fireEvent.click(screen.getByLabelText("ariaTheme"));
    expect(setThemeMode).toHaveBeenCalledWith("dark");
  });
});
