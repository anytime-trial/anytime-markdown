/**
 * GifPlayerDialog.tsx - カバレッジテスト
 *
 * ダイアログのレンダリング、再生/一時停止、速度変更、設定情報表示を検証する。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  PANEL_BUTTON_FONT_SIZE: "0.75rem",
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ label, onClose }: any) => (
    <div data-testid="edit-dialog-header">
      <span>{label}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) =>
    open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

import { GifPlayerDialog } from "../components/GifPlayerDialog";

const theme = createTheme();

function renderDialog(props?: Partial<React.ComponentProps<typeof GifPlayerDialog>>) {
  return render(
    <ThemeProvider theme={theme}>
      <GifPlayerDialog
        open={true}
        onClose={jest.fn()}
        src="test.gif"
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("GifPlayerDialog", () => {
  it("open=false の場合はレンダリングしない", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <GifPlayerDialog open={false} onClose={jest.fn()} src="test.gif" />
      </ThemeProvider>,
    );
    expect(container.querySelector("[data-testid='edit-dialog-wrapper']")).toBeNull();
  });

  it("open=true の場合はレンダリングされる", () => {
    renderDialog();
    expect(screen.getByTestId("edit-dialog-wrapper")).toBeTruthy();
    expect(screen.getByText("GIF Player")).toBeTruthy();
  });

  it("GIF 画像が表示される", () => {
    renderDialog();
    const img = screen.getByAltText("GIF") as HTMLImageElement;
    expect(img.src).toContain("test.gif");
  });

  it("再生ボタンをクリックすると一時停止に切り替わる", () => {
    renderDialog();
    const pauseBtn = screen.getByLabelText("Pause");
    expect(pauseBtn).toBeTruthy();

    // Click pause → should become play
    fireEvent.click(pauseBtn);
    expect(screen.getByLabelText("Play")).toBeTruthy();
  });

  it("一時停止状態で再生ボタンをクリックすると再生に戻る", () => {
    renderDialog();
    // Pause first
    fireEvent.click(screen.getByLabelText("Pause"));
    // Now play
    fireEvent.click(screen.getByLabelText("Play"));
    expect(screen.getByLabelText("Pause")).toBeTruthy();
  });

  it("速度ボタンが表示される", () => {
    renderDialog();
    expect(screen.getByText("0.5x")).toBeTruthy();
    expect(screen.getByText("1x")).toBeTruthy();
    expect(screen.getByText("2x")).toBeTruthy();
  });

  it("settings が渡された場合に情報が表示される", () => {
    const settings = { fps: 10, duration: 3.5, width: 640, height: 480 };
    renderDialog({ settings });
    expect(screen.getByText("Duration: 3.5s")).toBeTruthy();
    expect(screen.getByText("Frames: 35")).toBeTruthy();
    expect(screen.getByText("10 fps")).toBeTruthy();
    expect(screen.getByText("Width: 640px")).toBeTruthy();
  });

  it("settings がない場合は情報行が表示されない", () => {
    renderDialog();
    expect(screen.queryByText(/Duration:/)).toBeNull();
    expect(screen.queryByText(/fps/)).toBeNull();
  });

  it("onClose が呼ばれる", () => {
    const onClose = jest.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("src にクエリパラメータがある場合の再生再開", () => {
    renderDialog({ src: "test.gif?v=1" });
    // Pause
    fireEvent.click(screen.getByLabelText("Pause"));
    // Resume - src should get &_t= appended
    fireEvent.click(screen.getByLabelText("Play"));
    const img = screen.getByAltText("GIF") as HTMLImageElement;
    expect(img.src).toContain("&_t=");
  });
});
