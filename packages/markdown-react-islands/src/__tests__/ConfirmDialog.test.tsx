/**
 * ConfirmDialog.tsx のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import ConfirmDialog from "../providers/ConfirmDialog";


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
        <ConfirmDialog {...defaultProps} />,
    );
    expect(container).toBeTruthy();
  });

  it("renders dialog when open", () => {
    render(
        <ConfirmDialog {...defaultProps} open={true} />,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
  });

  it("renders with alert icon", () => {
    render(
        <ConfirmDialog {...defaultProps} open={true} icon="alert" />,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("renders with info icon", () => {
    render(
        <ConfirmDialog {...defaultProps} open={true} icon="info" />,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("renders with warning icon", () => {
    render(
        <ConfirmDialog {...defaultProps} open={true} icon="warn" />,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
  });

  it("renders alert mode (single button)", () => {
    render(
        <ConfirmDialog {...defaultProps} open={true} alert={true} />,
    );
    expect(screen.getByText("OK")).toBeTruthy();
  });
});
