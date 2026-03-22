import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("key=docs/test/test.ja.md"),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "ja", setLocale: jest.fn() }),
}));

jest.mock("../app/components/LandingHeader", () => ({
  __esModule: true,
  default: () => <div data-testid="landing-header" />,
}));

jest.mock("../app/components/SiteFooter", () => ({
  __esModule: true,
  default: () => <div data-testid="site-footer" />,
}));

jest.mock("../app/components/MarkdownViewer", () => ({
  __esModule: true,
  default: (props: any) => <div data-testid="markdown-viewer" data-doc-key={props.docKey} />,
}));

import DocsViewBody from "../app/docs/view/DocsViewBody";

describe("DocsViewBody", () => {
  it("renders MarkdownViewer when key is provided", () => {
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer).toBeTruthy();
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/test/test.ja.md");
  });

  it("renders header", () => {
    render(<DocsViewBody />);
    expect(screen.getByTestId("landing-header")).toBeTruthy();
  });
});

describe("DocsViewBody with locale map", () => {
  it("passes correct doc key", () => {
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/test/test.ja.md");
  });
});
