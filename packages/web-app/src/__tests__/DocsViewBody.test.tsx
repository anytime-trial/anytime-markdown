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
  default: (props: any) => (
    <div
      data-testid="markdown-viewer"
      data-doc-key={props.docKey}
      data-minimal={props.minimal ? "true" : "false"}
      data-measure={props.measure ?? ""}
      data-no-scroll={props.noScroll ? "true" : "false"}
    />
  ),
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

  // report 記事と同一の read-only view 要素（<anytime-markdown-view>）経路にするため、
  // minimal / measure="wide" / noScroll を MarkdownViewer に渡すことを保証する。
  it("uses the same read-only view component as reports (minimal + wide + noScroll)", () => {
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer.getAttribute("data-minimal")).toBe("true");
    expect(viewer.getAttribute("data-measure")).toBe("wide");
    expect(viewer.getAttribute("data-no-scroll")).toBe("true");
  });
});

describe("DocsViewBody with locale map", () => {
  it("passes correct doc key", () => {
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/test/test.ja.md");
  });
});

// resolveDocKeys のロジックテスト（コンポーネントを通さずに直接テスト）
describe("DocsViewBody resolveDocKeys logic", () => {
  // resolveDocKeys はモジュール内部の関数なので、レンダリング結果から間接的にテスト
  // ja locale の場合、test.ja.md → localeMap: { en: "test.en.md" }
  it("passes correct doc key for ja.md file", () => {
    render(<DocsViewBody />);
    const viewer = screen.getByTestId("markdown-viewer");
    // useSearchParams returns "key=docs/test/test.ja.md", locale=ja
    expect(viewer.getAttribute("data-doc-key")).toBe("docs/test/test.ja.md");
  });
});
