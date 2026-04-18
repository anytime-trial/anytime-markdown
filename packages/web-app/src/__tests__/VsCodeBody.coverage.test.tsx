import { render, screen, act } from "@testing-library/react";
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
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("@anytime-markdown/markdown-core", () => ({
  ACCENT_COLOR: "#e8a012",
}));

jest.mock("../app/components/MarkdownViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="markdown-viewer">Viewer</div>,
}));

jest.mock("../app/components/SiteFooter", () => ({
  __esModule: true,
  default: () => <footer data-testid="footer">Footer</footer>,
}));

jest.mock("../app/components/LandingHeader", () => ({
  __esModule: true,
  default: () => <header data-testid="header">Header</header>,
}));

import { createTheme, ThemeProvider } from "@mui/material";
import VsCodeBody from "../app/vscode/VsCodeBody";

const darkTheme = createTheme({ palette: { mode: "dark" } });

describe("VsCodeBody", () => {
  it("renders hero section with titles", () => {
    render(<VsCodeBody />);
    expect(screen.getByText("heroTitle1")).toBeTruthy();
    expect(screen.getByText("heroTitle2")).toBeTruthy();
    expect(screen.getByText("heroDescription")).toBeTruthy();
  });

  it("renders install and editor buttons", () => {
    render(<VsCodeBody />);
    expect(screen.getAllByText("installButton").length).toBeGreaterThanOrEqual(1);
    // openEditor は LandingHeader に移動済み（ヘッダーはモックのためテスト対象外）
  });

  it("renders benefit sections", () => {
    render(<VsCodeBody />);
    expect(screen.getByText("markdownSectionTitle")).toBeTruthy();
    expect(screen.getByText("md1Title")).toBeTruthy();
    expect(screen.getByText("md1Body")).toBeTruthy();
    expect(screen.getByText("trailSectionTitle")).toBeTruthy();
    expect(screen.getByText("trail1Title")).toBeTruthy();
  });

  it("renders markdown viewer", () => {
    render(<VsCodeBody />);
    expect(screen.getByTestId("markdown-viewer")).toBeTruthy();
  });

  it("renders header and footer", () => {
    render(<VsCodeBody />);
    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });

  it("updates viewer height on resize", () => {
    render(<VsCodeBody />);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    // No assertion needed - just verifying no crash
  });

  it("renders install caption", () => {
    render(<VsCodeBody />);
    expect(screen.getAllByText("installCaption").length).toBeGreaterThanOrEqual(1);
    // editorCaption はオンラインエディタリンクのヘッダー移動に伴い削除済み
  });

  it("renders experimental notice", () => {
    render(<VsCodeBody />);
    expect(screen.getAllByText("experimentalNotice").length).toBeGreaterThanOrEqual(1);
  });

  it("renders in dark mode with dark theme styles", () => {
    render(
      <ThemeProvider theme={darkTheme}>
        <VsCodeBody />
      </ThemeProvider>
    );
    expect(screen.getByText("heroTitle1")).toBeTruthy();
  });
});
