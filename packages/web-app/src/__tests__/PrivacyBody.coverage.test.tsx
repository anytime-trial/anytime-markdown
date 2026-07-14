/**
 * Additional coverage for PrivacyBody - specifically the Section and P helper functions
 */
import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string, opts?: any) => {
      // Execute the render callbacks to cover them
      if (opts?.strong) opts.strong("test");
      if (opts?.link) opts.link("test");
      return key;
    };
    return t;
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "light", setThemeMode: jest.fn() }),
}));

import PrivacyBody from "../app/privacy/PrivacyBody";

describe("PrivacyBody - Section and P coverage", () => {
  it("renders all sections with Section component", () => {
    render(<PrivacyBody />);
    // All h2 elements created by Section component
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.length).toBeGreaterThanOrEqual(8);
  });

  it("renders body text with P component", () => {
    render(<PrivacyBody />);
    expect(screen.getByText("section1Body")).toBeTruthy();
    expect(screen.getByText("section2Body")).toBeTruthy();
    expect(screen.getByText("section3Body")).toBeTruthy();
    expect(screen.getByText("section5Body1")).toBeTruthy();
    expect(screen.getByText("section5Body2")).toBeTruthy();
    expect(screen.getByText("section6Body")).toBeTruthy();
    expect(screen.getByText("section7Body")).toBeTruthy();
  });

  it("renders section4 list items", () => {
    render(<PrivacyBody />);
    expect(screen.getByText("section4Intro")).toBeTruthy();
    // 外部送信を伴う連携は開示義務があるため、項目の欠落を回帰として検出する。
    for (const key of [
      "section4Mermaid",
      "section4Plantuml",
      "section4Login",
      "section4Drive",
      "section4Github",
      "section4Embed",
      "section4WebImport",
      "section4Images",
    ]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it("renders rich text with strong and link callbacks", () => {
    render(<PrivacyBody />);
    expect(screen.getByText("section8Body")).toBeTruthy();
  });
});
