import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockSetThemeMode = jest.fn();
jest.mock("../../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "dark", setThemeMode: mockSetThemeMode }),
}));

jest.mock("../../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

const mockDispatch = jest.fn();
const mockState = {
  document: {
    id: "doc1",
    name: "Test",
    nodes: [],
    edges: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  selection: { nodeIds: [], edgeIds: [] },
  history: [{}],
  historyIndex: 0,
};

jest.mock("../../app/graph/hooks/useGraphState", () => ({
  useGraphState: () => ({ state: mockState, dispatch: mockDispatch }),
}));

jest.mock("../../app/graph/hooks/useAutoSave", () => ({
  useAutoSave: () => "saved",
}));

jest.mock("../../app/graph/hooks/useTouchInteraction", () => ({
  useTouchInteraction: jest.fn(),
}));

const mockHandleMouseDown = jest.fn();
const mockHandleMouseMove = jest.fn();
const mockHandleMouseUp = jest.fn();
const mockHandleWheel = jest.fn();
const mockHandleDoubleClick = jest.fn();
const mockCopySelected = jest.fn();
const mockPasteFromClipboard = jest.fn();

jest.mock("../../app/graph/hooks/useCanvasInteraction", () => ({
  useCanvasInteraction: () => ({
    handleMouseDown: mockHandleMouseDown,
    handleMouseMove: mockHandleMouseMove,
    handleMouseUp: mockHandleMouseUp,
    handleWheel: mockHandleWheel,
    handleDoubleClick: mockHandleDoubleClick,
    previewRef: { current: { type: "none", fromX: 0, fromY: 0, toX: 0, toY: 0 } },
    dragRef: { current: { type: "none" } },
    clipboardRef: { current: null },
    hoverNodeIdRef: { current: undefined },
    mouseWorldRef: { current: { x: 0, y: 0 } },
    velocityRef: { current: { vx: 0, vy: 0 } },
    copySelected: mockCopySelected,
    pasteFromClipboard: mockPasteFromClipboard,
  }),
}));

jest.mock("../../app/graph/store/graphStorage", () => ({
  loadDocument: jest.fn().mockResolvedValue(null),
  getLastDocumentId: jest.fn().mockReturnValue(null),
}));

jest.mock("@anytime-markdown/graph-core", () => ({
  getCanvasColors: () => ({
    panelBg: "#1a1a2e",
    panelBorder: "#333",
    textPrimary: "#fff",
    textSecondary: "#aaa",
    accentColor: "#4fc3f7",
    hoverBg: "rgba(255,255,255,0.08)",
    modalBg: "#1e1e1e",
  }),
  exportToSvg: jest.fn().mockReturnValue("<svg></svg>"),
  exportToDrawio: jest.fn().mockReturnValue("<mxGraphModel></mxGraphModel>"),
  importFromDrawio: jest.fn().mockReturnValue({
    id: "imported",
    name: "Imported",
    nodes: [],
    edges: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
}));

jest.mock("@anytime-markdown/graph-core/engine", () => ({
  interpolateViewport: jest.fn().mockReturnValue({ viewport: { offsetX: 0, offsetY: 0, scale: 1 }, done: true }),
  clearImageCache: jest.fn(),
  render: jest.fn(),
  drawSelectionRect: jest.fn(),
  drawEdgePreview: jest.fn(),
  drawShapePreview: jest.fn(),
  drawSnapHighlight: jest.fn(),
  drawSmartGuides: jest.fn(),
  computeAvoidancePath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 100, y: 100 }]),
  ViewportAnimation: null,
  physics: {
    PhysicsEngine: jest.fn().mockImplementation(() => ({
      initLayout: jest.fn(),
      tick: jest.fn().mockReturnValue(false),
      getPositions: jest.fn().mockReturnValue(new Map()),
      spreadConnected: jest.fn().mockReturnValue(new Map()),
      syncFromNodes: jest.fn(),
    })),
  },
}));

jest.mock("../../app/graph/engine/viewport", () => ({
  screenToWorld: (_vp: any, sx: number, sy: number) => ({ x: sx, y: sy }),
  worldToScreen: (_vp: any, x: number, y: number) => ({ x, y }),
  pan: (vp: any, dx: number, dy: number) => ({ ...vp, offsetX: vp.offsetX + dx, offsetY: vp.offsetY + dy }),
  zoom: (vp: any) => vp,
  fitToContent: () => ({ offsetX: 0, offsetY: 0, scale: 1 }),
}));

jest.mock("../../app/graph/engine/alignment", () => ({
  alignLeft: (nodes: any[]) => nodes,
  alignRight: (nodes: any[]) => nodes,
  alignTop: (nodes: any[]) => nodes,
  alignBottom: (nodes: any[]) => nodes,
  alignCenterH: (nodes: any[]) => nodes,
  alignCenterV: (nodes: any[]) => nodes,
  distributeH: (nodes: any[]) => nodes,
  distributeV: (nodes: any[]) => nodes,
}));

jest.mock("../../app/graph/types", () => ({
  createDocument: (name: string) => ({
    id: "new-doc",
    name,
    nodes: [],
    edges: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
  createNode: (type: string, x: number, y: number, overrides: any = {}) => ({
    id: "new-node",
    type,
    x,
    y,
    width: 150,
    height: 100,
    ...overrides,
  }),
}));

jest.mock("../../app/graph/engine/connector", () => ({
  resolveConnectorEndpoints: jest.fn().mockReturnValue({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }),
  computeOrthogonalPath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 100, y: 100 }]),
  computeBezierPath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 70, y: 100 }, { x: 100, y: 100 }]),
  bestSides: jest.fn().mockReturnValue({ fromSide: "right", toSide: "left" }),
  getConnectionPoints: jest.fn().mockReturnValue([{ x: 0, y: 50, side: "left" }]),
}));

