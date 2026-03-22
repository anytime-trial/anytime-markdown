import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

import SiteFooter from "../app/components/SiteFooter";

describe("SiteFooter", () => {
  it("renders footer element", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("renders navigation links", () => {
    render(<SiteFooter />);
    expect(screen.getByText("footerGithub")).toBeTruthy();
    expect(screen.getByText("footerVscode")).toBeTruthy();
    expect(screen.getByText("footerPrivacy")).toBeTruthy();
    expect(screen.getByText("footerRights")).toBeTruthy();
  });
});
