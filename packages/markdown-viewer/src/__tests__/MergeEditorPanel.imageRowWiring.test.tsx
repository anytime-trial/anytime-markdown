/**
 * Regression (wiring): 比較モード WYSIWYG パネルが imageRow の flex レイアウトを
 * 実 CSS として注入することを保証する。
 *
 * 不具合: getMergeTiptapStyles() は { "& .tiptap": {...ネストセレクタ} } 形式の sx
 * オブジェクトを返すが、これをプレーンなインライン style 属性へスプレッドしていたため
 * ネストセレクタ（& [data-image-row] の display:flex）が DOM へ届かず、比較モードで
 * README バッジが縦並びになっていた。
 *
 * 既存の mergeTiptapStyles.imageRow.test.ts は「スタイルオブジェクト」のみ検証しており
 * オブジェクトは常に正しい（配線で捨てられていた）ため回帰を検出できなかった。本テストは
 * 実際に GlobalStyle 経由で head へ注入される CSS を検証することで配線レベルの回帰を防ぐ。
 *
 * 注意: getMergeTiptapStyles / GlobalStyle はモックせず実物を使う。
 */

// ResizeObserver polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { DEFAULT_SETTINGS } from "../useEditorSettings";

jest.mock("@anytime-markdown/markdown-react", () => ({
  EditorContent: () => <div className="tiptap" data-testid="editor-content" />,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../useEditorSettings", () => ({
  ...jest.requireActual("../useEditorSettings"),
  useEditorSettingsContext: () => jest.requireActual("../useEditorSettings").DEFAULT_SETTINGS,
}));

import { MergeEditorPanel } from "../components/MergeEditorPanel";

const theme = createTheme();

function injectedGlobalCss(): string {
  return Array.from(document.head.querySelectorAll("style[data-anytime-global]"))
    .map((el) => el.textContent ?? "")
    .join("\n");
}

describe("MergeEditorPanel WYSIWYG imageRow wiring (regression)", () => {
  afterEach(() => {
    document.head.querySelectorAll("style[data-anytime-global]").forEach((el) => el.remove());
  });

  it("injects [data-image-row] flex layout as real CSS via GlobalStyle", () => {
    expect(DEFAULT_SETTINGS).toBeDefined();
    render(
      <ThemeProvider theme={theme}>
        <MergeEditorPanel
          sourceMode={false}
          editor={null}
          side="left"
          showHoverLabels
        />
      </ThemeProvider>,
    );

    const css = injectedGlobalCss();
    // imageRow の flex 定義が実 CSS としてスコープ付きで注入されていること
    expect(css).toContain("am-merge-content-left");
    expect(css).toContain("data-image-row");
    // display:flex !important（getImageRowStyles）
    expect(css).toMatch(/\[data-image-row\][^{]*\{[^}]*flex/);
  });

  it("scopes left / right panels separately to avoid cross-contamination", () => {
    render(
      <ThemeProvider theme={theme}>
        <>
          <MergeEditorPanel sourceMode={false} editor={null} side="left" />
          <MergeEditorPanel sourceMode={false} editor={null} side="right" showHoverLabels />
        </>
      </ThemeProvider>,
    );

    const css = injectedGlobalCss();
    expect(css).toContain("am-merge-content-left");
    expect(css).toContain("am-merge-content-right");
  });
});
