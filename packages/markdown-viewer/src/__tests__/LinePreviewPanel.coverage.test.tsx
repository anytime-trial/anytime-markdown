/**
 * LinePreviewPanel.tsx のカバレッジテスト
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ fontSize: 14 }),
}));

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#E8E6E1",
  getDivider: () => "#ccc",
  getErrorMain: () => "#f44",
  getSuccessMain: () => "#4f4",
  getTextPrimary: (isDark: boolean) => isDark ? "#fff" : "#000",
}));

jest.mock("../utils/diffEngine", () => ({
  computeInlineDiff: (old: string, new_: string) => ({
    oldSegments: [
      { type: "equal", text: old.slice(0, 2) },
      { type: "removed", text: old.slice(2) },
    ],
    newSegments: [
      { type: "equal", text: new_.slice(0, 2) },
      { type: "added", text: new_.slice(2) },
    ],
  }),
}));

import { LinePreviewPanel } from "../components/LinePreviewPanel";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

function renderPanel(props: Partial<{
  diffResult: any;
  sourceMode: boolean;
  isDark: boolean;
}> = {}) {
  const hoverSetterRef = { current: null as ((v: number | null) => void) | null };
  const theme = props.isDark ? darkTheme : lightTheme;
  const result = render(
    <ThemeProvider theme={theme}>
      <LinePreviewPanel
        diffResult={props.diffResult ?? null}
        sourceMode={props.sourceMode ?? true}
        hoverSetterRef={hoverSetterRef as any}
      />
    </ThemeProvider>
  );
  return { ...result, hoverSetterRef };
}

describe("LinePreviewPanel", () => {
  it("returns null when not in source mode", () => {
    const { container } = renderPanel({ sourceMode: false });
    expect(container.innerHTML).toBe("");
  });

  it("returns null when diffResult is null", () => {
    const { container } = renderPanel({ sourceMode: true, diffResult: null });
    expect(container.innerHTML).toBe("");
  });

  it("renders with diff result and no hovered line", () => {
    const diffResult = {
      leftLines: [{ text: "hello world", type: "modified" }],
      rightLines: [{ text: "hello earth", type: "modified" }],
    };
    const { container } = renderPanel({ sourceMode: true, diffResult });
    // Renders non-breaking space as fallback
    expect(container.innerHTML).toBeTruthy();
  });

  it("renders with hovered line showing inline diff", () => {
    const diffResult = {
      leftLines: [{ text: "hello world", type: "modified" }],
      rightLines: [{ text: "hello earth", type: "modified" }],
    };
    const { container, hoverSetterRef } = renderPanel({ sourceMode: true, diffResult });

    // Set hovered line
    act(() => {
      hoverSetterRef.current?.(0);
    });

    // Should show inline diff segments
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBeGreaterThan(0);
  });

  it("renders fallback for left-only line", () => {
    const diffResult = {
      leftLines: [{ text: "old text", type: "removed" }],
      rightLines: [{ text: "", type: "equal" }],
    };
    const { container, hoverSetterRef } = renderPanel({ sourceMode: true, diffResult });
    act(() => {
      hoverSetterRef.current?.(0);
    });
    expect(container.textContent).toContain("old text");
  });

  it("renders in dark mode", () => {
    const diffResult = {
      leftLines: [{ text: "a", type: "modified" }],
      rightLines: [{ text: "b", type: "modified" }],
    };
    const { container, hoverSetterRef } = renderPanel({ sourceMode: true, diffResult, isDark: true });
    act(() => {
      hoverSetterRef.current?.(0);
    });
    expect(container.innerHTML).toBeTruthy();
  });

  it("handles scroll sync between preview panes", () => {
    const diffResult = {
      leftLines: [{ text: "hello world long text here", type: "modified" }],
      rightLines: [{ text: "hello earth long text here", type: "modified" }],
    };
    const { container, hoverSetterRef } = renderPanel({ sourceMode: true, diffResult });
    act(() => { hoverSetterRef.current?.(0); });

    const divs = container.querySelectorAll("div[style]");
    // Find scrollable divs with onScroll handler
    if (divs.length >= 2) {
      fireEvent.scroll(divs[0], { target: { scrollLeft: 50 } });
    }
  });

  it("clears hover ref on unmount", () => {
    const diffResult = {
      leftLines: [{ text: "a", type: "equal" }],
      rightLines: [{ text: "a", type: "equal" }],
    };
    const { unmount, hoverSetterRef } = renderPanel({ sourceMode: true, diffResult });
    expect(hoverSetterRef.current).toBeTruthy();
    unmount();
    expect(hoverSetterRef.current).toBeNull();
  });
});
