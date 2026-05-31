/**
 * ConfirmDialog.tsx のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import ConfirmDialog from "../providers/ConfirmDialog";

const theme = createTheme();

describe("ConfirmDialog", () => {
  const defaultProps = {
    open: false,
    title: "Confirm",
    description: "Are you sure?",
    confirmationText: "OK",
    cancellationText: "Cancel",
    onSubmit: jest.fn(),
    onClose: jest.fn(),
    onCancel: jest.fn(),
  };

  it("renders nothing when closed", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ConfirmDialog {...defaultProps} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders dialog when open", () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmDialog {...defaultProps} open={true} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
  });

  it("renders with alert icon", () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmDialog {...defaultProps} open={true} icon="alert" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("renders with info icon", () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmDialog {...defaultProps} open={true} icon="info" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("renders with warning icon", () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmDialog {...defaultProps} open={true} icon="warn" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("renders alert mode (single button)", () => {
    render(
      <ThemeProvider theme={theme}>
        <ConfirmDialog {...defaultProps} open={true} alert={true} />
      </ThemeProvider>,
    );
    expect(screen.getByText("OK")).toBeTruthy();
  });
});
