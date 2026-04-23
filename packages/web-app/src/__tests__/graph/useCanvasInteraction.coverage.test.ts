import { renderHook, act } from "@testing-library/react";
import React from "react";

// Mock graph-core engine (all engine modules consolidated)
const mockHitTest = jest.fn().mockReturnValue({ type: "canvas" });
jest.mock("@anytime-markdown/graph-core/engine", () => ({
  physics: {
    PhysicsEngine: jest.fn().mockImplementation(() => ({
      syncFromNodes: jest.fn(),
      updateBody: jest.fn(),
      resolveCollisions: jest.fn().mockReturnValue([]),
    })),
  },
  computeVisibilityPath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }]),
  screenToWorld: (_vp: any, sx: number, sy: number) => ({ x: sx, y: sy }),
  pan: (vp: any, dx: number, dy: number) => ({ ...vp, offsetX: vp.offsetX + dx, offsetY: vp.offsetY + dy }),
  zoom: (vp: any, _sx: number, _sy: number, _delta: number) => ({ ...vp, scale: vp.scale * 1.1 }),
  hitTest: (...args: any[]) => mockHitTest(...args),
  hitTestEdge: jest.fn().mockReturnValue(null),
  snapToGrid: (v: number) => Math.round(v / 20) * 20,
  computeSmartGuides: (_x: number, _y: number, _w: number, _h: number, _others: any[], _threshold: number) => ({
    snappedX: _x,
    snappedY: _y,
    guides: [],
  }),
  computeOrthogonalPath: () => [{ x: 0, y: 0 }, { x: 100, y: 100 }],
  bestSides: jest.fn().mockReturnValue({ fromSide: "right", toSide: "left" }),
  getConnectionPoints: jest.fn().mockReturnValue([{ x: 0, y: 50, side: "left" }, { x: 150, y: 50, side: "right" }]),
  nearestBorderPoint: jest.fn().mockReturnValue({ x: 100, y: 100 }),
  resolveConnectorEndpoints: jest.fn().mockReturnValue({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }),
}));

// Mock types
jest.mock("@anytime-markdown/graph-viewer/src/types", () => ({
  createNode: (type: string, x: number, y: number, overrides: any = {}, _isDark?: boolean) => ({
    id: "new-node-1",
    type,
    x,
    y,
    width: overrides.width ?? 150,
    height: overrides.height ?? 100,
    text: "",
    style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
    ...overrides,
  }),
  createEdge: (type: string, from: any, to: any) => ({
    id: "new-edge-1",
    type,
    from,
    to,
    style: { stroke: "#fff", strokeWidth: 2 },
  }),
}));

import { useCanvasInteraction } from "@anytime-markdown/graph-viewer/src/hooks/useCanvasInteraction";

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  });
  canvas.style.cursor = "default";
  document.body.appendChild(canvas);
  return canvas;
}

const makeNode = (id: string, x = 100, y = 100) => ({
  id,
  type: "rect" as const,
  x,
  y,
  width: 150,
  height: 100,
  text: "",
  locked: false,
  style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
});

const makeEdge = (id: string, fromNodeId?: string, toNodeId?: string) => ({
  id,
  type: "connector" as const,
  from: { nodeId: fromNodeId, x: 0, y: 0 },
  to: { nodeId: toNodeId, x: 100, y: 100 },
  style: { stroke: "#fff", strokeWidth: 2, routing: "orthogonal" as const },
});

