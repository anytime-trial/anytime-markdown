/**
 * DocsViewBody.tsx の未カバーパステスト
 * - key なし (no key)
 * - en.md ファイルキー
 * - フォルダキー (末尾スラッシュ)
 * - 言語サフィックスなしキー
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
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
  default: (props: any) => (
    <div
      data-testid="markdown-viewer"
      data-doc-key={props.docKey}
      data-locale-map={props.docKeyByLocale ? JSON.stringify(props.docKeyByLocale) : ""}
    />
  ),
}));

import { render, screen } from "@testing-library/react";
import React from "react";

let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "ja", setLocale: jest.fn() }),
}));

import DocsViewBody from "../app/docs/view/DocsViewBody";

describe("DocsViewBody - no key", () => {
  it("renders error alert when key param is missing", () => {
    mockSearchParams = new URLSearchParams("");
    render(<DocsViewBody />);
    expect(screen.getByText("docsViewNoUrl")).toBeTruthy();
  });
});

describe("DocsViewBody - en.md key", () => {
  it("resolves en.md key and passes ja locale map", () => {
    mockSearchParams = new URLSearchParams("key=docs/test/test.en.md");
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/test/test.en.md");
    const localeMap = JSON.parse(viewer.getAttribute("data-locale-map") || "{}");
    expect(localeMap.ja).toBe("docs/test/test.ja.md");
  });
});

describe("DocsViewBody - folder key", () => {
  it("resolves folder key to locale-specific file", () => {
    mockSearchParams = new URLSearchParams("key=docs/guide/");
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/guide/guide.ja.md");
    const localeMap = JSON.parse(viewer.getAttribute("data-locale-map") || "{}");
    expect(localeMap.en).toBe("docs/guide/guide.en.md");
  });
});

describe("DocsViewBody - no locale suffix key", () => {
  it("resolves key without locale suffix as-is", () => {
    mockSearchParams = new URLSearchParams("key=docs/readme.md");
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/readme.md");
    // No locale map for non-locale-suffixed keys
    expect(viewer.getAttribute("data-locale-map")).toBe("");
  });
});
