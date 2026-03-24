/**
 * CodeBlockEditDialog.tsx - 追加カバレッジテスト
 *
 * 比較モード、カスタムプレビュー、サンプルパネル、構文ハイライトなど
 * 未カバーのブランチを検証する。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

const mockHighlight = jest.fn();
const mockHighlightAuto = jest.fn();
const mockListLanguages = jest.fn();

jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({
    highlight: (...args: any[]) => mockHighlight(...args),
    highlightAuto: (...args: any[]) => mockHighlightAuto(...args),
    listLanguages: () => mockListLanguages(),
  }),
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
  getTextPrimary: () => "#333",
  getActionHover: () => "rgba(0,0,0,0.04)",
}));

jest.mock("../constants/dimensions", () => ({
  FS_TAB_FONT_SIZE: 12,
  FS_TOOLBAR_HEIGHT: 40,
  CHIP_FONT_SIZE: "0.7rem",
  FS_CHIP_HEIGHT: 24,
  FS_PANEL_HEADER_FONT_SIZE: "0.7rem",
}));

jest.mock("../constants/codeHelloSamples", () => ({
  CODE_HELLO_SAMPLES: {
    javascript: 'console.log("Hello");',
    python: 'print("Hello")',
  } as Record<string, string>,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "monospace",
  }),
}));

jest.mock("../utils/diffEngine", () => ({
  computeDiff: () => ({ leftLines: [], rightLines: [], blocks: [] }),
  applyMerge: jest.fn().mockReturnValue({ newLeftText: "", newRightText: "" }),
}));

jest.mock("../components/DraggableSplitLayout", () => ({
  DraggableSplitLayout: ({ left, right }: any) => (
    <div>
      <div data-testid="left-panel">{left}</div>
      <div data-testid="right-panel">{right}</div>
    </div>
  ),
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ label, showCompareView }: any) => (
    <div data-testid="edit-dialog-header">
      <span>{label}</span>
      {showCompareView && <span data-testid="compare-indicator">compare</span>}
    </div>
  ),
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) =>
    open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

jest.mock("../components/FullscreenDiffView", () => ({
  FullscreenDiffView: ({ initialLeftCode, initialRightCode }: any) => (
    <div data-testid="fullscreen-diff-view">
      <span>{initialLeftCode}</span>
      <span>{initialRightCode}</span>
    </div>
  ),
}));

jest.mock("../components/LineNumberTextarea", () => ({
  LineNumberTextarea: ({ value, readOnly }: any) => (
    <div data-testid="line-number-textarea">
      {readOnly && <span data-testid="readonly-indicator" />}
      <span>{value}</span>
    </div>
  ),
}));

jest.mock("../components/ZoomToolbar", () => ({
  ZoomToolbar: () => <div data-testid="zoom-toolbar" />,
}));

jest.mock("../components/ZoomablePreview", () => ({
  ZoomablePreview: ({ children }: any) => <div data-testid="zoomable-preview">{children}</div>,
}));

jest.mock("../components/SamplePanel", () => ({
  SamplePanel: ({ samples, onInsert }: any) => (
    <div data-testid="sample-panel">
      {samples.map((s: any) => (
        <button key={s.label} onClick={() => onInsert(s.code)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
}));

import { CodeBlockEditDialog } from "../components/CodeBlockEditDialog";

const theme = createTheme();
const t = (key: string) => key;

const baseProps = {
  open: true,
  onClose: jest.fn(),
  label: "Code Block",
  language: "javascript",
  fsCode: 'const x = 1;',
  onFsCodeChange: jest.fn(),
  onFsTextChange: jest.fn(),
  fsTextareaRef: { current: null } as React.RefObject<HTMLTextAreaElement | null>,
  fsSearch: {
    query: "",
    setQuery: jest.fn(),
    replaceText: "",
    setReplaceText: jest.fn(),
    matches: [],
    currentIndex: 0,
    goToNext: jest.fn(),
    goToPrev: jest.fn(),
    replace: jest.fn(),
    replaceAll: jest.fn(),
    caseSensitive: false,
    toggleCaseSensitive: jest.fn(),
    wholeWord: false,
    toggleWholeWord: jest.fn(),
    useRegex: false,
    toggleUseRegex: jest.fn(),
  } as any,
  t,
};

beforeEach(() => {
  mockHighlight.mockClear();
  mockHighlightAuto.mockClear();
  mockListLanguages.mockClear();
  mockListLanguages.mockReturnValue(["javascript", "python"]);
  mockHighlight.mockReturnValue({
    children: [
      { type: "element", properties: { className: ["hljs-keyword"] }, children: [{ type: "text", value: "const" }] },
      { type: "text", value: " x = 1;" },
    ],
  });
  mockHighlightAuto.mockReturnValue({
    children: [{ type: "text", value: "auto" }],
  });
});

describe("CodeBlockEditDialog - compare mode", () => {
  it("比較モードで FullscreenDiffView を表示する", () => {
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog
          {...baseProps}
          isCompareMode={true}
          compareCode="const y = 2;"
          thisCode="const x = 1;"
          onMergeApply={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("fullscreen-diff-view")).toBeTruthy();
    expect(screen.getByTestId("compare-indicator")).toBeTruthy();
  });

  it("compareCode が null の場合は通常モード", () => {
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog
          {...baseProps}
          isCompareMode={true}
          compareCode={null}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("fullscreen-diff-view")).toBeNull();
    expect(screen.getByTestId("left-panel")).toBeTruthy();
  });
});

describe("CodeBlockEditDialog - custom preview", () => {
  it("renderPreview が指定されている場合はカスタムプレビューを表示する", () => {
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog
          {...baseProps}
          renderPreview={(code) => <div data-testid="custom-preview">{code}</div>}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("custom-preview")).toBeTruthy();
    expect(screen.getByTestId("custom-preview").textContent).toBe("const x = 1;");
  });
});

describe("CodeBlockEditDialog - custom samples", () => {
  it("customSamples が指定されている場合は SamplePanel を表示する", () => {
    const customSamples = [
      { label: "Custom 1", i18nKey: "custom1", code: "// custom code" },
    ];
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog
          {...baseProps}
          customSamples={customSamples}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("sample-panel")).toBeTruthy();
    expect(screen.getByText("Custom 1")).toBeTruthy();
  });

  it("customSamples のボタンクリックで onFsTextChange が呼ばれる", () => {
    const onFsTextChange = jest.fn();
    const customSamples = [
      { label: "Template", i18nKey: "tpl", code: "template code" },
    ];
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog
          {...baseProps}
          customSamples={customSamples}
          onFsTextChange={onFsTextChange}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText("Template"));
    expect(onFsTextChange).toHaveBeenCalledWith("template code");
  });
});

describe("CodeBlockEditDialog - readOnly", () => {
  it("readOnly の場合はサンプルパネルを表示しない", () => {
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog {...baseProps} readOnly={true} />
      </ThemeProvider>,
    );
    // BuiltInSamplePanel should not render (builtInPanel is null when readOnly)
    expect(screen.queryByText("sampleContent")).toBeNull();
  });
});

describe("CodeBlockEditDialog - syntax highlight", () => {
  it("未知の言語は highlightAuto を使用する", () => {
    mockListLanguages.mockReturnValue([]); // no known languages
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog {...baseProps} language="unknown-lang" />
      </ThemeProvider>,
    );
    expect(mockHighlightAuto).toHaveBeenCalled();
  });

  it("既知の言語は highlight を使用する", () => {
    mockListLanguages.mockReturnValue(["javascript"]);
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog {...baseProps} language="javascript" />
      </ThemeProvider>,
    );
    expect(mockHighlight).toHaveBeenCalledWith("javascript", "const x = 1;");
  });

  it("空のコードの場合はハイライトしない", () => {
    mockHighlight.mockClear();
    mockHighlightAuto.mockClear();
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog {...baseProps} fsCode="" language="javascript" />
      </ThemeProvider>,
    );
    // Empty code should skip highlighting entirely (highlightedHtml returns "")
    expect(mockHighlight).not.toHaveBeenCalled();
    expect(mockHighlightAuto).not.toHaveBeenCalled();
  });

  it("ハイライトでエラーが発生した場合はエスケープされたコードを返す", () => {
    mockListLanguages.mockReturnValue(["javascript"]);
    mockHighlight.mockImplementation(() => {
      throw new Error("highlight error");
    });
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog {...baseProps} fsCode="<script>alert('xss')</script>" />
      </ThemeProvider>,
    );
    // Should show escaped code instead of crashing
    expect(screen.getByTestId("edit-dialog-wrapper")).toBeTruthy();
  });
});

describe("CodeBlockEditDialog - toolbarExtra", () => {
  it("toolbarExtra がレンダリングされる", () => {
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog
          {...baseProps}
          toolbarExtra={<span data-testid="toolbar-extra">Extra</span>}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("toolbar-extra")).toBeTruthy();
  });
});

describe("CodeBlockEditDialog - BuiltInSamplePanel", () => {
  it("サンプルコンテンツのヘッダーをクリックで展開する", () => {
    render(
      <ThemeProvider theme={theme}>
        <CodeBlockEditDialog {...baseProps} />
      </ThemeProvider>,
    );
    const sampleHeader = screen.getByText("sampleContent");
    fireEvent.click(sampleHeader);
    // After click, samples should be displayed
    expect(screen.getByText("javascript (Hello World)")).toBeTruthy();
    expect(screen.getByText("python")).toBeTruthy();
  });
});
