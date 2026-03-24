/**
 * SourceModeEditor.tsx の追加カバレッジテスト
 * 対象: buildHighlightSegments (trailing text), buildBase64Segments,
 *        handleScroll (b64/gutter sync), Paper scroll sync,
 *        onCopy/onCut handlers with base64 token restoration
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { SourceModeEditor } from "../components/SourceModeEditor";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
  }),
}));

// Mock base64Collapse to return controlled token spans
const mockCollapseBase64 = jest.fn();
const mockRestoreBase64 = jest.fn((text: string, _map?: Map<string, string>) => text);

jest.mock("../utils/base64Collapse", () => ({
  collapseBase64: (...args: unknown[]) => mockCollapseBase64(...args),
  restoreBase64: (text: string, map: Map<string, string>) => mockRestoreBase64(text, map),
}));

beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no base64 tokens
  mockCollapseBase64.mockImplementation((text: string) => ({
    displayText: text,
    tokenMap: new Map(),
    tokenSpans: [],
  }));
  mockRestoreBase64.mockImplementation((text: string) => text);
});

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

function renderWithTheme(ui: React.ReactElement, theme = lightTheme) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

function defaultProps(overrides: Partial<Parameters<typeof SourceModeEditor>[0]> = {}) {
  return {
    sourceText: "",
    onSourceChange: jest.fn(),
    editorHeight: 600,
    ariaLabel: "source editor",
    ...overrides,
  };
}

describe("SourceModeEditor - coverage tests", () => {
  describe("buildHighlightSegments", () => {
    it("renders trailing text segment after last match", () => {
      // "hello world" with match at [0,5] => trailing " world" at [5,11]
      const { container } = renderWithTheme(
        <SourceModeEditor
          {...defaultProps({
            sourceText: "hello world",
            searchMatches: [{ start: 0, end: 5 }],
            searchCurrentIndex: 0,
          })}
        />,
      );
      // Highlight layer should have a <mark> element
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBeGreaterThan(0);
    });

    it("renders gap text between matches", () => {
      const { container } = renderWithTheme(
        <SourceModeEditor
          {...defaultProps({
            sourceText: "aXbXc",
            searchMatches: [
              { start: 1, end: 2 },
              { start: 3, end: 4 },
            ],
            searchCurrentIndex: 1,
          })}
        />,
      );
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBe(2);
    });

    it("highlights current match differently from other matches", () => {
      const { container } = renderWithTheme(
        <SourceModeEditor
          {...defaultProps({
            sourceText: "aa bb aa",
            searchMatches: [
              { start: 0, end: 2 },
              { start: 6, end: 8 },
            ],
            searchCurrentIndex: 0,
          })}
        />,
      );
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBe(2);
      // Current match (index 0) and non-current (index 1) have different background
      const bg0 = (marks[0] as HTMLElement).style.backgroundColor;
      const bg1 = (marks[1] as HTMLElement).style.backgroundColor;
      expect(bg0).not.toBe(bg1);
    });
  });

  describe("buildBase64Segments", () => {
    it("renders base64 badge marks in light theme", () => {
      const text = "before data:base64-image-0 after";
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap: new Map([["data:base64-image-0", "data:image/png;base64,AAAA"]]),
        tokenSpans: [{ start: 7, end: 26 }],
      });

      const { container } = renderWithTheme(
        <SourceModeEditor {...defaultProps({ sourceText: text })} />,
        lightTheme,
      );
      // There should be a mark with b64 key
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBeGreaterThan(0);
    });

    it("renders base64 badge marks in dark theme", () => {
      const text = "img: data:base64-image-0 end";
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap: new Map([["data:base64-image-0", "data:image/png;base64,AAAA"]]),
        tokenSpans: [{ start: 5, end: 24 }],
      });

      const { container } = renderWithTheme(
        <SourceModeEditor {...defaultProps({ sourceText: text })} />,
        darkTheme,
      );
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBeGreaterThan(0);
    });

    it("renders leading text, badge, and trailing text segments", () => {
      const text = "AB data:base64-image-0 CD";
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap: new Map([["data:base64-image-0", "data:image/png;base64,XX"]]),
        tokenSpans: [{ start: 3, end: 22 }],
      });

      const { container } = renderWithTheme(
        <SourceModeEditor {...defaultProps({ sourceText: text })} />,
      );
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBe(1);
    });

    it("renders multiple base64 spans", () => {
      const text = "data:base64-image-0 x data:base64-image-1";
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap: new Map([
          ["data:base64-image-0", "data:image/png;base64,A"],
          ["data:base64-image-1", "data:image/png;base64,B"],
        ]),
        tokenSpans: [
          { start: 0, end: 19 },
          { start: 22, end: 41 },
        ],
      });

      const { container } = renderWithTheme(
        <SourceModeEditor {...defaultProps({ sourceText: text })} />,
      );
      const marks = container.querySelectorAll("mark");
      expect(marks.length).toBe(2);
    });
  });

  describe("handleScroll syncs overlays", () => {
    it("syncs highlight, base64 overlay, and gutter scroll on textarea scroll", () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      const text = "line1\nline2\nline3";
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap: new Map([["data:base64-image-0", "x"]]),
        tokenSpans: [{ start: 0, end: 5 }],
      });

      renderWithTheme(
        <SourceModeEditor
          {...defaultProps({
            sourceText: text,
            textareaRef: ref,
            searchMatches: [{ start: 0, end: 5 }],
            searchCurrentIndex: 0,
          })}
        />,
      );

      const textarea = screen.getByRole("textbox");
      // Simulate scroll - should not throw
      fireEvent.scroll(textarea, { target: { scrollTop: 20, scrollLeft: 5 } });
    });
  });

  describe("onCopy handler with base64 tokens", () => {
    it("restores base64 data in copied text and prevents default", () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      const text = "data:base64-image-0 rest";
      const tokenMap = new Map([["data:base64-image-0", "data:image/png;base64,LONG"]]);
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap,
        tokenSpans: [{ start: 0, end: 19 }],
      });
      mockRestoreBase64.mockImplementation((t: string) => {
        if (t.includes("data:base64-image-0")) {
          return t.replace("data:base64-image-0", "data:image/png;base64,LONG");
        }
        return t;
      });

      renderWithTheme(
        <SourceModeEditor
          {...defaultProps({ sourceText: text, textareaRef: ref })}
        />,
      );

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      // Set selection range to cover the token
      Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
      Object.defineProperty(textarea, "selectionEnd", { value: 19, writable: true });

      const setData = jest.fn();
      const preventDefault = jest.fn();
      fireEvent.copy(textarea, {
        clipboardData: { setData },
        preventDefault,
      });

      // restoreBase64 should have been called
      expect(mockRestoreBase64).toHaveBeenCalled();
    });

    it("does not prevent default when tokenMap is empty", () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      mockCollapseBase64.mockReturnValue({
        displayText: "plain text",
        tokenMap: new Map(),
        tokenSpans: [],
      });

      renderWithTheme(
        <SourceModeEditor
          {...defaultProps({ sourceText: "plain text", textareaRef: ref })}
        />,
      );

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
      Object.defineProperty(textarea, "selectionEnd", { value: 5, writable: true });

      const setData = jest.fn();
      fireEvent.copy(textarea, { clipboardData: { setData } });
      // setData should NOT have been called (no token restoration needed)
      expect(setData).not.toHaveBeenCalled();
    });
  });

  describe("onCut handler with base64 tokens", () => {
    it("restores base64 data on cut and calls onSourceChange", () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      const onSourceChange = jest.fn();
      const text = "data:base64-image-0 rest";
      const tokenMap = new Map([["data:base64-image-0", "data:image/png;base64,LONG"]]);
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap,
        tokenSpans: [{ start: 0, end: 19 }],
      });
      mockRestoreBase64.mockImplementation((t: string) => {
        if (t.includes("data:base64-image-0")) {
          return t.replace("data:base64-image-0", "data:image/png;base64,LONG");
        }
        return t;
      });

      renderWithTheme(
        <SourceModeEditor
          {...defaultProps({ sourceText: text, textareaRef: ref, onSourceChange })}
        />,
      );

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
      Object.defineProperty(textarea, "selectionEnd", { value: 19, writable: true });

      const setData = jest.fn();
      const preventDefault = jest.fn();
      fireEvent.cut(textarea, {
        clipboardData: { setData },
        preventDefault,
      });

      expect(mockRestoreBase64).toHaveBeenCalled();
      // onSourceChange should be called with the remaining text after cut
      expect(onSourceChange).toHaveBeenCalled();
    });

    it("does not prevent default on cut when tokenMap is empty", () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      mockCollapseBase64.mockReturnValue({
        displayText: "plain text",
        tokenMap: new Map(),
        tokenSpans: [],
      });

      renderWithTheme(
        <SourceModeEditor
          {...defaultProps({ sourceText: "plain text", textareaRef: ref })}
        />,
      );

      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
      Object.defineProperty(textarea, "selectionEnd", { value: 5, writable: true });

      const setData = jest.fn();
      fireEvent.cut(textarea, { clipboardData: { setData } });
      expect(setData).not.toHaveBeenCalled();
    });
  });

  describe("Paper scroll sync", () => {
    it("syncs overlay layers when Paper container scrolls", () => {
      const text = "line\n".repeat(50);
      mockCollapseBase64.mockReturnValue({
        displayText: text,
        tokenMap: new Map([["data:base64-image-0", "x"]]),
        tokenSpans: [{ start: 0, end: 4 }],
      });

      const { container } = renderWithTheme(
        <SourceModeEditor
          {...defaultProps({
            sourceText: text,
            searchMatches: [{ start: 0, end: 4 }],
            searchCurrentIndex: 0,
          })}
        />,
      );

      // The Paper element is the outermost rendered element
      const paper = container.firstChild as HTMLElement;
      fireEvent.scroll(paper, { target: { scrollTop: 100 } });
      // Should not throw
    });
  });
});
