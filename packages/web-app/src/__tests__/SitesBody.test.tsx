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

  it("renders external links with target=_blank", () => {
    const categories = [
      {
        id: "cat1",
        title: "Links",
        description: "",
        items: [
          { docKey: "url:https://example.com", displayName: "External Link", url: "https://example.com" },
        ],
        order: 0,
      },
    ];
    render(<SitesBody initialData={{ categories }} />);
    expect(screen.getByText("External Link")).toBeTruthy();
    const linkEl = screen.getByText("External Link").closest("a");
    expect(linkEl?.getAttribute("target")).toBe("_blank");
    expect(linkEl?.getAttribute("rel")).toContain("noopener");
  });

  it("renders internal links without target=_blank", () => {
    const categories = [
      {
        id: "cat1",
        title: "Docs",
        description: "",
        items: [
          { docKey: "docs/test.md", displayName: "Internal Doc" },
        ],
        order: 0,
      },
    ];
    render(<SitesBody initialData={{ categories }} />);
    expect(screen.getByText("Internal Doc")).toBeTruthy();
    const linkEl = screen.getByText("Internal Doc").closest("a");
    expect(linkEl?.getAttribute("target")).toBeNull();
  });

  it("renders multiple categories", () => {
    const categories = [
      { id: "cat1", title: "Cat 1", description: "", items: [], order: 0 },
      { id: "cat2", title: "Cat 2", description: "Cat 2 desc", items: [], order: 1 },
    ];
    render(<SitesBody initialData={{ categories }} />);
    expect(screen.getByText("Cat 1")).toBeTruthy();
    expect(screen.getByText("Cat 2")).toBeTruthy();
    expect(screen.getByText("Cat 2 desc")).toBeTruthy();
  });
});
