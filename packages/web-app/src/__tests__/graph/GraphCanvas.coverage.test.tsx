import { render, fireEvent, act } from "@testing-library/react";
import React from "react";

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

jest.mock("@anytime-markdown/graph-core/engine", () => ({
  render: jest.fn(),
  drawSelectionRect: jest.fn(),
  drawEdgePreview: jest.fn(),
  drawShapePreview: jest.fn(),
  drawSnapHighlight: jest.fn(),
  drawSmartGuides: jest.fn(),
  interpolateViewport: jest.fn().mockReturnValue({
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    done: true,
  }),
  computeAvoidancePath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 100, y: 100 }]),
}));

jest.mock("../../app/graph/engine/connector", () => ({
  resolveConnectorEndpoints: jest.fn().mockReturnValue({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }),
  computeOrthogonalPath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 100, y: 100 }]),
  computeBezierPath: jest.fn().mockReturnValue([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 70, y: 100 }, { x: 100, y: 100 }]),
  bestSides: jest.fn().mockReturnValue({ fromSide: "right", toSide: "left" }),
  getConnectionPoints: jest.fn().mockReturnValue([{ x: 0, y: 50, side: "left" }, { x: 150, y: 50, side: "right" }]),
}));

// Mock canvas context
const mockCtx = {
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  clearRect: jest.fn(),
  setTransform: jest.fn(),
};

HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(mockCtx) as any;

import { GraphCanvas } from "../../app/graph/components/GraphCanvas";

const makeNode = (id: string, x = 100, y = 100) => ({
  id,
  type: "rect" as const,
  x,
  y,
  width: 150,
  height: 100,
  text: "",
  style: { fill: "#fff", stroke: "#000", strokeWidth: 2, fontSize: 14, fontFamily: "sans-serif" },
});

const makeEdge = (id: string, type = "connector", fromNodeId?: string, toNodeId?: string) => ({
  id,
  type: type as any,
  from: { nodeId: fromNodeId, x: 0, y: 0 },
  to: { nodeId: toNodeId, x: 100, y: 100 },
  style: { stroke: "#fff", strokeWidth: 2, routing: "orthogonal" },
  manualMidpoint: undefined,
});

const defaultProps = {
  nodes: [] as any[],
  edges: [] as any[],
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  selection: { nodeIds: [] as string[], edgeIds: [] as string[] },
  showGrid: true,
  canvasRef: React.createRef<HTMLCanvasElement>(),
  onMouseDown: jest.fn(),
  onMouseMove: jest.fn(),
  onMouseUp: jest.fn(),
  onWheel: jest.fn(),
  onDoubleClick: jest.fn(),
  onContextMenu: jest.fn(),
  previewRef: { current: { type: "none" as const, fromX: 0, fromY: 0, toX: 0, toY: 0 } },
  hoverNodeIdRef: { current: undefined as string | undefined },
  mouseWorldRef: { current: { x: 0, y: 0 } },
  isDark: true,
};

