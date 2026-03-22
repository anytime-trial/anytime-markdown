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
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

import PrivacyBody from "../app/privacy/PrivacyBody";

describe("PrivacyBody", () => {
  it("renders privacy title", () => {
    render(<PrivacyBody />);
    expect(screen.getByText("title")).toBeTruthy();
  });

  it("renders last updated text", () => {
    render(<PrivacyBody />);
    expect(screen.getByText("lastUpdated")).toBeTruthy();
  });

  it("renders all sections", () => {
    render(<PrivacyBody />);
    expect(screen.getByText("section1Title")).toBeTruthy();
    expect(screen.getByText("section2Title")).toBeTruthy();
    expect(screen.getByText("section3Title")).toBeTruthy();
    expect(screen.getByText("section4Title")).toBeTruthy();
    expect(screen.getByText("section5Title")).toBeTruthy();
    expect(screen.getByText("section6Title")).toBeTruthy();
    expect(screen.getByText("section7Title")).toBeTruthy();
    expect(screen.getByText("section8Title")).toBeTruthy();
  });
});
