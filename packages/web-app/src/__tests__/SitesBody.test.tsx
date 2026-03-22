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

jest.mock("../app/components/LandingHeader", () => ({
  __esModule: true,
  default: () => <div data-testid="landing-header" />,
}));

jest.mock("../app/components/SiteFooter", () => ({
  __esModule: true,
  default: () => <div data-testid="site-footer" />,
}));

import SitesBody from "../app/docs/SitesBody";

describe("SitesBody", () => {
  it("renders header and footer", () => {
    render(<SitesBody initialData={{ categories: [] }} />);
    expect(screen.getByTestId("landing-header")).toBeTruthy();
    expect(screen.getByTestId("site-footer")).toBeTruthy();
  });

  it("renders empty state when no categories", () => {
    render(<SitesBody initialData={{ categories: [] }} />);
    expect(screen.getByText("sitesEmpty")).toBeTruthy();
  });

  it("renders error alert", () => {
    render(<SitesBody initialData={{ categories: [], error: true }} />);
    expect(screen.getByText("sitesLoadError")).toBeTruthy();
  });

  it("renders categories with items", () => {
    const categories = [
      {
        id: "cat1",
        title: "Category 1",
        description: "Description",
        items: [
          { docKey: "docs/test.md", displayName: "Test Doc" },
        ],
        order: 0,
      },
    ];
    render(<SitesBody initialData={{ categories }} />);
    expect(screen.getByText("Category 1")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Test Doc")).toBeTruthy();
  });

  it("renders site description", () => {
    render(<SitesBody initialData={{ categories: [], siteDescription: "My Site" }} />);
    expect(screen.getByText("My Site")).toBeTruthy();
  });
});
