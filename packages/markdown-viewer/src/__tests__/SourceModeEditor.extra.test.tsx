/**
 * SourceModeEditor.tsx の追加カバレッジテスト
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

beforeAll(() => {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});

const theme = createTheme();

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe("SourceModeEditor - additional tests", () => {
  it("renders with long text", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container } = renderWithTheme(
      <SourceModeEditor
        sourceText={text}
        onSourceChange={jest.fn()}
        editorHeight={400}
        ariaLabel="test"
      />,
    );
    expect(container.firstChild).toBeTruthy();
    // Verify line numbers
    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).value).toBe(text);
  });

  it("renders with searchMatches prop", () => {
    const { container } = renderWithTheme(
      <SourceModeEditor
        sourceText="hello world hello"
        onSourceChange={jest.fn()}
        editorHeight={400}
        ariaLabel="test"
        searchMatches={[{ start: 0, end: 5 }, { start: 12, end: 17 }]}
        searchCurrentIndex={0}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("renders with textareaRef", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    const { container } = renderWithTheme(
      <SourceModeEditor
        sourceText="# With Ref"
        onSourceChange={jest.fn()}
        editorHeight={400}
        ariaLabel="test"
        textareaRef={ref}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("handles scroll events", () => {
    renderWithTheme(
      <SourceModeEditor
        sourceText="line1\nline2\nline3"
        onSourceChange={jest.fn()}
        editorHeight={100}
        ariaLabel="test"
      />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.scroll(textarea, { target: { scrollTop: 50 } });
    // Should not crash
  });

  it("renders with empty editorHeight", () => {
    const { container } = renderWithTheme(
      <SourceModeEditor
        sourceText=""
        onSourceChange={jest.fn()}
        editorHeight={0}
        ariaLabel="test"
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
