import { render, screen } from "@testing-library/react";
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

describe("LandingHeader", () => {
  it("renders the wordmark", () => {
    render(<LandingHeader />);
    expect(screen.getByText("Anytime")).toBeTruthy();
    expect(screen.getByText("TRAIL")).toBeTruthy();
  });

  it("renders theme toggle button", () => {
    render(<LandingHeader />);
    expect(screen.getAllByText("◐").length).toBeGreaterThanOrEqual(1);
  });

  it("renders current locale toggle button", () => {
    render(<LandingHeader />);
    expect(screen.getAllByText("EN").length).toBeGreaterThanOrEqual(1);
  });
});