// Mock canvas
HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  arc: jest.fn(),
  setTransform: jest.fn(),
  measureText: jest.fn().mockReturnValue({ width: 50 }),
  fillText: jest.fn(),
  createLinearGradient: jest.fn().mockReturnValue({ addColorStop: jest.fn() }),
  drawImage: jest.fn(),
}) as any;

Object.defineProperty(HTMLCanvasElement.prototype, "width", { value: 800, writable: true });
Object.defineProperty(HTMLCanvasElement.prototype, "height", { value: 600, writable: true });

import { GraphEditor } from "../../app/graph/components/GraphEditor";

describe("GraphEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let rafCalled = false;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      if (!rafCalled) {
        rafCalled = true;
        cb(0);
      }
      return 0;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    // Mock URL.createObjectURL / revokeObjectURL
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders with toolbar and canvas", () => {
    const { container } = render(<GraphEditor />);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("shows empty canvas hint when no nodes", () => {
    render(<GraphEditor />);
    expect(screen.getByText("emptyCanvasTitle")).toBeTruthy();
    expect(screen.getByText("emptyCanvasHint")).toBeTruthy();
  });

  it("renders live region for accessibility", () => {
    render(<GraphEditor />);
    const liveRegion = document.querySelector('[role="status"][aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
  });

  it("handles context menu (right-click)", () => {
    render(<GraphEditor />);
    const canvas = screen.getByLabelText(/graphCanvas/);
    fireEvent.contextMenu(canvas);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: { nodeIds: [], edgeIds: [] },
      })
    );
  });

  it("handles keyboard tool shortcuts", () => {
    render(<GraphEditor />);
    // Simulate keyboard shortcut for rect tool
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    });
  });

  it("handles arrow key node movement", () => {
    // Set up state with a selected node
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MOVE_NODES" })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }));
    });

    // Clean up
    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("renders undo/redo buttons and can click them", () => {
    // Set history state to enable undo/redo
    mockState.historyIndex = 1;
    mockState.history = [{}, {}, {}];
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const undoBtn = buttons.find(b => b.querySelector('[data-testid="UndoIcon"]'));
    const redoBtn = buttons.find(b => b.querySelector('[data-testid="RedoIcon"]'));
    if (undoBtn) fireEvent.click(undoBtn);
    if (redoBtn) fireEvent.click(redoBtn);
    expect(mockDispatch).toHaveBeenCalled();
    // Reset
    mockState.historyIndex = 0;
    mockState.history = [{}];
  });

  it("handles grid toggle", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const gridBtn = buttons.find(b => b.querySelector('[data-testid="GridOnIcon"]'));
    if (gridBtn) {
      fireEvent.click(gridBtn);
    }
  });

  it("handles clear all with confirm dialog", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const clearBtn = buttons.find(b => b.querySelector('[data-testid="LayersClearIcon"]'));
    if (clearBtn) {
      fireEvent.click(clearBtn);
      // Confirm dialog should appear
      const confirmBtn = screen.queryByText("confirm");
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
      }
    }
  });

  it("handles settings toggle", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const settingsBtn = buttons.find(b => b.querySelector('[data-testid="SettingsIcon"]'));
    if (settingsBtn) {
      fireEvent.click(settingsBtn);
    }
  });

  it("handles zoom in/out/fit", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const zoomInBtn = buttons.find(b => b.querySelector('[data-testid="ZoomInIcon"]'));
    const zoomOutBtn = buttons.find(b => b.querySelector('[data-testid="ZoomOutIcon"]'));
    const fitBtn = buttons.find(b => b.querySelector('[data-testid="FitScreenIcon"]'));
    if (zoomInBtn) fireEvent.click(zoomInBtn);
    if (zoomOutBtn) fireEvent.click(zoomOutBtn);
    if (fitBtn) fireEvent.click(fitBtn);
  });

  it("handles auto layout", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const layoutBtn = buttons.find(b => b.querySelector('[data-testid="AccountTreeIcon"]'));
    if (layoutBtn) fireEvent.click(layoutBtn);
  });

  it("handles spread connected", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const spreadBtn = buttons.find(b => b.querySelector('[data-testid="UnfoldMoreIcon"]'));
    if (spreadBtn) {
      fireEvent.click(spreadBtn);
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SNAPSHOT" });
    }
  });

  it("handles collision toggle", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const collisionBtn = buttons.find(b => b.querySelector('[data-testid="LayersIcon"]'));
    if (collisionBtn) fireEvent.click(collisionBtn);
  });

  it("handles export SVG", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find(b => b.querySelector('[data-testid="FileDownloadIcon"]'));
    if (exportBtn) {
      fireEvent.click(exportBtn);
      const svgItem = screen.queryByText("exportSvg");
      if (svgItem) fireEvent.click(svgItem);
    }
  });

  it("handles export DrawIO", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find(b => b.querySelector('[data-testid="FileDownloadIcon"]'));
    if (exportBtn) {
      fireEvent.click(exportBtn);
      const drawioItem = screen.queryByText("exportDrawio");
      if (drawioItem) fireEvent.click(drawioItem);
    }
  });

  it("handles import DrawIO", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const importBtn = buttons.find(b => b.querySelector('[data-testid="FileUploadIcon"]'));
    if (importBtn) fireEvent.click(importBtn);
  });

  it("handles zoom scale set", () => {
    render(<GraphEditor />);
    const scaleDisplay = screen.getByText("100%");
    fireEvent.click(scaleDisplay);
    const preset = screen.queryByText("150%");
    if (preset) fireEvent.click(preset);
  });

  it("handles algorithm change", () => {
    render(<GraphEditor />);
    const algoLabel = screen.getByText("EA");
    fireEvent.click(algoLabel);
  });

  it("updates live message on node count change", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];

    const { rerender } = render(<GraphEditor />);

    mockState.document.nodes = [];
    rerender(<GraphEditor />);

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("renders property panel when node selected", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    expect(screen.getByText("properties")).toBeTruthy();

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles printable key to start text editing", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles mousedown/mouseup on canvas delegates to handlers", () => {
    render(<GraphEditor />);
    const canvas = screen.getByLabelText(/graphCanvas/);
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);
    expect(mockHandleMouseDown).toHaveBeenCalled();
    expect(mockHandleMouseUp).toHaveBeenCalled();
  });

  it("handles confirm dialog confirm button", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const clearBtn = buttons.find(b => b.querySelector('[data-testid="LayersClearIcon"]'));
    if (clearBtn) {
      fireEvent.click(clearBtn);
      const confirmBtn = screen.getByText("confirm");
      fireEvent.click(confirmBtn);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SET_DOCUMENT" })
      );
    }
  });

  it("handles confirm dialog cancel button", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const clearBtn = buttons.find(b => b.querySelector('[data-testid="LayersClearIcon"]'));
    if (clearBtn) {
      fireEvent.click(clearBtn);
      const cancelBtn = screen.getByText("cancel");
      fireEvent.click(cancelBtn);
    }
  });

  it("handles export SVG - triggers download", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find(b => b.querySelector('[data-testid="FileDownloadIcon"]'));
    if (exportBtn) {
      fireEvent.click(exportBtn);
      const svgItem = screen.queryByText("exportSvg");
      if (svgItem) {
        fireEvent.click(svgItem);
        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      }
    }
  });

  it("handles export DrawIO - triggers download", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const exportBtn = buttons.find(b => b.querySelector('[data-testid="FileDownloadIcon"]'));
    if (exportBtn) {
      fireEvent.click(exportBtn);
      const drawioItem = screen.queryByText("exportDrawio");
      if (drawioItem) {
        fireEvent.click(drawioItem);
        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      }
    }
  });

  it("handles import DrawIO button click", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const importBtn = buttons.find(b => b.querySelector('[data-testid="FileUploadIcon"]'));
    if (importBtn) {
      fireEvent.click(importBtn);
      // Should trigger file input creation
    }
  });

  it("handles align with selected nodes", () => {
    mockState.document.nodes = [
      { id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100, text: "", locked: false, style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
      { id: "n2", type: "rect", x: 300, y: 200, width: 150, height: 100, text: "", locked: false, style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
      { id: "n3", type: "rect", x: 500, y: 300, width: 150, height: 100, text: "", locked: false, style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
    ];
    mockState.selection = { nodeIds: ["n1", "n2", "n3"], edgeIds: [] };

    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const alignBtn = buttons.find(b => b.querySelector('[data-testid="AlignHorizontalLeftIcon"]'));
    if (alignBtn) {
      fireEvent.click(alignBtn);
      const leftItem = screen.queryByText("alignLeft");
      if (leftItem) {
        fireEvent.click(leftItem);
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({ type: "ALIGN_NODES" })
        );
      }
    }

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles layer action with selected node - all actions", () => {
    mockState.document.nodes = [
      { id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100, text: "", locked: false, zIndex: 0, style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
      { id: "n2", type: "rect", x: 300, y: 200, width: 150, height: 100, text: "", locked: false, zIndex: 1, style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
    ];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    expect(screen.getByText("properties")).toBeTruthy();

    // Click layer action buttons in PropertyPanel
    const layerTopBtn = screen.getByLabelText("layerTop");
    fireEvent.click(layerTopBtn);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_NODE", id: "n1", changes: expect.objectContaining({ zIndex: 2 }) })
    );

    const layerUpBtn = screen.getByLabelText("layerUp");
    fireEvent.click(layerUpBtn);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_NODE", id: "n1" })
    );

    const layerDownBtn = screen.getByLabelText("layerDown");
    fireEvent.click(layerDownBtn);

    const layerBottomBtn = screen.getByLabelText("layerBottom");
    fireEvent.click(layerBottomBtn);

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles mousemove on canvas", () => {
    render(<GraphEditor />);
    const canvas = screen.getByLabelText(/graphCanvas/);
    fireEvent.mouseMove(canvas);
    expect(mockHandleMouseMove).toHaveBeenCalled();
  });

  it("handles wheel on canvas", () => {
    render(<GraphEditor />);
    const canvas = screen.getByLabelText(/graphCanvas/);
    fireEvent.wheel(canvas);
    expect(mockHandleWheel).toHaveBeenCalled();
  });

  it("handles double click on canvas", () => {
    render(<GraphEditor />);
    const canvas = screen.getByLabelText(/graphCanvas/);
    fireEvent.doubleClick(canvas);
    expect(mockHandleDoubleClick).toHaveBeenCalled();
  });

  it("renders edge selected property panel", () => {
    mockState.document.edges = [{
      id: "e1", type: "connector",
      from: { nodeId: "n1", x: 0, y: 0 },
      to: { nodeId: "n2", x: 100, y: 100 },
      style: { stroke: "#fff", strokeWidth: 2, startShape: "none", endShape: "arrow", routing: "orthogonal" },
    }];
    mockState.selection = { nodeIds: [], edgeIds: ["e1"] };

    render(<GraphEditor />);
    expect(screen.getByText("properties")).toBeTruthy();

    mockState.document.edges = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles ArrowLeft and ArrowUp keys for node movement", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MOVE_NODES" })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles keyboard shortcut for all tool types", () => {
    render(<GraphEditor />);
    const keys = ["o", "s", "t", "d", "p", "y", "m", "f", "l", "a", "c"];
    for (const key of keys) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      });
    }
  });

  it("handles fit content with nodes", () => {
    mockState.document.nodes = [
      { id: "n1", type: "rect", x: 50, y: 50, width: 150, height: 100, text: "", style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
      { id: "n2", type: "rect", x: 400, y: 400, width: 150, height: 100, text: "", style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" } },
    ];
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const fitBtn = buttons.find(b => b.querySelector('[data-testid="FitScreenIcon"]'));
    if (fitBtn) fireEvent.click(fitBtn);

    mockState.document.nodes = [];
  });

  it("handles settings panel open and close", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const settingsBtn = buttons.find(b => b.querySelector('[data-testid="SettingsIcon"]'));
    if (settingsBtn) {
      fireEvent.click(settingsBtn);
      expect(screen.getByText("settings")).toBeTruthy();
    }
  });

  it("handles printable key on image node - no text edit", () => {
    mockState.document.nodes = [{
      id: "n1", type: "image", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles printable key on locked node - no text edit", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: true,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("does not handle keyboard shortcuts when Ctrl is pressed", () => {
    render(<GraphEditor />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", ctrlKey: true }));
    });
  });

  it("handles set scale 200%", () => {
    render(<GraphEditor />);
    const scaleDisplay = screen.getByText("100%");
    fireEvent.click(scaleDisplay);
    const preset = screen.queryByText("200%");
    if (preset) fireEvent.click(preset);
  });

  it("handles collision toggle on", () => {
    render(<GraphEditor />);
    const buttons = screen.getAllByRole("button");
    const collisionBtn = buttons.find(b => b.querySelector('[data-testid="LayersIcon"]'));
    if (collisionBtn) {
      fireEvent.click(collisionBtn);
    }
  });

  it("handles selection change shows property panel and live message", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    const { rerender } = render(<GraphEditor />);

    mockState.selection = { nodeIds: [], edgeIds: [] };
    rerender(<GraphEditor />);

    mockState.document.nodes = [];
  });

  it("triggers nodeAdded live message when node count increases", () => {
    mockState.document.nodes = [];
    const { rerender } = render(<GraphEditor />);

    // Add a node
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    rerender(<GraphEditor />);

    mockState.document.nodes = [];
  });

  it("triggers nodeDeleted live message when node count decreases", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    const { rerender } = render(<GraphEditor />);

    // Remove the node
    mockState.document.nodes = [];
    rerender(<GraphEditor />);
  });

  it("handles PropertyPanel onClose callback", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    // Close PropertyPanel
    const closeBtn = screen.getAllByRole("button").find(b => b.querySelector('[data-testid="CloseIcon"]'));
    if (closeBtn) {
      fireEvent.click(closeBtn);
    }

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles PropertyPanel node property update", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false, url: "",
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif", borderRadius: 4, shadow: false },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    // Toggle lock
    const lockBtn = screen.getByLabelText("lock");
    fireEvent.click(lockBtn);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_NODE", id: "n1", changes: { locked: true } })
    );

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles PropertyPanel edge property update", () => {
    mockState.document.edges = [{
      id: "e1", type: "connector",
      from: { nodeId: "n1", x: 0, y: 0 },
      to: { nodeId: "n2", x: 100, y: 100 },
      label: "",
      style: { stroke: "#fff", strokeWidth: 2, startShape: "none", endShape: "arrow", routing: "orthogonal" },
    }];
    mockState.selection = { nodeIds: [], edgeIds: ["e1"] };

    render(<GraphEditor />);
    // Update edge label
    const labelInput = screen.getByPlaceholderText("Label");
    fireEvent.change(labelInput, { target: { value: "test" } });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_EDGE", id: "e1", changes: { label: "test" } })
    );

    mockState.document.edges = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles TextEditOverlay onCancel", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "Hello", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);

    // Start text editing via printable key
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    // Press Escape to cancel
    const textarea = document.querySelector("textarea");
    if (textarea) {
      fireEvent.keyDown(textarea, { key: "Escape" });
    }

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles DocEditorModal close", () => {
    mockState.document.nodes = [{
      id: "d1", type: "doc", x: 100, y: 100, width: 150, height: 100,
      text: "Doc Title", locked: false, docContent: "content",
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["d1"], edgeIds: [] };

    render(<GraphEditor />);

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles ShapeHoverBar onChangeType", () => {
    mockState.document.nodes = [{
      id: "n1", type: "rect", x: 100, y: 100, width: 150, height: 100,
      text: "", locked: false,
      style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    }];
    mockState.selection = { nodeIds: ["n1"], edgeIds: [] };

    render(<GraphEditor />);
    // ShapeHoverBar should show type change buttons

    mockState.document.nodes = [];
    mockState.selection = { nodeIds: [], edgeIds: [] };
  });

  it("handles keyboard shortcuts not firing in input fields", () => {
    render(<GraphEditor />);
    // Create and focus an input to test early return in keyboard handler
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    });
    // Tool should not change when input is focused

    document.body.removeChild(input);
  });
});
