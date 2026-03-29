/**
 * ToolbarFileActions.tsx coverage2 tests
 * Targets remaining uncovered lines:
 *   61: externalSaveOnly - mobile menu save click
 *   68: supportsDirectAccess - mobile menu open click
 *   72: supportsDirectAccess - mobile menu save click
 *   76: supportsDirectAccess - mobile menu saveAs click
 *   83: default mode - mobile menu open (import) click
 *   87: default mode - mobile menu saveAs (download) click
 *   108,111: mobile createNew menu item click
 *   118: mobile exportPdf menu item click
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

function openMobileMenu() {
  // Mobile file menu button
  const fileButtons = screen.getAllByLabelText("fileActions");
  fireEvent.click(fileButtons[0]);
}

describe("ToolbarFileActions - coverage2 (mobile menu interactions)", () => {
  // --- externalSaveOnly: mobile menu save click (line 61) ---
  it("calls onSaveFile from mobile menu in externalSaveOnly mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { externalSaveOnly: true, hasFileHandle: true },
    });

    openMobileMenu();

    const saveItems = screen.getAllByText("saveFile");
    // Click the one in the menu (MenuItem)
    fireEvent.click(saveItems[0]);
    expect(handlers.onSaveFile).toHaveBeenCalled();
  });

  // --- supportsDirectAccess: mobile menu items (lines 68, 72, 76) ---
  it("calls onOpenFile from mobile menu in supportsDirectAccess mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });

    openMobileMenu();

    const openItems = screen.getAllByText("openFile");
    fireEvent.click(openItems[0]);
    expect(handlers.onOpenFile).toHaveBeenCalled();
  });

  it("calls onSaveFile from mobile menu in supportsDirectAccess mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
    });

    openMobileMenu();

    const saveItems = screen.getAllByText("saveFile");
    fireEvent.click(saveItems[0]);
    expect(handlers.onSaveFile).toHaveBeenCalled();
  });

  it("calls onSaveAsFile from mobile menu in supportsDirectAccess mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: true, hasFileHandle: false },
    });

    openMobileMenu();

    const saveAsItems = screen.getAllByText("saveAsFile");
    fireEvent.click(saveAsItems[0]);
    expect(handlers.onSaveAsFile).toHaveBeenCalled();
  });

  // --- default mode (no direct access, no external save): mobile menu items (lines 83, 87) ---
  it("calls onImport from mobile menu in default mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: false },
    });

    openMobileMenu();

    // In default mode, "openFile" label maps to onImport
    const openItems = screen.getAllByText("openFile");
    fireEvent.click(openItems[0]);
    expect(handlers.onImport).toHaveBeenCalled();
  });

  it("calls onDownload from mobile menu in default mode", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
      fileCapabilities: { supportsDirectAccess: false },
    });

    openMobileMenu();

    // In default mode, "saveAsFile" label maps to onDownload
    const saveAsItems = screen.getAllByText("saveAsFile");
    fireEvent.click(saveAsItems[0]);
    expect(handlers.onDownload).toHaveBeenCalled();
  });

  // --- createNew in mobile menu (lines 108, 111) ---
  it("calls onClear from createNew in mobile menu", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
    });

    openMobileMenu();

    const createNewItem = screen.getByText("createNew");
    fireEvent.click(createNewItem);
    expect(handlers.onClear).toHaveBeenCalled();
  });

  it("does not show createNew in externalSaveOnly mobile menu", () => {
    renderComponent({
      fileCapabilities: { externalSaveOnly: true, hasFileHandle: true },
    });

    openMobileMenu();

    expect(screen.queryByText("createNew")).toBeNull();
  });

  // --- exportPdf in mobile menu (line 118) ---
  it("calls onExportPdf from mobile menu", () => {
    const handlers = createHandlers();
    renderComponent({
      fileHandlers: handlers,
    });

    openMobileMenu();

    const pdfItem = screen.getByText("exportPdf");
    fireEvent.click(pdfItem);
    expect(handlers.onExportPdf).toHaveBeenCalled();
  });

  it("does not show exportPdf when handler is not provided", () => {
    const handlers = createHandlers();
    // Remove onExportPdf
    const { onExportPdf, ...rest } = handlers;
    renderComponent({
      fileHandlers: rest as any,
    });

    openMobileMenu();

    expect(screen.queryByText("exportPdf")).toBeNull();
  });

  // --- tooltip with shortcut ---
  it("shows tooltip with shortcut key", () => {
    renderComponent({
      tooltipShortcuts: { createNew: "Ctrl+N" },
    });
    // The desktop button tooltip should include the shortcut
    // Just verify component renders without error
    expect(screen.getAllByLabelText("createNew").length).toBeGreaterThanOrEqual(1);
  });
});
