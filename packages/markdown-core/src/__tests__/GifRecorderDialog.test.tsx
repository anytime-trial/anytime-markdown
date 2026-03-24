/**
 * GifRecorderDialog.tsx のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../utils/gifEncoder", () => ({
  encodeGif: jest.fn(),
  extractFrameFromCanvas: jest.fn(),
  GifRecorderState: class {},
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ title }: any) => <div data-testid="edit-dialog-header">{title}</div>,
}));

jest.mock("../components/EditDialogWrapper", () => ({
  EditDialogWrapper: ({ children, open }: any) => open ? <div data-testid="edit-dialog-wrapper">{children}</div> : null,
}));

import { GifRecorderDialog } from "../components/GifRecorderDialog";

const theme = createTheme();

describe("GifRecorderDialog", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog
          open={false}
          onClose={jest.fn()}
          onComplete={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("edit-dialog-wrapper")).toBeNull();
  });

  it("renders when open", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <GifRecorderDialog
          open={true}
          onClose={jest.fn()}
          onComplete={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("edit-dialog-wrapper")).toBeTruthy();
  });
});
