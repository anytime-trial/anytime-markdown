/**
 * SourceModeEditor.tsx coverage2 tests
 * Targets remaining branches:
 * - buildHighlightSegments with empty matches (line 27)
 * - buildBase64Segments with empty spans (line 66)
 * - handleScroll when textareaRef is undefined (line 126)
 * - handleScroll with null hl/b64/gutter (lines 137, 141, 145)
 * - Paper scroll sync when hasMatches=false & hasBase64Tokens=false (lines 154, 158, 161)
 * - mirror/gutter height sync (lines 174, 177, 184)
 * - onCopy with empty selection (line 322)
 * - onCut with empty selection (line 333)
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

const mockCollapseBase64 = jest.fn();
const mockRestoreBase64 = jest.fn((...args: unknown[]) => args[0] as string);

jest.mock("../utils/base64Collapse", () => ({
  collapseBase64: (...args: unknown[]) => mockCollapseBase64(...args),
  restoreBase64: (...args: unknown[]) => mockRestoreBase64(...args),
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
  mockCollapseBase64.mockImplementation((text: string) => ({
    displayText: text,
    tokenMap: new Map(),
    tokenSpans: [],
  }));
  mockRestoreBase64.mockImplementation((...args: unknown[]) => args[0] as string);
});

const lightTheme = createTheme({ palette: { mode: "light" } });

function renderEditor(overrides: Partial<Parameters<typeof SourceModeEditor>[0]> = {}) {
  const props = {
    sourceText: "",
    onSourceChange: jest.fn(),
    editorHeight: 600,
    ariaLabel: "source editor",
    ...overrides,
  };
  return render(
    <ThemeProvider theme={lightTheme}>
      <SourceModeEditor {...props} />
    </ThemeProvider>,
  );
}

describe("SourceModeEditor coverage2", () => {
  it("renders without textareaRef (handleScroll uses optional chaining)", () => {
    renderEditor({ sourceText: "hello" });
    const textarea = screen.getByRole("textbox");
    fireEvent.scroll(textarea);
    // No crash
  });

  it("renders without searchMatches (no highlight layer)", () => {
    const { container } = renderEditor({ sourceText: "hello" });
    // No mark elements
    expect(container.querySelectorAll("mark").length).toBe(0);
  });

  it("renders with empty searchMatches array (returns plain text)", () => {
    const { container } = renderEditor({
      sourceText: "hello",
      searchMatches: [],
      searchCurrentIndex: 0,
    });
    expect(container.querySelectorAll("mark").length).toBe(0);
  });

  it("onCopy with empty selection does not call setData", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    mockCollapseBase64.mockReturnValue({
      displayText: "text",
      tokenMap: new Map([["tok", "val"]]),
      tokenSpans: [],
    });

    renderEditor({ sourceText: "text", textareaRef: ref });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
    Object.defineProperty(textarea, "selectionEnd", { value: 0, writable: true });

    const setData = jest.fn();
    fireEvent.copy(textarea, { clipboardData: { setData } });
    expect(setData).not.toHaveBeenCalled();
  });

  it("onCut with empty selection does not call setData", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    mockCollapseBase64.mockReturnValue({
      displayText: "text",
      tokenMap: new Map([["tok", "val"]]),
      tokenSpans: [],
    });

    renderEditor({ sourceText: "text", textareaRef: ref });

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
    Object.defineProperty(textarea, "selectionEnd", { value: 0, writable: true });

    const setData = jest.fn();
    fireEvent.cut(textarea, { clipboardData: { setData } });
    expect(setData).not.toHaveBeenCalled();
  });

  it("onChange calls onSourceChange with restored text", () => {
    const onSourceChange = jest.fn();
    renderEditor({ sourceText: "hello", onSourceChange });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "world" } });
    expect(onSourceChange).toHaveBeenCalledWith("world");
  });

  it("renders multi-line text with proper line count", () => {
    const text = "line1\nline2\nline3\nline4\nline5";
    const { container } = renderEditor({ sourceText: text });
    // Should have 5 line numbers in the gutter
    const gutterNumbers = container.querySelectorAll("[style*='user-select'] div, [class*='MuiBox'] > div");
    expect(gutterNumbers.length).toBeGreaterThanOrEqual(5);
  });
});
