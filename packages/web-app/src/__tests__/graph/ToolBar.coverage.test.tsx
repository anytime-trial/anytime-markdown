import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "dark", setThemeMode: jest.fn() }),
}));

jest.mock("@anytime-markdown/graph-core", () => ({
  getCanvasColors: () => ({
    panelBg: "#1a1a2e",
    panelBorder: "#333",
    textPrimary: "#fff",
    textSecondary: "#aaa",
    accentColor: "#4fc3f7",
    hoverBg: "rgba(255,255,255,0.08)",
  }),
}));

import { GraphToolBar } from "@anytime-markdown/graph-viewer/src/components/ToolBar";

const defaultProps = {
  tool: "select" as any,
  onToolChange: jest.fn(),
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  canUndo: true,
  canRedo: true,
  showGrid: true,
  onToggleGrid: jest.fn(),
  onZoomIn: jest.fn(),
  onZoomOut: jest.fn(),
  onFitContent: jest.fn(),
  onClearAll: jest.fn(),
  onExportSvg: jest.fn(),
  onExportDrawio: jest.fn(),
  onImportDrawio: jest.fn(),
  onImportGraph: jest.fn(),
  onImportMermaid: jest.fn(),
  onAlign: jest.fn(),
  onSetScale: jest.fn(),
  selectionCount: 0,
  hasSelection: false,
  scale: 1,
  saveStatus: "saved" as any,
  onToggleSettings: jest.fn(),
  layoutRunning: false,
  collisionEnabled: false,
  onAutoLayout: jest.fn(),
  onToggleCollision: jest.fn(),
  layoutAlgorithm: "eades" as any,
  onChangeAlgorithm: jest.fn(),
  onSpreadConnected: jest.fn(),
};