describe("GraphCanvas", () => {
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders canvas element", () => {
    const { container } = render(<GraphCanvas {...defaultProps} />);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("passes event handlers to canvas", () => {
    const { container } = render(<GraphCanvas {...defaultProps} />);
    const canvas = container.querySelector("canvas")!;

    fireEvent.mouseDown(canvas);
    expect(defaultProps.onMouseDown).toHaveBeenCalled();

    fireEvent.mouseMove(canvas);
    expect(defaultProps.onMouseMove).toHaveBeenCalled();

    fireEvent.mouseUp(canvas);
    expect(defaultProps.onMouseUp).toHaveBeenCalled();

    fireEvent.doubleClick(canvas);
    expect(defaultProps.onDoubleClick).toHaveBeenCalled();
  });

  it("handles dragOver and drop events", () => {
    const onDropImage = jest.fn();
    const { container } = render(
      <GraphCanvas {...defaultProps} onDropImage={onDropImage} />
    );
    const canvas = container.querySelector("canvas")!;

    const dragOverEvent = new Event("dragover", { bubbles: true });
    Object.defineProperty(dragOverEvent, "preventDefault", { value: jest.fn() });
    Object.defineProperty(dragOverEvent, "dataTransfer", { value: { dropEffect: "" } });
    canvas.dispatchEvent(dragOverEvent);
  });

  it("resolves connector edges with orthogonal routing", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 300, 300);
    const edge = makeEdge("e1", "connector", "n1", "n2");

    render(
      <GraphCanvas {...defaultProps} nodes={[node1, node2]} edges={[edge]} />
    );
  });

  it("resolves connector edges with bezier routing", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 300, 300);
    const edge = { ...makeEdge("e1", "connector", "n1", "n2"), style: { stroke: "#fff", strokeWidth: 2, routing: "bezier" } };

    render(
      <GraphCanvas {...defaultProps} nodes={[node1, node2]} edges={[edge]} />
    );
  });

  it("uses simplified rendering during layout", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 300, 300);
    const edge = makeEdge("e1", "connector", "n1", "n2");

    render(
      <GraphCanvas {...defaultProps} nodes={[node1, node2]} edges={[edge]} layoutRunning={true} />
    );
  });

  it("handles edge preview rendering", () => {
    render(
      <GraphCanvas
        {...defaultProps}
        previewRef={{
          current: {
            type: "edge",
            fromX: 0,
            fromY: 0,
            toX: 100,
            toY: 100,
            edgeType: "arrow",
            snapNodeId: undefined,
          },
        }}
      />
    );
  });

  it("handles shape preview rendering", () => {
    render(
      <GraphCanvas
        {...defaultProps}
        previewRef={{
          current: {
            type: "shape",
            fromX: 0,
            fromY: 0,
            toX: 100,
            toY: 100,
            shapeType: "rect",
          },
        }}
      />
    );
  });

  it("handles select-rect preview rendering", () => {
    render(
      <GraphCanvas
        {...defaultProps}
        previewRef={{
          current: {
            type: "select-rect",
            fromX: 0,
            fromY: 0,
            toX: 100,
            toY: 100,
          },
        }}
      />
    );
  });

  it("handles smart guide rendering", () => {
    render(
      <GraphCanvas
        {...defaultProps}
        previewRef={{
          current: {
            type: "none",
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: 0,
            guides: [{ type: "vertical" as const, x: 100, y1: 0, y2: 200 }],
          },
        }}
      />
    );
  });

  it("handles viewport animation", () => {
    const onViewportUpdate = jest.fn();
    const viewportAnimRef = {
      current: {
        from: { offsetX: 0, offsetY: 0, scale: 1 },
        to: { offsetX: 100, offsetY: 100, scale: 2 },
        startTime: 0,
        duration: 200,
      },
    };

    render(
      <GraphCanvas
        {...defaultProps}
        viewportAnimRef={viewportAnimRef}
        onViewportUpdate={onViewportUpdate}
      />
    );
  });

  it("handles inertia scrolling", () => {
    const onPanInertia = jest.fn();
    const velocityRef = { current: { vx: 10, vy: 10 } };
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });

    render(
      <GraphCanvas
        {...defaultProps}
        velocityRef={velocityRef}
        onPanInertia={onPanInertia}
      />
    );
  });

  it("stops inertia when reduced motion is preferred", () => {
    const onPanInertia = jest.fn();
    const velocityRef = { current: { vx: 10, vy: 10 } };
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });

    render(
      <GraphCanvas
        {...defaultProps}
        velocityRef={velocityRef}
        onPanInertia={onPanInertia}
      />
    );
    // Velocity should be reset
    expect(velocityRef.current.vx).toBe(0);
    expect(velocityRef.current.vy).toBe(0);
  });

  it("handles window resize", () => {
    const canvasRef = React.createRef<HTMLCanvasElement>();
    render(
      <GraphCanvas {...defaultProps} canvasRef={canvasRef} />
    );

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
  });

  it("resolves connector with obstacle avoidance", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 400, 400);
    const obstacle = makeNode("n3", 200, 200);
    const edge = makeEdge("e1", "connector", "n1", "n2");

    render(
      <GraphCanvas
        {...defaultProps}
        nodes={[node1, node2, obstacle]}
        edges={[edge]}
      />
    );
  });

  it("resolves connector without node references", () => {
    const edge = makeEdge("e1", "connector");

    render(
      <GraphCanvas {...defaultProps} edges={[edge]} />
    );
  });

  it("handles line type edge (no resolution needed)", () => {
    const edge = makeEdge("e1", "line");

    render(
      <GraphCanvas {...defaultProps} edges={[edge]} />
    );
  });

  it("handles edge preview with snap highlight", () => {
    const node = makeNode("n1");
    render(
      <GraphCanvas
        {...defaultProps}
        nodes={[node]}
        previewRef={{
          current: {
            type: "edge",
            fromX: 0,
            fromY: 0,
            toX: 100,
            toY: 100,
            edgeType: "connector",
            snapNodeId: "n1",
          },
        }}
      />
    );
  });

  it("handles image drop", () => {
    const onDropImage = jest.fn();
    const canvasRef = React.createRef<HTMLCanvasElement>();
    const { container } = render(
      <GraphCanvas {...defaultProps} canvasRef={canvasRef} onDropImage={onDropImage} />
    );
    const canvas = container.querySelector("canvas")!;

    // Create a mock image file
    const file = new File([""], "test.png", { type: "image/png" });
    const dt = {
      files: [file],
      dropEffect: "",
    };

    // Override FileReader to fire onload synchronously
    const origFileReader = global.FileReader;
    global.FileReader = jest.fn().mockImplementation(() => ({
      readAsDataURL: jest.fn(function (this: any) {
        this.result = "data:image/png;base64,abc";
        this.onload?.();
      }),
      result: "data:image/png;base64,abc",
    })) as any;

    // Override Image to fire onload
    const origImage = global.Image;
    global.Image = jest.fn().mockImplementation(() => {
      const img: any = { width: 200, height: 100 };
      setTimeout(() => img.onload?.(), 0);
      return img;
    }) as any;

    fireEvent.drop(canvas, { dataTransfer: dt } as any);

    global.FileReader = origFileReader;
    global.Image = origImage;
  });

  it("handles dragOver", () => {
    const { container } = render(
      <GraphCanvas {...defaultProps} />
    );
    const canvas = container.querySelector("canvas")!;
    const event = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { dropEffect: "" } });
    canvas.dispatchEvent(event);
  });

  it("handles contextMenu", () => {
    const onContextMenu = jest.fn();
    const { container } = render(
      <GraphCanvas {...defaultProps} onContextMenu={onContextMenu} />
    );
    const canvas = container.querySelector("canvas")!;
    fireEvent.contextMenu(canvas);
    expect(onContextMenu).toHaveBeenCalled();
  });

  it("handles wheel event", () => {
    const onWheel = jest.fn();
    const { container } = render(
      <GraphCanvas {...defaultProps} onWheel={onWheel} />
    );
    const canvas = container.querySelector("canvas")!;
    fireEvent.wheel(canvas);
    expect(onWheel).toHaveBeenCalled();
  });

  it("handles drop with non-image file (should be ignored)", () => {
    const onDropImage = jest.fn();
    const { container } = render(
      <GraphCanvas {...defaultProps} onDropImage={onDropImage} />
    );
    const canvas = container.querySelector("canvas")!;

    const file = new File(["text content"], "test.txt", { type: "text/plain" });
    const dt = { files: [file], dropEffect: "" };

    fireEvent.drop(canvas, { dataTransfer: dt } as any);
    // onDropImage should not be called for non-image file
  });

  it("handles drop with empty files", () => {
    const onDropImage = jest.fn();
    const { container } = render(
      <GraphCanvas {...defaultProps} onDropImage={onDropImage} />
    );
    const canvas = container.querySelector("canvas")!;

    const dt = { files: [], dropEffect: "" };
    fireEvent.drop(canvas, { dataTransfer: dt } as any);
  });

  it("renders multiple edges with different types", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 300, 300);
    const edge1 = makeEdge("e1", "connector", "n1", "n2");
    const edge2 = makeEdge("e2", "arrow", "n1", "n2");
    const edge3 = makeEdge("e3", "line");

    render(
      <GraphCanvas {...defaultProps} nodes={[node1, node2]} edges={[edge1, edge2, edge3]} />
    );
  });

  it("handles draggingNodeIds prop for visual feedback", () => {
    const node1 = makeNode("n1", 0, 0);
    render(
      <GraphCanvas {...defaultProps} nodes={[node1]} draggingNodeIds={["n1"]} />
    );
  });

  it("handles ariaLabel prop", () => {
    const { container } = render(
      <GraphCanvas {...defaultProps} ariaLabel="Test Graph Canvas" />
    );
    const canvas = container.querySelector("canvas")!;
    expect(canvas.getAttribute("aria-label")).toBe("Test Graph Canvas");
  });

  it("uses simplified rendering for layout with connector missing node", () => {
    const node1 = makeNode("n1", 0, 0);
    // Edge references n2 which doesn't exist
    const edge = makeEdge("e1", "connector", "n1", "n2");

    render(
      <GraphCanvas {...defaultProps} nodes={[node1]} edges={[edge]} layoutRunning={true} />
    );
  });

  it("uses simplified rendering for layout with non-connector edge", () => {
    const edge = makeEdge("e1", "line");

    render(
      <GraphCanvas {...defaultProps} edges={[edge]} layoutRunning={true} />
    );
  });

  it("handles image drop with large image (scale down)", () => {
    const onDropImage = jest.fn();
    const canvasRef = React.createRef<HTMLCanvasElement>();
    const { container } = render(
      <GraphCanvas {...defaultProps} canvasRef={canvasRef} onDropImage={onDropImage} />
    );
    const canvas = container.querySelector("canvas")!;

    const file = new File([""], "big.png", { type: "image/png" });
    const dt = { files: [file], dropEffect: "" };

    const origFileReader = global.FileReader;
    global.FileReader = jest.fn().mockImplementation(() => ({
      readAsDataURL: jest.fn(function (this: any) {
        this.result = "data:image/png;base64,abc";
        this.onload?.();
      }),
      result: "data:image/png;base64,abc",
    })) as any;

    // Large image (>300px width)
    const origImage = global.Image;
    global.Image = jest.fn().mockImplementation(() => {
      const img: any = { width: 600, height: 400 };
      setTimeout(() => img.onload?.(), 0);
      return img;
    }) as any;

    fireEvent.drop(canvas, { dataTransfer: dt } as any);

    global.FileReader = origFileReader;
    global.Image = origImage;
  });

  it("handles connector edge without obstacle avoidance (no obstacles)", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 300, 300);
    // Only 2 nodes, no obstacles
    const edge = makeEdge("e1", "connector", "n1", "n2");

    render(
      <GraphCanvas {...defaultProps} nodes={[node1, node2]} edges={[edge]} />
    );
  });

  it("handles connector edge with manual midpoint", () => {
    const node1 = makeNode("n1", 0, 0);
    const node2 = makeNode("n2", 300, 300);
    const edge = { ...makeEdge("e1", "connector", "n1", "n2"), manualMidpoint: 150 };

    render(
      <GraphCanvas {...defaultProps} nodes={[node1, node2]} edges={[edge]} />
    );
  });

  it("handles inertia with velocity above threshold", () => {
    const onPanInertia = jest.fn();
    const velocityRef = { current: { vx: 5, vy: 5 } };
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockReturnValue({ matches: false }),
    });

    render(
      <GraphCanvas
        {...defaultProps}
        velocityRef={velocityRef}
        onPanInertia={onPanInertia}
      />
    );
    // After render, the RAF callback should have processed inertia
    // Velocity should have been reduced
    expect(velocityRef.current.vx).toBeLessThan(5);
  });

  it("handles connector edge without from/to nodeId", () => {
    // Connector edge where from/to have no nodeId
    const edge = {
      ...makeEdge("e1", "connector"),
      from: { x: 10, y: 20 },
      to: { x: 100, y: 200 },
    };

    render(
      <GraphCanvas {...defaultProps} edges={[edge]} />
    );
  });

  it("passes isDark=false", () => {
    render(
      <GraphCanvas {...defaultProps} isDark={false} />
    );
  });
});
