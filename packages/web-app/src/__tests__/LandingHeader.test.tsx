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

import LandingHeader from "../app/components/LandingHeader";

describe("LandingHeader", () => {
  it("renders the app title", () => {
    render(<LandingHeader />);
    expect(screen.getByText("Anytime Markdown")).toBeTruthy();
  });

  it("renders navigation buttons", () => {
    render(<LandingHeader />);
    expect(screen.getByText("sitesPage")).toBeTruthy();
  });

  it("renders language toggle buttons", () => {
    render(<LandingHeader />);
    expect(screen.getByText("EN")).toBeTruthy();
    expect(screen.getByText("JA")).toBeTruthy();
  });
});
