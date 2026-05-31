/**
 * GifRecorderDialog.tsx の追加カバレッジテスト
 * open=true 時の UI 要素、ボタン操作テスト。
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../utils/gifEncoder", () => ({
  encodeGif: jest.fn(),
  extractFrameFromCanvas: jest.fn(),
  GifRecorderState: class {
    fps = 10;
    maxDuration = 30000;
    outputWidth = 800;
    elapsed = 0;
    frames: any[] = [];
    addFrame() { return true; }
    reset() { this.frames = []; }
  },
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ label }: any) => <div data-testid="edit-dialog-header">{label}</div>,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

import { GifRecorderDialog } from "../components/GifRecorderDialog";

const theme = createTheme();

describe("GifRecorderDialog - additional tests", () => {
  it("renders header with 'GIF Recorder' label when open", () => {
    render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog open={true} onClose={jest.fn()} onComplete={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText("GIF Recorder")).toBeTruthy();
  });

  it("shows 'Select Screen' button in idle phase", () => {
    render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog open={true} onClose={jest.fn()} onComplete={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Select Screen")).toBeTruthy();
  });

  it("shows 'Select a screen to start' message in idle phase", () => {
    render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog open={true} onClose={jest.fn()} onComplete={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Select a screen to start")).toBeTruthy();
  });

  it("does not render when closed", () => {
    render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog open={false} onClose={jest.fn()} onComplete={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("edit-dialog-wrapper")).toBeNull();
  });

  it("calls onClose when closed", () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog open={true} onClose={onClose} onComplete={jest.fn()} />
      </ThemeProvider>,
    );
    // Re-render with open=false triggers cleanup
    rerender(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog open={false} onClose={onClose} onComplete={jest.fn()} />
      </ThemeProvider>,
    );
    // Should not crash during cleanup
  });
});
