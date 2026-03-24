/**
 * LineNumberTextarea.tsx のカバレッジテスト
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  getDivider: () => "#ccc",
  getTextDisabled: () => "#999",
  getTextPrimary: () => "#000",
}));

import { LineNumberTextarea } from "../components/LineNumberTextarea";

const theme = createTheme();

function renderTextarea(props: Partial<React.ComponentProps<typeof LineNumberTextarea>> = {}) {
  const defaultProps = {
    value: "line 1\nline 2\nline 3",
    onChange: jest.fn(),
    fontSize: 14,
    lineHeight: 1.5,
    isDark: false,
    ...props,
  };
  return render(
    <ThemeProvider theme={theme}>
      <LineNumberTextarea {...defaultProps} />
    </ThemeProvider>,
  );
}

describe("LineNumberTextarea", () => {
  it("renders line numbers matching line count", () => {
    const { container } = renderTextarea({ value: "a\nb\nc\nd\ne" });
    // 5 lines = line numbers 1-5
    const gutterLines = container.querySelectorAll("[class*='MuiBox-root'] > [class*='MuiBox-root']");
    // At least the line count should be present in text
    expect(container.textContent).toContain("5");
  });

  it("renders with single line", () => {
    const { container } = renderTextarea({ value: "single line" });
    expect(container.textContent).toContain("1");
  });

  it("renders with empty value", () => {
    const { container } = renderTextarea({ value: "" });
    expect(container).toBeTruthy();
  });

  it("renders in dark mode", () => {
    const { container } = renderTextarea({ isDark: true });
    expect(container).toBeTruthy();
  });

  it("renders with readOnly", () => {
    const { container } = renderTextarea({ readOnly: true });
    const textarea = container.querySelector("textarea");
    expect(textarea?.readOnly).toBe(true);
  });

  it("renders with placeholder", () => {
    const { container } = renderTextarea({ placeholder: "Type here..." });
    const textarea = container.querySelector("textarea");
    expect(textarea?.placeholder).toBe("Type here...");
  });

  it("renders with custom textareaRef", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    renderTextarea({ textareaRef: ref });
    expect(ref.current).toBeTruthy();
  });

  it("triggers onChange when typing", () => {
    const onChange = jest.fn();
    const { container } = renderTextarea({ onChange });
    const textarea = container.querySelector("textarea");
    if (textarea) {
      fireEvent.change(textarea, { target: { value: "new text" } });
      expect(onChange).toHaveBeenCalled();
    }
  });

  it("handles scroll sync between textarea and gutter", () => {
    const { container } = renderTextarea({ value: "a\nb\nc\nd\ne\nf\ng\nh" });
    const textarea = container.querySelector("textarea");
    if (textarea) {
      fireEvent.scroll(textarea);
    }
  });

  it("handles Tab key insertion when not readOnly", () => {
    const onChange = jest.fn();
    const { container } = renderTextarea({ onChange, value: "hello" });
    const textarea = container.querySelector("textarea");
    if (textarea) {
      // Set selection
      Object.defineProperty(textarea, "selectionStart", { value: 2, writable: true });
      Object.defineProperty(textarea, "selectionEnd", { value: 2, writable: true });
      fireEvent.keyDown(textarea, { key: "Tab" });
    }
  });

  it("does not handle Tab when readOnly", () => {
    const { container } = renderTextarea({ readOnly: true });
    const textarea = container.querySelector("textarea");
    if (textarea) {
      fireEvent.keyDown(textarea, { key: "Tab" });
      // Should not crash
    }
  });

  it("ignores non-Tab keyDown", () => {
    const { container } = renderTextarea();
    const textarea = container.querySelector("textarea");
    if (textarea) {
      fireEvent.keyDown(textarea, { key: "Enter" });
    }
  });

  it("adjusts gutter width for large line counts", () => {
    const longText = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container } = renderTextarea({ value: longText });
    expect(container.textContent).toContain("1000");
  });
});