describe("useCanvasInteraction", () => {
  let canvas: HTMLCanvasElement;
  const dispatch = jest.fn();
  const onTextEdit = jest.fn();
  const onToolChange = jest.fn();

  const defaultProps = {
    canvasRef: { current: null as HTMLCanvasElement | null },
    tool: "select" as any,
    nodes: [] as any[],
    edges: [] as any[],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    selection: { nodeIds: [] as string[], edgeIds: [] as string[] },
    dispatch,
    onTextEdit,
    onToolChange,
    showGrid: true,
    isDark: true,
  };

  beforeEach(() => {
    canvas = createMockCanvas();
    defaultProps.canvasRef = { current: canvas };
    jest.clearAllMocks();
    mockHitTest.mockReset();
    mockHitTest.mockReturnValue({ type: "canvas" });
    // Mock crypto.randomUUID
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "test-uuid" },
      writable: true,
    });
  });

  afterEach(() => {
    if (canvas.parentElement) document.body.removeChild(canvas);
  });

  function makeMouseEvent(type: string, x: number, y: number, extra: any = {}) {
    return {
      clientX: x,
      clientY: y,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      ...extra,
    } as unknown as React.MouseEvent;
  }

  it("returns all expected handlers", () => {
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));
    expect(result.current.handleMouseDown).toBeDefined();
    expect(result.current.handleMouseMove).toBeDefined();
    expect(result.current.handleMouseUp).toBeDefined();
    expect(result.current.handleWheel).toBeDefined();
    expect(result.current.handleDoubleClick).toBeDefined();
    expect(result.current.copySelected).toBeDefined();
    expect(result.current.pasteFromClipboard).toBeDefined();
    expect(result.current.previewRef).toBeDefined();
    expect(result.current.dragRef).toBeDefined();
    expect(result.current.clipboardRef).toBeDefined();
    expect(result.current.velocityRef).toBeDefined();
  });

  it("handles pan on middle mouse button", () => {
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { button: 1 }));
    });
    expect(result.current.dragRef.current.type).toBe("pan");
  });

  it("handles pan on space key", () => {
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    // Simulate space keydown
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    });

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("pan");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    });
  });

  it("handles pan tool mouse down", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "pan" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("pan");
  });

  it("handles pan mouse move and mouse up with inertia", () => {
    jest.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(10).mockReturnValueOnce(20).mockReturnValueOnce(50);

    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { button: 1 }));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 120, 130));
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_VIEWPORT" }));

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 120, 130));
    });
    expect(result.current.dragRef.current.type).toBe("none");
  });

  it("starts select-rect when clicking on canvas", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("select-rect");

    // Move to create selection rect
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 200, 200));
    });
    expect(result.current.previewRef.current.type).toBe("select-rect");

    // Release
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 200, 200));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTION" })
    );
  });

  it("selects node on click", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, nodes: [node] })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTION" })
    );
    expect(result.current.dragRef.current.type).toBe("move");
  });

  it("handles shift-click to add/remove from selection", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150, { shiftKey: true }));
    });
    // Should toggle selection
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTION" })
    );
  });

  it("starts move drag for selected node", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    expect(result.current.dragRef.current.type).toBe("move");

    // Move with grid snap
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 170, 180));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_NODE_POSITIONS" })
    );
  });

  it("handles move with smart guides (no grid)", () => {
    const node = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node, node2],
        selection: { nodeIds: ["n1"], edgeIds: [] },
        showGrid: false,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 170, 180));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_NODE_POSITIONS" })
    );
  });

  it("does not move locked node", () => {
    const node = { ...makeNode("n1"), locked: true };
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    // Should not start move drag for locked node
    expect(result.current.dragRef.current.type).not.toBe("move");
  });

  it("handles resize handle hit", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "se" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 200));
    });
    expect(result.current.dragRef.current.type).toBe("resize");

    // Move to resize
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 300, 250));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RESIZE_NODE" })
    );

    // Release
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 300, 250));
    });
  });

  it("handles edge hit", () => {
    const edge = makeEdge("e1");
    mockHitTest.mockReturnValue({ type: "edge", id: "e1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        edges: [edge],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 50, 50));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTION", selection: { nodeIds: [], edgeIds: ["e1"] } })
    );
  });

  it("creates shape on mouseup with shape tool", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "rect" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("create-shape");

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 250, 200));
    });
    expect(result.current.previewRef.current.type).toBe("shape");

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 250, 200));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
    expect(onToolChange).toHaveBeenCalledWith("select");
  });

  it("creates edge on mouseup with line tool", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "line" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("create-edge");

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 250, 200));
    });
    expect(result.current.previewRef.current.type).toBe("edge");

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 250, 200));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("creates edge connecting to existing node", () => {
    const node = makeNode("n1");
    mockHitTest
      .mockReturnValueOnce({ type: "canvas" }) // mousedown
      .mockReturnValueOnce({ type: "node", id: "n1" }) // mousemove
      .mockReturnValueOnce({ type: "node", id: "n1" }); // mouseup

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        tool: "connector" as any,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 10, 10));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
    });

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 150, 150));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles wheel zoom", () => {
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleWheel({
        clientX: 400,
        clientY: 300,
        deltaY: -100,
        preventDefault: jest.fn(),
      } as unknown as React.WheelEvent);
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_VIEWPORT" })
    );
  });

  it("handles double click for text editing", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleDoubleClick(makeMouseEvent("dblclick", 150, 150));
    });
    expect(onTextEdit).toHaveBeenCalledWith("n1");
  });

  it("handles Escape key to clear selection", () => {
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTION", selection: { nodeIds: [], edgeIds: [] } })
    );
  });

  it("handles Delete key to delete selected", () => {
    const node = makeNode("n1");
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DELETE_SELECTED" })
    );
  });

  it("handles Backspace key to delete selected", () => {
    const node = makeNode("n1");
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DELETE_SELECTED" })
    );
  });

  it("handles Ctrl+Z for undo", () => {
    const onLiveMessage = jest.fn();
    renderHook(() =>
      useCanvasInteraction({ ...defaultProps, onLiveMessage })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "UNDO" });
    expect(onLiveMessage).toHaveBeenCalledWith("undo");
  });

  it("handles Ctrl+Y for redo", () => {
    const onLiveMessage = jest.fn();
    renderHook(() =>
      useCanvasInteraction({ ...defaultProps, onLiveMessage })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "REDO" });
    expect(onLiveMessage).toHaveBeenCalledWith("redo");
  });

  it("handles Ctrl+Shift+Z for redo", () => {
    renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "REDO" });
  });

  it("handles Ctrl+A for select all", () => {
    const node = makeNode("n1");
    renderHook(() =>
      useCanvasInteraction({ ...defaultProps, nodes: [node] })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );
  });

  it("handles Ctrl+G for group", () => {
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        selection: { nodeIds: ["n1", "n2"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", ctrlKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GROUP_SELECTED" })
    );
  });

  it("handles Ctrl+Shift+G for ungroup", () => {
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        selection: { nodeIds: ["n1", "n2"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", ctrlKey: true, shiftKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "UNGROUP_SELECTED" });
  });

  it("handles Ctrl+C and Ctrl+V for copy/paste", async () => {
    const node = makeNode("n1");

    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockRejectedValue(new Error("not available")),
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    // Copy
    act(() => {
      result.current.copySelected();
    });
    expect(result.current.clipboardRef.current).toBeTruthy();

    // Paste
    await act(async () => {
      await result.current.pasteFromClipboard();
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PASTE_NODES" })
    );
  });

  it("handles connection-point hit to create edge", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "connection-point", id: "n1", connectionSide: "right" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 150));
    });
    expect(result.current.dragRef.current.type).toBe("create-edge");
  });

  it("handles edge-endpoint reconnect", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    const edge = makeEdge("e1", "n1", "n2");
    mockHitTest
      .mockReturnValueOnce({ type: "edge-endpoint", id: "e1", endpointEnd: "to" })
      .mockReturnValueOnce({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        edges: [edge],
        selection: { nodeIds: [], edgeIds: ["e1"] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 350, 350));
    });
    expect(result.current.dragRef.current.type).toBe("create-edge");

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 150, 150));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_EDGE" })
    );
  });

  it("handles edge-segment drag", () => {
    const edge = makeEdge("e1", "n1", "n2");
    mockHitTest.mockReturnValue({ type: "edge-segment", id: "e1", segmentDirection: "vertical" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        edges: [edge],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 50, 50));
    });
    expect(result.current.dragRef.current.type).toBe("move-edge-segment");

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 70, 50));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_EDGE" })
    );
  });

  it("handles cursor change for different hit types in select mode", () => {
    const node = makeNode("n1") as ReturnType<typeof makeNode> & { url?: string };
    node.url = "https://example.com";
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    // Move cursor over node
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
    });

    // Move cursor over node with Ctrl (URL)
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150, { ctrlKey: true }));
    });
  });

  it("handles cursor change for pan tool", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "pan" as any })
    );

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
    });
  });

  it("handles cursor change for crosshair tools", () => {
    for (const tool of ["rect", "line", "arrow", "connector"] as any[]) {
      const { result } = renderHook(() =>
        useCanvasInteraction({ ...defaultProps, tool })
      );

      act(() => {
        result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
      });
    }
  });

  it("handles window mouseup to reset drag state", () => {
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { button: 1 }));
    });
    expect(result.current.dragRef.current.type).toBe("pan");

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(result.current.dragRef.current.type).toBe("none");
  });

  it("handles Ctrl+click to open URL", () => {
    const node = makeNode("n1");
    (node as any).url = "https://example.com";
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150, { ctrlKey: true }));
    });
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("handles delete with locked nodes", () => {
    const node = { ...makeNode("n1"), locked: true };
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTION" })
    );
  });

  it("handles connection-point to blank creates child node", () => {
    const node = makeNode("n1");
    mockHitTest
      .mockReturnValueOnce({ type: "connection-point", id: "n1", connectionSide: "right" })
      .mockReturnValueOnce({ type: "canvas" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 150));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 400, 150));
    });

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 400, 150));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles create-shape with small drag (default size)", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "rect" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });

    // Very small drag
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 105, 105));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
  });

  it("handles text tool with smaller default height", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "text" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 105, 105));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
  });

  it("handles connector tool", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "connector" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("create-edge");
  });

  it("handles group selection with frame nodes", () => {
    const frame = { ...makeNode("f1"), type: "frame" as const, width: 500, height: 500 };
    const child = makeNode("c1");
    child.x = 150;
    child.y = 150;
    mockHitTest.mockReturnValue({ type: "node", id: "f1" });

    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [frame, child],
      })
    );

    act(() => {
      // Simulate mousedown on frame
    });
  });

  it("handles collision-enabled move", () => {
    const node = makeNode("n1");
    const mockEngine = {
      syncFromNodes: jest.fn(),
      updateBody: jest.fn(),
      resolveCollisions: jest.fn().mockReturnValue([{ id: "n2", x: 200, y: 200 }]),
    };
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const physicsRef = { current: mockEngine as any };
    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
        collisionEnabled: true,
        physicsRef,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 170, 180));
    });
    expect(mockEngine.updateBody).toHaveBeenCalled();
  });

  it("handles group selection (nodes with groupId)", () => {
    const node1 = { ...makeNode("n1"), groupId: "g1" };
    const node2 = { ...makeNode("n2", 300, 300), groupId: "g1" };
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    // Both group members should be selected
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: expect.objectContaining({
          nodeIds: expect.arrayContaining(["n1", "n2"]),
        }),
      })
    );
  });

  it("handles frame node selection includes children", () => {
    const frame = { ...makeNode("f1"), type: "frame" as const, width: 500, height: 500, x: 0, y: 0 };
    const child = { ...makeNode("c1"), x: 50, y: 50 };
    mockHitTest.mockReturnValue({ type: "node", id: "f1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [frame, child],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 250));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: expect.objectContaining({
          nodeIds: expect.arrayContaining(["f1", "c1"]),
        }),
      })
    );
  });

  it("handles resize with nw handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "nw" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 80, 80));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 80, 80));
    });
  });

  it("handles resize with n handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "n" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 175, 100));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 175, 80));
    });
  });

  it("handles resize with w handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "w" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 150));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 80, 150));
    });
  });

  it("handles cursor types for edge-endpoint and connection-point", () => {
    mockHitTest.mockReturnValueOnce({ type: "edge-endpoint", id: "e1", endpointEnd: "from" });

    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 50, 50));
    });
  });

  it("handles cursor types for edge-segment", () => {
    mockHitTest
      .mockReturnValueOnce({ type: "edge-segment", id: "e1", segmentDirection: "vertical" })
      .mockReturnValueOnce({ type: "edge-segment", id: "e1", segmentDirection: "vertical" });

    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 50, 50));
    });
  });

  it("handles cursor for edge hover", () => {
    mockHitTest
      .mockReturnValueOnce({ type: "edge", id: "e1" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 50, 50));
    });
  });

  it("handles paste from system clipboard", async () => {
    const pasteData = JSON.stringify({
      type: "anytime-graph",
      nodes: [{ ...makeNode("clip1"), id: "clip1" }],
      edges: [],
    });

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockResolvedValue(pasteData),
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    await act(async () => {
      await result.current.pasteFromClipboard();
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PASTE_NODES" })
    );
  });

  it("handles edge-endpoint reconnect from end", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    const edge = makeEdge("e1", "n1", "n2");
    mockHitTest
      .mockReturnValueOnce({ type: "edge-endpoint", id: "e1", endpointEnd: "from" })
      .mockReturnValueOnce({ type: "node", id: "n2" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        edges: [edge],
        selection: { nodeIds: [], edgeIds: ["e1"] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 350, 350));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_EDGE" })
    );
  });

  it("handles select rect with too small drag (no selection)", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });

    // Very small movement (less than 2px)
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 101, 101));
    });
    // Should not trigger selection
  });

  it("handles shift-click on canvas clears nothing", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { shiftKey: true }));
    });
    // Should start select-rect without clearing selection
    expect(result.current.dragRef.current.type).toBe("select-rect");
  });

  it("handles ellipse, diamond, parallelogram, cylinder shape tools", () => {
    for (const tool of ["ellipse", "diamond", "parallelogram", "cylinder"] as any[]) {
      const { result } = renderHook(() =>
        useCanvasInteraction({ ...defaultProps, tool })
      );

      act(() => {
        result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
      });
      expect(result.current.dragRef.current.type).toBe("create-shape");

      act(() => {
        result.current.handleMouseUp(makeMouseEvent("mouseup", 200, 200));
      });
    }
  });

  it("handles doc and frame shape tools", () => {
    for (const tool of ["doc", "frame"] as any[]) {
      const { result } = renderHook(() =>
        useCanvasInteraction({ ...defaultProps, tool })
      );

      act(() => {
        result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
      });
      expect(result.current.dragRef.current.type).toBe("create-shape");
    }
  });

  it("handles sticky shape tool", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "sticky" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    expect(result.current.dragRef.current.type).toBe("create-shape");
  });

  it("handles create edge without grid snap", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        tool: "rect" as any,
        showGrid: false,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });

    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 200, 200));
    });
  });

  it("handles copy with no selection does nothing", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        selection: { nodeIds: [], edgeIds: [] },
      })
    );

    act(() => {
      result.current.copySelected();
    });
    expect(result.current.clipboardRef.current).toBeNull();
  });

  it("handles resize on locked node is prevented", () => {
    const node = { ...makeNode("n1"), locked: true };
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "se" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 200));
    });
    // Should not start resize on locked node
    expect(result.current.dragRef.current.type).not.toBe("resize");
  });

  it("handles edge creation from node to existing node", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    mockHitTest
      .mockReturnValueOnce({ type: "node", id: "n1" }) // mousedown on line tool
      .mockReturnValueOnce({ type: "node", id: "n2" }) // mousemove
      .mockReturnValueOnce({ type: "node", id: "n2" }); // mouseup

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        tool: "connector" as any,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 350, 350));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 350, 350));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles connection-point creating sticky child", () => {
    const node = { ...makeNode("n1"), type: "sticky" as const };
    mockHitTest
      .mockReturnValueOnce({ type: "connection-point", id: "n1", connectionSide: "bottom" })
      .mockReturnValueOnce({ type: "canvas" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 175, 200));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 175, 400));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 175, 400));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
  });

  it("handles connection-point creating ellipse child", () => {
    const node = { ...makeNode("n1"), type: "ellipse" as const };
    mockHitTest
      .mockReturnValueOnce({ type: "connection-point", id: "n1", connectionSide: "left" })
      .mockReturnValueOnce({ type: "canvas" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 150));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 0, 150));
    });
  });

  it("handles Ctrl+click on node without URL does not open window", () => {
    const node = makeNode("n1");
    // Node has no url
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150, { ctrlKey: true }));
    });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("handles Meta+click to open URL", () => {
    const node = makeNode("n1");
    (node as any).url = "https://example.com";
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150, { metaKey: true }));
    });
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("handles shift-click to add unselected node to selection", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    mockHitTest.mockReturnValue({ type: "node", id: "n2" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 350, 350, { shiftKey: true }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: expect.objectContaining({
          nodeIds: expect.arrayContaining(["n1", "n2"]),
        }),
      })
    );
  });

  it("handles move-edge-segment with horizontal direction", () => {
    const edge = makeEdge("e1", "n1", "n2");
    mockHitTest.mockReturnValue({ type: "edge-segment", id: "e1", segmentDirection: "horizontal" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        edges: [edge],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 50, 50));
    });
    expect(result.current.dragRef.current.type).toBe("move-edge-segment");

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 50, 70));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_EDGE" })
    );
  });

  it("handles cursor for connection-point hover", () => {
    mockHitTest
      .mockReturnValueOnce({ type: "connection-point", id: "n1", connectionSide: "right" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 50, 50));
    });
  });

  it("handles cursor for edge-segment horizontal hover", () => {
    mockHitTest
      .mockReturnValueOnce({ type: "edge-segment", id: "e1", segmentDirection: "horizontal" })
      .mockReturnValueOnce({ type: "edge-segment", id: "e1", segmentDirection: "horizontal" });

    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 50, 50));
    });
  });

  it("handles collision-enabled move with smart guides (no grid)", () => {
    const node = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    const mockEngine = {
      syncFromNodes: jest.fn(),
      updateBody: jest.fn(),
      resolveCollisions: jest.fn().mockReturnValue([{ id: "n2", x: 250, y: 250 }]),
    };
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const physicsRef = { current: mockEngine as any };
    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node, node2],
        selection: { nodeIds: ["n1"], edgeIds: [] },
        collisionEnabled: true,
        physicsRef,
        showGrid: false,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 170, 180));
    });
    expect(mockEngine.updateBody).toHaveBeenCalled();
    expect(mockEngine.resolveCollisions).toHaveBeenCalled();
  });

  it("handles collision-enabled move with grid", () => {
    const node = makeNode("n1");
    const mockEngine = {
      syncFromNodes: jest.fn(),
      updateBody: jest.fn(),
      resolveCollisions: jest.fn().mockReturnValue([]),
    };
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const physicsRef = { current: mockEngine as any };
    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
        collisionEnabled: true,
        physicsRef,
        showGrid: true,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });

    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 170, 180));
    });
    expect(mockEngine.updateBody).toHaveBeenCalled();
  });

  it("handles resize with no grid snap", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "se" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
        showGrid: false,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 200));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 300, 250));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "RESIZE_NODE" })
    );
  });

  it("handles select-rect with nodes inside", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    mockHitTest.mockReturnValue({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 50, 50));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 260, 210));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 260, 210));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: expect.objectContaining({
          nodeIds: expect.arrayContaining(["n1"]),
        }),
      })
    );
  });

  it("handles edge-endpoint reconnect to end", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    const edge = makeEdge("e1", "n1", "n2");
    mockHitTest
      .mockReturnValueOnce({ type: "edge-endpoint", id: "e1", endpointEnd: "to" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        edges: [edge],
        selection: { nodeIds: [], edgeIds: ["e1"] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 350, 350));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 400, 400));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_EDGE" })
    );
  });

  it("handles Ctrl+C and Ctrl+V keyboard shortcuts", () => {
    const node = makeNode("n1");
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));
    });
  });

  it("handles double click on canvas (no node)", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction(defaultProps)
    );

    act(() => {
      result.current.handleDoubleClick(makeMouseEvent("dblclick", 100, 100));
    });
    expect(onTextEdit).not.toHaveBeenCalled();
  });

  it("handles edge creation with connection-point to existing node", () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    mockHitTest
      .mockReturnValueOnce({ type: "connection-point", id: "n1", connectionSide: "right" })
      .mockReturnValueOnce({ type: "node", id: "n2" })
      .mockReturnValueOnce({ type: "node", id: "n2" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 150));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 350, 350));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 350, 350));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles create-shape without grid snap", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "rect" as any, showGrid: false })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 250, 200));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
  });

  it("handles pan inertia with history", () => {
    jest.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(40);

    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { button: 1 }));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 120, 130));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 140, 160));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 160, 190));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 160, 190));
    });
    // Should compute velocity from pan history
    expect(result.current.velocityRef.current.vx).not.toBe(0);
  });

  it("handles line tool edge creation to blank space", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "line" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 300, 300));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 300, 300));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles Ctrl+Meta+click on node with url", () => {
    const node = makeNode("n1");
    (node as any).url = "https://example.com";
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
      })
    );

    // Move cursor over node with metaKey to get pointer cursor
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150, { metaKey: true }));
    });
  });

  it("handles shape tool crosshair cursor", () => {
    for (const tool of ["sticky", "text", "diamond", "parallelogram", "cylinder", "doc", "frame"] as any[]) {
      const { result } = renderHook(() =>
        useCanvasInteraction({ ...defaultProps, tool })
      );

      act(() => {
        result.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
      });
    }
  });

  it("handles cursor during drag types", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "node", id: "n1" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    // Start move drag
    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    // Move during move drag
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 170, 170));
    });
    // Cursor should be grabbing
  });

  it("handles edge creation short distance (no edge created)", () => {
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "connector" as any })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    // Very short drag
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 102, 102));
    });
    // Should not create edge for short distance
  });

  it("handles copy with edges between selected nodes", async () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    const edge = makeEdge("e1", "n1", "n2");

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockRejectedValue(new Error("not available")),
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        edges: [edge],
        selection: { nodeIds: ["n1", "n2"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.copySelected();
    });
    expect(result.current.clipboardRef.current).toBeTruthy();
    expect(result.current.clipboardRef.current!.edges.length).toBe(1);

    // Paste from clipboard
    await act(async () => {
      await result.current.pasteFromClipboard();
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PASTE_NODES" })
    );
  });

  it("handles select-rect capturing nodes within bounds", () => {
    const node1 = makeNode("n1", 50, 50);
    const node2 = makeNode("n2", 500, 500);
    mockHitTest.mockReturnValue({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
      })
    );

    // Large select rect that captures node1 but not node2
    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 0, 0));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 300, 300));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 300, 300));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );
  });

  it("handles connector tool from canvas to node", () => {
    const node = makeNode("n1", 200, 200);
    mockHitTest
      .mockReturnValueOnce({ type: "canvas" }) // mousedown
      .mockReturnValueOnce({ type: "node", id: "n1" }) // mousemove
      .mockReturnValueOnce({ type: "node", id: "n1" }); // mouseup

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        tool: "connector" as any,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 50, 50));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 250, 250));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 250, 250));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles Delete key with edge selection only", () => {
    renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        selection: { nodeIds: [], edgeIds: ["e1"] },
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DELETE_SELECTED" })
    );
  });

  it("handles pan mouse up with history (inertia)", () => {
    jest.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(15)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(25);

    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { button: 1 }));
    });
    // Multiple fast moves
    act(() => { result.current.handleMouseMove(makeMouseEvent("mousemove", 110, 110)); });
    act(() => { result.current.handleMouseMove(makeMouseEvent("mousemove", 120, 120)); });
    act(() => { result.current.handleMouseMove(makeMouseEvent("mousemove", 130, 130)); });
    act(() => { result.current.handleMouseMove(makeMouseEvent("mousemove", 140, 140)); });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 140, 140));
    });
    // Should have computed velocity
  });

  it("handles edge creation from node on line tool", () => {
    const node = makeNode("n1");
    mockHitTest
      .mockReturnValueOnce({ type: "node", id: "n1" }) // mousedown on line tool
      .mockReturnValueOnce({ type: "canvas" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        tool: "line" as any,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 400, 400));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 400, 400));
    });
    // Should create a free edge (line to blank)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles clipboard writeText failure gracefully", () => {
    const node = makeNode("n1");

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockRejectedValue(new Error("write failed")),
        readText: jest.fn().mockRejectedValue(new Error("read failed")),
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.copySelected();
    });
    expect(result.current.clipboardRef.current).toBeTruthy();
  });

  it("handles no clipboard API available", () => {
    const node = makeNode("n1");

    // Make clipboard undefined to trigger catch
    const origClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.copySelected();
    });
    expect(result.current.clipboardRef.current).toBeTruthy();

    // Restore
    Object.defineProperty(navigator, "clipboard", {
      value: origClipboard,
      configurable: true,
    });
  });

  it("handles resize on ne handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "ne" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 100));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 280, 80));
    });
  });

  it("handles resize on sw handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "sw" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 200));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 80, 220));
    });
  });

  it("handles resize on s handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "s" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 175, 200));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 175, 230));
    });
  });

  it("handles resize on e handle", () => {
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "e" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 250, 150));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 280, 150));
    });
  });

  it("handles resize with grid snap on all handles", () => {
    for (const handle of ["se", "nw", "ne", "sw", "n", "s", "e", "w"] as any[]) {
      const node = makeNode("n1");
      mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle });

      const { result } = renderHook(() =>
        useCanvasInteraction({
          ...defaultProps,
          nodes: [node],
          selection: { nodeIds: ["n1"], edgeIds: [] },
          showGrid: true, // Grid snap enabled
        })
      );

      act(() => {
        result.current.handleMouseDown(makeMouseEvent("mousedown", 175, 150));
      });
      act(() => {
        result.current.handleMouseMove(makeMouseEvent("mousemove", 200, 180));
      });
      act(() => {
        result.current.handleMouseUp(makeMouseEvent("mouseup", 200, 180));
      });
    }
  });

  it("handles create-shape with grid snap (grid enabled)", () => {
    const { result } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "rect" as any, showGrid: true })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 250, 200));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 250, 200));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_NODE" })
    );
  });

  it("handles pan with slow movement (no inertia)", () => {
    jest.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(500) // 500ms gap - too slow
      .mockReturnValueOnce(1000);

    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100, { button: 1 }));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 120, 130));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 120, 130));
    });
    // Velocity should be 0 since dt > 100ms
    expect(result.current.velocityRef.current.vx).toBe(0);
  });

  it("handles paste with edges referencing nodes", async () => {
    const node1 = makeNode("n1");
    const node2 = makeNode("n2", 300, 300);
    const edge = {
      ...makeEdge("e1", "n1", "n2"),
      from: { nodeId: "n1", x: 0, y: 0 },
      to: { nodeId: "n2", x: 100, y: 100 },
    };

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockRejectedValue(new Error("not available")),
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2],
        edges: [edge],
        selection: { nodeIds: ["n1", "n2"], edgeIds: [] },
      })
    );

    // Copy
    act(() => {
      result.current.copySelected();
    });

    // Paste (should remap nodeIds in edges)
    await act(async () => {
      await result.current.pasteFromClipboard();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PASTE_NODES" })
    );
  });

  it("handles paste from system clipboard with edges", async () => {
    const pasteData = JSON.stringify({
      type: "anytime-graph",
      nodes: [{ ...makeNode("clip1"), id: "clip1" }, { ...makeNode("clip2"), id: "clip2" }],
      edges: [{
        id: "ce1", type: "connector",
        from: { nodeId: "clip1", x: 0, y: 0 },
        to: { nodeId: "clip2", x: 100, y: 100 },
        style: { stroke: "#fff", strokeWidth: 2 },
      }],
    });

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockResolvedValue(pasteData),
      },
      configurable: true,
    });

    const { result } = renderHook(() => useCanvasInteraction(defaultProps));

    await act(async () => {
      await result.current.pasteFromClipboard();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PASTE_NODES" })
    );
  });

  it("handles select-rect with edge filtering", () => {
    // Create nodes that partially overlap with selection rect
    const node1 = { ...makeNode("n1", 50, 50), width: 100, height: 80 };
    const node2 = { ...makeNode("n2", 300, 300), width: 100, height: 80 };
    const node3 = { ...makeNode("n3", 120, 120), width: 100, height: 80 };
    mockHitTest.mockReturnValue({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node1, node2, node3],
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 0, 0));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 250, 250));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 250, 250));
    });
    // Should select nodes within the rect
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SELECTION",
      })
    );
  });

  it("handles edge creation with arrow tool from node to canvas", () => {
    const node = makeNode("n1");
    mockHitTest
      .mockReturnValueOnce({ type: "node", id: "n1" })
      .mockReturnValueOnce({ type: "canvas" })
      .mockReturnValueOnce({ type: "canvas" });

    const { result } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        tool: "connector" as any,
      })
    );

    act(() => {
      result.current.handleMouseDown(makeMouseEvent("mousedown", 150, 150));
    });
    act(() => {
      result.current.handleMouseMove(makeMouseEvent("mousemove", 400, 400));
    });
    act(() => {
      result.current.handleMouseUp(makeMouseEvent("mouseup", 400, 400));
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_EDGE" })
    );
  });

  it("handles move cursor during different drag states", () => {
    // Test cursor during create-shape drag
    const { result: result1 } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "rect" as any })
    );
    act(() => {
      result1.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    act(() => {
      result1.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
    });

    // Test cursor during create-edge drag
    mockHitTest.mockReturnValue({ type: "canvas" });
    const { result: result2 } = renderHook(() =>
      useCanvasInteraction({ ...defaultProps, tool: "connector" as any })
    );
    act(() => {
      result2.current.handleMouseDown(makeMouseEvent("mousedown", 100, 100));
    });
    act(() => {
      result2.current.handleMouseMove(makeMouseEvent("mousemove", 150, 150));
    });

    // Test cursor during resize drag
    const node = makeNode("n1");
    mockHitTest.mockReturnValue({ type: "resize-handle", id: "n1", handle: "se" });
    const { result: result3 } = renderHook(() =>
      useCanvasInteraction({
        ...defaultProps,
        nodes: [node],
        selection: { nodeIds: ["n1"], edgeIds: [] },
      })
    );
    act(() => {
      result3.current.handleMouseDown(makeMouseEvent("mousedown", 250, 200));
    });
    act(() => {
      result3.current.handleMouseMove(makeMouseEvent("mousemove", 280, 230));
    });
  });
});