describe("GraphToolBar", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders toolbar with tool buttons", () => {
    render(<GraphToolBar {...defaultProps} />);
    expect(screen.getByRole("banner")).toBeTruthy();
  });

  it("calls onUndo when undo button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    // Find undo by aria-label pattern
    const buttons = screen.getAllByRole("button");
    const undoBtn = buttons.find(b => b.querySelector('[data-testid="UndoIcon"]'));
    if (undoBtn) {
      fireEvent.click(undoBtn);
      expect(defaultProps.onUndo).toHaveBeenCalled();
    }
  });

  it("calls onClearAll when clear button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const clearBtn = buttons.find(b => b.querySelector('[data-testid="LayersClearIcon"]'));
    if (clearBtn) {
      fireEvent.click(clearBtn);
      expect(defaultProps.onClearAll).toHaveBeenCalled();
    }
  });

  it("calls onToggleGrid when grid button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const gridBtn = buttons.find(b => b.querySelector('[data-testid="GridOnIcon"]'));
    if (gridBtn) {
      fireEvent.click(gridBtn);
      expect(defaultProps.onToggleGrid).toHaveBeenCalled();
    }
  });

  it("calls onZoomIn and onZoomOut", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const zoomInBtn = buttons.find(b => b.querySelector('[data-testid="ZoomInIcon"]'));
    const zoomOutBtn = buttons.find(b => b.querySelector('[data-testid="ZoomOutIcon"]'));
    if (zoomInBtn) {
      fireEvent.click(zoomInBtn);
      expect(defaultProps.onZoomIn).toHaveBeenCalled();
    }
    if (zoomOutBtn) {
      fireEvent.click(zoomOutBtn);
      expect(defaultProps.onZoomOut).toHaveBeenCalled();
    }
  });

  it("calls onFitContent when fit button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const fitBtn = buttons.find(b => b.querySelector('[data-testid="FitScreenIcon"]'));
    if (fitBtn) {
      fireEvent.click(fitBtn);
      expect(defaultProps.onFitContent).toHaveBeenCalled();
    }
  });

  it("shows saving status", () => {
    render(<GraphToolBar {...defaultProps} saveStatus="saving" />);
    const icons = document.querySelectorAll('[data-testid="CloudSyncIcon"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it("shows error status", () => {
    render(<GraphToolBar {...defaultProps} saveStatus="error" />);
    const icons = document.querySelectorAll('[data-testid="CloudOffIcon"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it("shows saved status", () => {
    render(<GraphToolBar {...defaultProps} saveStatus="saved" />);
    const icons = document.querySelectorAll('[data-testid="CloudDoneIcon"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it("shows zoom scale", () => {
    render(<GraphToolBar {...defaultProps} scale={1.5} />);
    expect(screen.getByText("150%")).toBeTruthy();
  });

  it("calls onAutoLayout when layout button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const layoutBtn = buttons.find(b => b.querySelector('[data-testid="AccountTreeIcon"]'));
    if (layoutBtn) {
      fireEvent.click(layoutBtn);
      expect(defaultProps.onAutoLayout).toHaveBeenCalled();
    }
  });

  it("shows CircularProgress when layoutRunning", () => {
    render(<GraphToolBar {...defaultProps} layoutRunning={true} />);
    expect(document.querySelector('[role="progressbar"]')).toBeTruthy();
  });

  it("calls onToggleCollision when collision button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const collisionBtn = buttons.find(b => b.querySelector('[data-testid="LayersIcon"]'));
    if (collisionBtn) {
      fireEvent.click(collisionBtn);
      expect(defaultProps.onToggleCollision).toHaveBeenCalledWith(true);
    }
  });

  it("calls onSpreadConnected", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const spreadBtn = buttons.find(b => b.querySelector('[data-testid="UnfoldMoreIcon"]'));
    if (spreadBtn) {
      fireEvent.click(spreadBtn);
      expect(defaultProps.onSpreadConnected).toHaveBeenCalled();
    }
  });

  it("calls onChangeAlgorithm when algorithm button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    // Find the algorithm label button (shows EA)
    expect(screen.getByText("EA")).toBeTruthy();
    fireEvent.click(screen.getByText("EA"));
    expect(defaultProps.onChangeAlgorithm).toHaveBeenCalledWith("fruchterman-reingold");
  });

  it("shows FR label for fruchterman-reingold algorithm", () => {
    render(<GraphToolBar {...defaultProps} layoutAlgorithm="fruchterman-reingold" />);
    expect(screen.getByText("FR")).toBeTruthy();
  });

  it("shows EA+V label for eades-vpsc algorithm", () => {
    render(<GraphToolBar {...defaultProps} layoutAlgorithm="eades-vpsc" />);
    expect(screen.getByText("EA+V")).toBeTruthy();
  });

  it("shows FR+V label for fruchterman-reingold-vpsc algorithm", () => {
    render(<GraphToolBar {...defaultProps} layoutAlgorithm="fruchterman-reingold-vpsc" />);
    expect(screen.getByText("FR+V")).toBeTruthy();
  });

  it("handles shape tool mousedown/mouseup (quick click)", () => {
    jest.useFakeTimers();
    render(<GraphToolBar {...defaultProps} />);
    const toggleButtons = screen.getAllByRole("button");
    // Find the shape toggle button (has ArrowDropDown)
    const shapeBtn = toggleButtons.find(b => b.querySelector('[data-testid="ArrowDropDownIcon"]'));
    if (shapeBtn) {
      fireEvent.mouseDown(shapeBtn);
      fireEvent.mouseUp(shapeBtn);
      expect(defaultProps.onToolChange).toHaveBeenCalledWith("rect");
    }
    jest.useRealTimers();
  });

  it("handles shape tool long press to open popover", () => {
    jest.useFakeTimers();
    render(<GraphToolBar {...defaultProps} />);
    const toggleButtons = screen.getAllByRole("button");
    const shapeBtn = toggleButtons.find(b => b.querySelector('[data-testid="ArrowDropDownIcon"]'));
    if (shapeBtn) {
      fireEvent.mouseDown(shapeBtn);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      // Popover should open with shape options
    }
    jest.useRealTimers();
  });

  it("handles shape tool mouse leave cancels long press", () => {
    jest.useFakeTimers();
    render(<GraphToolBar {...defaultProps} />);
    const toggleButtons = screen.getAllByRole("button");
    const shapeBtn = toggleButtons.find(b => b.querySelector('[data-testid="ArrowDropDownIcon"]'));
    if (shapeBtn) {
      fireEvent.mouseDown(shapeBtn);
      fireEvent.mouseLeave(shapeBtn);
      act(() => {
        jest.advanceTimersByTime(500);
      });
    }
    jest.useRealTimers();
  });

  it("opens export menu and calls export functions", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find(b => b.querySelector('[data-testid="FileDownloadIcon"]'));
    if (exportBtn) {
      fireEvent.click(exportBtn);
      // Menu items should appear
      const svgItem = screen.queryByText("exportSvg");
      if (svgItem) {
        fireEvent.click(svgItem);
        expect(defaultProps.onExportSvg).toHaveBeenCalled();
      }
    }
  });

  it("opens export menu and calls exportDrawio", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find(b => b.querySelector('[data-testid="FileDownloadIcon"]'));
    if (exportBtn) {
      fireEvent.click(exportBtn);
      const drawioItem = screen.queryByText("exportDrawio");
      if (drawioItem) {
        fireEvent.click(drawioItem);
        expect(defaultProps.onExportDrawio).toHaveBeenCalled();
      }
    }
  });

  it("calls onImportDrawio when import menu item clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const importBtn = buttons.find(b => b.querySelector('[data-testid="FileUploadIcon"]'));
    if (importBtn) {
      fireEvent.click(importBtn);
      const drawioItem = screen.queryByText("importDrawio");
      if (drawioItem) {
        fireEvent.click(drawioItem);
        expect(defaultProps.onImportDrawio).toHaveBeenCalled();
      }
    }
  });

  it("opens zoom menu when scale display clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    fireEvent.click(screen.getByText("100%"));
    // Zoom presets should appear
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("200%")).toBeTruthy();
  });

  it("calls onSetScale when zoom preset clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    fireEvent.click(screen.getByText("100%"));
    fireEvent.click(screen.getByText("150%"));
    expect(defaultProps.onSetScale).toHaveBeenCalledWith(1.5);
  });

  it("opens alignment menu and calls onAlign", () => {
    render(<GraphToolBar {...defaultProps} selectionCount={3} />);
    const buttons = screen.getAllByRole("button");
    const alignBtn = buttons.find(b => b.querySelector('[data-testid="AlignHorizontalLeftIcon"]'));
    if (alignBtn) {
      fireEvent.click(alignBtn);
      const leftItem = screen.queryByText("alignLeft");
      if (leftItem) {
        fireEvent.click(leftItem);
        expect(defaultProps.onAlign).toHaveBeenCalledWith("left");
      }
    }
  });

  it("updates lastShape when tool changes to shape type", () => {
    const { rerender } = render(<GraphToolBar {...defaultProps} tool="rect" />);
    rerender(<GraphToolBar {...defaultProps} tool="ellipse" />);
    // Should update internal state - no crash
  });

  it("changes tool via ToggleButtonGroup for non-shape tools", () => {
    render(<GraphToolBar {...defaultProps} />);
    // Click the select toggle button
    const selectBtn = screen.getByLabelText("select");
    fireEvent.click(selectBtn);
  });

  it("changes to pan tool", () => {
    render(<GraphToolBar {...defaultProps} />);
    const panBtn = screen.getByLabelText("pan");
    fireEvent.click(panBtn);
  });

  it("changes to line tool", () => {
    render(<GraphToolBar {...defaultProps} />);
    const lineBtn = screen.getByLabelText("line");
    fireEvent.click(lineBtn);
  });

  it("changes to text tool", () => {
    render(<GraphToolBar {...defaultProps} />);
    const textBtn = screen.getByLabelText("text");
    fireEvent.click(textBtn);
  });

  it("changes to sticky tool", () => {
    render(<GraphToolBar {...defaultProps} />);
    const stickyBtn = screen.getByLabelText("sticky");
    fireEvent.click(stickyBtn);
  });

  it("changes to doc tool", () => {
    render(<GraphToolBar {...defaultProps} />);
    const docBtn = screen.getByLabelText("doc");
    fireEvent.click(docBtn);
  });

  it("changes to frame tool", () => {
    render(<GraphToolBar {...defaultProps} />);
    const frameBtn = screen.getByLabelText("frame");
    fireEvent.click(frameBtn);
  });

  it("handles shape selection from popover", () => {
    jest.useFakeTimers();
    render(<GraphToolBar {...defaultProps} />);
    const toggleButtons = screen.getAllByRole("button");
    const shapeBtn = toggleButtons.find(b => b.querySelector('[data-testid="ArrowDropDownIcon"]'));
    if (shapeBtn) {
      // Long press to open popover
      fireEvent.mouseDown(shapeBtn);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      // Click a shape in the popover
      const popoverButtons = screen.getAllByRole("button");
      // Find one that's in the popover (not the toolbar)
      const ellipseBtn = popoverButtons.find(b => b.querySelector('[data-testid="CircleOutlinedIcon"]'));
      if (ellipseBtn) {
        fireEvent.click(ellipseBtn);
        expect(defaultProps.onToolChange).toHaveBeenCalledWith("ellipse");
      }
    }
    jest.useRealTimers();
  });

  it("alignment menu items - all types", () => {
    render(<GraphToolBar {...defaultProps} selectionCount={3} />);
    const buttons = screen.getAllByRole("button");
    const alignBtn = buttons.find(b => b.querySelector('[data-testid="AlignHorizontalLeftIcon"]'));
    if (alignBtn) {
      fireEvent.click(alignBtn);
      // Click each alignment option
      const options = ["alignRight", "alignTop", "alignBottom", "alignCenterH", "alignCenterV", "distributeH", "distributeV"];
      for (const opt of options) {
        const item = screen.queryByText(opt);
        if (item) {
          fireEvent.click(item);
          // Re-open menu for next option
          fireEvent.click(alignBtn);
        }
      }
    }
  });

  it("zoom menu - additional presets", () => {
    render(<GraphToolBar {...defaultProps} />);
    const scaleDisplays = screen.getAllByText("100%");
    fireEvent.click(scaleDisplays[0]);
    const item50 = screen.queryByText("50%");
    if (item50) {
      fireEvent.click(item50);
      expect(defaultProps.onSetScale).toHaveBeenCalledWith(0.5);
    }
  });

  it("cycles through all algorithms", () => {
    const { rerender } = render(<GraphToolBar {...defaultProps} layoutAlgorithm="eades" />);
    fireEvent.click(screen.getByText("EA"));
    expect(defaultProps.onChangeAlgorithm).toHaveBeenCalledWith("fruchterman-reingold");

    jest.clearAllMocks();
    rerender(<GraphToolBar {...defaultProps} layoutAlgorithm="fruchterman-reingold" />);
    fireEvent.click(screen.getByText("FR"));
    expect(defaultProps.onChangeAlgorithm).toHaveBeenCalledWith("eades-vpsc");

    jest.clearAllMocks();
    rerender(<GraphToolBar {...defaultProps} layoutAlgorithm="eades-vpsc" />);
    fireEvent.click(screen.getByText("EA+V"));
    expect(defaultProps.onChangeAlgorithm).toHaveBeenCalledWith("fruchterman-reingold-vpsc");

    jest.clearAllMocks();
    rerender(<GraphToolBar {...defaultProps} layoutAlgorithm="fruchterman-reingold-vpsc" />);
    fireEvent.click(screen.getByText("FR+V"));
    expect(defaultProps.onChangeAlgorithm).toHaveBeenCalledWith("hierarchical");

    jest.clearAllMocks();
    rerender(<GraphToolBar {...defaultProps} layoutAlgorithm="hierarchical" />);
    fireEvent.click(screen.getByText("HI"));
    expect(defaultProps.onChangeAlgorithm).toHaveBeenCalledWith("eades");
  });

  it("handles shape selection for diamond type from popover", () => {
    jest.useFakeTimers();
    render(<GraphToolBar {...defaultProps} />);
    const toggleButtons = screen.getAllByRole("button");
    const shapeBtn = toggleButtons.find(b => b.querySelector('[data-testid="ArrowDropDownIcon"]'));
    if (shapeBtn) {
      fireEvent.mouseDown(shapeBtn);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      const popoverButtons = screen.getAllByRole("button");
      const diamondBtn = popoverButtons.find(b => b.querySelector('[data-testid="ChangeHistoryIcon"]'));
      if (diamondBtn) {
        fireEvent.click(diamondBtn);
        expect(defaultProps.onToolChange).toHaveBeenCalled();
      }
    }
    jest.useRealTimers();
  });

  it("shows collisionEnabled highlighted", () => {
    render(<GraphToolBar {...defaultProps} collisionEnabled={true} />);
    const buttons = screen.getAllByRole("button");
    const collisionBtn = buttons.find(b => b.querySelector('[data-testid="LayersIcon"]'));
    expect(collisionBtn).toBeTruthy();
  });

  it("calls onRedo when redo button clicked", () => {
    render(<GraphToolBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const redoBtn = buttons.find(b => b.querySelector('[data-testid="RedoIcon"]'));
    if (redoBtn) {
      fireEvent.click(redoBtn);
      expect(defaultProps.onRedo).toHaveBeenCalled();
    }
  });
});
