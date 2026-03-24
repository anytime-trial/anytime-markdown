/**
 * ToolbarFileActions.tsx のカバレッジテスト
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

describe("ToolbarFileActions", () => {
  it("renders without crash", () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
  });

  it("renders with supportsDirectAccess capability", () => {
    renderComponent({
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });
    expect(screen.getAllByLabelText("saveFile").length).toBeGreaterThanOrEqual(1);
  });

  it("renders with externalSaveOnly capability", () => {
    renderComponent({
      fileCapabilities: { externalSaveOnly: true, hasFileHandle: true },
    });
    expect(screen.getAllByLabelText("saveFile").length).toBeGreaterThanOrEqual(1);
  });

  it("renders without direct access (import/download mode)", () => {
    renderComponent({
      fileCapabilities: { supportsDirectAccess: false },
    });
    expect(screen.getAllByLabelText("openFile").length).toBeGreaterThanOrEqual(1);
  });

  it("opens file menu on mobile button click", () => {
    renderComponent();
    const fileBtns = screen.getAllByLabelText("fileActions");
    fireEvent.click(fileBtns[0]);
    expect(screen.getByText("createNew")).toBeTruthy();
  });

  it("shows merge right file buttons when inlineMergeOpen", () => {
    renderComponent({ inlineMergeOpen: true });
    expect(screen.getAllByLabelText("loadCompareFile").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClear when new is clicked", () => {
    const handlers = createHandlers();
    renderComponent({ fileHandlers: handlers });
    const newBtns = screen.getAllByLabelText("createNew");
    fireEvent.click(newBtns[0]);
    expect(handlers.onClear).toHaveBeenCalled();
  });

  it("menu items work with supportsDirectAccess", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });
    // Open mobile menu
    fireEvent.click(screen.getAllByLabelText("fileActions")[0]);
    // Click open
    fireEvent.click(screen.getByText("openFile"));
    expect(handlers.onOpenFile).toHaveBeenCalled();
  });

  it("menu items work with externalSaveOnly", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { externalSaveOnly: true, hasFileHandle: true },
    });
    fireEvent.click(screen.getAllByLabelText("fileActions")[0]);
    fireEvent.click(screen.getByText("saveFile"));
    expect(handlers.onSaveFile).toHaveBeenCalled();
  });

  it("menu items work without direct access", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: false },
    });
    fireEvent.click(screen.getAllByLabelText("fileActions")[0]);
    fireEvent.click(screen.getByText("openFile"));
    expect(handlers.onImport).toHaveBeenCalled();
  });

  it("export PDF menu item works", () => {
    const handlers = createHandlers();
    renderComponent({ fileHandlers: handlers });
    fireEvent.click(screen.getAllByLabelText("fileActions")[0]);
    fireEvent.click(screen.getByText("exportPdf"));
    expect(handlers.onExportPdf).toHaveBeenCalled();
  });

  it("renders with tooltipShortcuts", () => {
    renderComponent({
      tooltipShortcuts: { saveFile: "Ctrl+S" },
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });
    expect(screen.getAllByLabelText("saveFile").length).toBeGreaterThanOrEqual(1);
  });
});
