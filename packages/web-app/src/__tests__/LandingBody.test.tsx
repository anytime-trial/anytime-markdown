import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string, _opts?: any) => key;
    return t;
  },
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

jest.mock("@anytime-markdown/editor-core", () => ({
  ACCENT_COLOR: "#e8a012",
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#F8F9FA",
}));

jest.mock("../app/components/MarkdownViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="markdown-viewer" />,
}));

import LandingBody from "../app/components/LandingBody";

describe("LandingBody", () => {
  it("renders hero section with title", () => {
    render(<LandingBody />);
    expect(screen.getByText("heroTitle")).toBeTruthy();
  });

  it("renders hero description", () => {
    render(<LandingBody />);
    expect(screen.getByText("heroDescription")).toBeTruthy();
  });

  it("renders open editor button", () => {
    render(<LandingBody />);
    expect(screen.getByText("openEditor")).toBeTruthy();
  });

  it("renders GitHub link", () => {
    render(<LandingBody />);
    expect(screen.getByText("GitHub")).toBeTruthy();
  });

  it("renders footer", () => {
    render(<LandingBody />);
    expect(screen.getByText("footerRights")).toBeTruthy();
  });
});
