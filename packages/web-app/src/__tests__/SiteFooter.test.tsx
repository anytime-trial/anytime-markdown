import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

import SiteFooter from "../app/[locale]/components/SiteFooter";

describe("SiteFooter", () => {
  it("renders footer element", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("renders navigation links", () => {
    render(<SiteFooter />);
    expect(screen.getByText("footerGithub")).toBeTruthy();
    expect(screen.getByText("footerPrivacy")).toBeTruthy();
    expect(screen.getByText("footerRights")).toBeTruthy();
  });

  it("renders docsEditPage link when NEXT_PUBLIC_ENABLE_DOCS_EDIT is true", () => {
    const original = process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT;
    process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT = "true";
    render(<SiteFooter />);
    expect(screen.getByText("docsEditPage")).toBeTruthy();
    process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT = original;
  });
});
