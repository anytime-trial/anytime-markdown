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

jest.mock("next/font/google", () => ({
  Playfair_Display: () => ({ style: { fontFamily: "Playfair Display" } }),
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("../app/components/LandingBody", () => ({
  __esModule: true,
  default: ({ headingFontFamily }: any) => <div data-testid="landing-body" />,
}));

import LandingPage from "../app/components/LandingPage";

describe("LandingPage", () => {
  it("renders without crashing", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector(".landing-scroll")).toBeTruthy();
  });

  it("renders LandingHeader text", () => {
    render(<LandingPage />);
    expect(screen.getByText("Anytime Markdown")).toBeTruthy();
  });
});
