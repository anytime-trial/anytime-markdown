/**
 * ToolbarFileActions.tsx coverage2 tests
 * Desktop button interactions for various file capability modes
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ToolbarFileActions } from "../components/ToolbarFileActions";

const theme = createTheme();
const t = (key: string) => key;

function createHandlers(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    onDownload: jest.fn(),
    onImport: jest.fn(),
    onClear: jest.fn(),
    onOpenFile: jest.fn(),
    onSaveFile: jest.fn(),
    onSaveAsFile: jest.fn(),
    onExportPdf: jest.fn(),
    onLoadRightFile: jest.fn(),
    ...overrides,
  };
}

function renderComponent(props: Partial<React.ComponentProps<typeof ToolbarFileActions>> = {}) {
  const defaultProps = {
    fileHandlers: createHandlers(),
    sourceMode: false,
    inlineMergeOpen: false,
    tooltipShortcuts: {},
    t,
    ...props,
  };
  return render(
    <ThemeProvider theme={theme}>
      <ToolbarFileActions {...defaultProps} />
    </ThemeProvider>,
  );
}

describe("ToolbarFileActions - coverage2 (desktop button interactions)", () => {
  it("calls onSaveFile in externalSaveOnly mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { externalSaveOnly: true, hasFileHandle: true },
    });
    fireEvent.click(screen.getAllByLabelText("saveFile")[0]);
    expect(handlers.onSaveFile).toHaveBeenCalled();
  });

  it("calls onOpenFile in supportsDirectAccess mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });
    fireEvent.click(screen.getAllByLabelText("openFile")[0]);
    expect(handlers.onOpenFile).toHaveBeenCalled();
  });

  it("calls onSaveFile in supportsDirectAccess mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });
    fireEvent.click(screen.getAllByLabelText("saveFile")[0]);
    expect(handlers.onSaveFile).toHaveBeenCalled();
  });

  it("calls onSaveAsFile in supportsDirectAccess mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: false },
    });
    fireEvent.click(screen.getAllByLabelText("saveAsFile")[0]);
    expect(handlers.onSaveAsFile).toHaveBeenCalled();
  });

  it("calls onImport in default mode (no direct access)", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: false },
    });
    fireEvent.click(screen.getAllByLabelText("openFile")[0]);
    expect(handlers.onImport).toHaveBeenCalled();
  });

  it("calls onDownload in default mode (no direct access)", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: false },
    });
    fireEvent.click(screen.getAllByLabelText("saveAsFile")[0]);
    expect(handlers.onDownload).toHaveBeenCalled();
  });

  it("calls onExportPdf", () => {
    const handlers = createHandlers();
    renderComponent({ fileHandlers: handlers });
    fireEvent.click(screen.getAllByLabelText("exportPdf")[0]);
    expect(handlers.onExportPdf).toHaveBeenCalled();
  });

  it("does not render exportPdf when handler is not provided", () => {
    const handlers = createHandlers();
    const { onExportPdf, ...rest } = handlers;
    renderComponent({
      fileHandlers: rest as any,
    });
    expect(screen.queryByLabelText("exportPdf")).toBeNull();
  });

  it("shows tooltip with shortcut key", () => {
    renderComponent({
      tooltipShortcuts: { saveFile: "Ctrl+S" },
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });
    expect(screen.getAllByLabelText("saveFile").length).toBeGreaterThanOrEqual(1);
  });
});
