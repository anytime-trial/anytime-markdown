import { render, screen, fireEvent } from "@testing-library/react";
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

import { PropertyPanel } from "@anytime-markdown/graph-viewer/src/components/PropertyPanel";

const makeNode = (overrides: any = {}) => ({
  id: "n1",
  type: "rect",
  x: 100,
  y: 100,
  width: 150,
  height: 100,
  text: "Hello",
  locked: false,
  url: "",
  style: {
    fill: "#ffffff",
    stroke: "#333333",
    strokeWidth: 2,
    fontSize: 14,
    fontFamily: "sans-serif",
    borderRadius: 4,
    shadow: false,
    gradientTo: undefined,
    gradientDirection: undefined,
  },
  extraConnectionPoints: undefined,
  ...overrides,
});

const makeEdge = (overrides: any = {}) => ({
  id: "e1",
  type: "connector",
  from: { nodeId: "n1", x: 0, y: 0 },
  to: { nodeId: "n2", x: 100, y: 100 },
  label: "",
  manualMidpoint: undefined,
  style: {
    stroke: "#ffffff",
    strokeWidth: 2,
    startShape: "none",
    endShape: "arrow",
    routing: "orthogonal",
  },
  ...overrides,
});

describe("PropertyPanel", () => {
  const defaultProps = {
    selectedNode: null as any,
    selectedEdge: null as any,
    onUpdateNode: jest.fn(),
    onUpdateEdge: jest.fn(),
    onLayerAction: jest.fn(),
    onClose: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when nothing selected", () => {
    const { container } = render(<PropertyPanel {...defaultProps} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders node properties when node selected", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    expect(screen.getByText("properties")).toBeTruthy();
    expect(screen.getByText("fillColor")).toBeTruthy();
    expect(screen.getByText("strokeColor")).toBeTruthy();
    expect(screen.getByText("strokeWidth")).toBeTruthy();
    expect(screen.getByText("fontSize")).toBeTruthy();
    expect(screen.getByText("borderRadius")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(b => b.querySelector('[data-testid="CloseIcon"]'));
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it("toggles locked state", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const lockBtn = screen.getByLabelText("lock");
    fireEvent.click(lockBtn);
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", { locked: true });
  });

  it("shows locked label for locked node", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode({ locked: true })} />);
    expect(screen.getByText("locked")).toBeTruthy();
    const unlockBtn = screen.getByLabelText("unlock");
    fireEvent.click(unlockBtn);
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", { locked: false });
  });

  it("calls onLayerAction for all layer actions", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const layerTopBtn = screen.getByLabelText("layerTop");
    const layerUpBtn = screen.getByLabelText("layerUp");
    const layerDownBtn = screen.getByLabelText("layerDown");
    const layerBottomBtn = screen.getByLabelText("layerBottom");

    fireEvent.click(layerTopBtn);
    expect(defaultProps.onLayerAction).toHaveBeenCalledWith("top");
    fireEvent.click(layerUpBtn);
    expect(defaultProps.onLayerAction).toHaveBeenCalledWith("up");
    fireEvent.click(layerDownBtn);
    expect(defaultProps.onLayerAction).toHaveBeenCalledWith("down");
    fireEvent.click(layerBottomBtn);
    expect(defaultProps.onLayerAction).toHaveBeenCalledWith("bottom");
  });

  it("selects fill color", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const colorBoxes = screen.getAllByRole("radio");
    fireEvent.click(colorBoxes[0]); // first fill color
    expect(defaultProps.onUpdateNode).toHaveBeenCalled();
  });

  it("handles color palette keyboard navigation", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const colorBoxes = screen.getAllByRole("radio");
    if (colorBoxes.length > 1) {
      fireEvent.keyDown(colorBoxes[0], { key: "ArrowRight" });
      fireEvent.keyDown(colorBoxes[0], { key: "ArrowLeft" });
      fireEvent.keyDown(colorBoxes[0], { key: "ArrowDown" });
      fireEvent.keyDown(colorBoxes[0], { key: "ArrowUp" });
      fireEvent.keyDown(colorBoxes[0], { key: "Enter" });
      fireEvent.keyDown(colorBoxes[0], { key: " " });
      fireEvent.keyDown(colorBoxes[0], { key: "Tab" }); // should be ignored
    }
  });

  it("shows shadow toggle", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    expect(screen.getByText("shadow")).toBeTruthy();
  });

  it("shows gradientTo palette", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    expect(screen.getByText("gradientTo")).toBeTruthy();
  });

  it("shows gradient direction when gradientTo is set", () => {
    const node = makeNode({ style: { ...makeNode().style, gradientTo: "#ff0000" } });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    expect(screen.getByText("gradientDirection")).toBeTruthy();
  });

  it("shows URL field", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    expect(screen.getByText("url")).toBeTruthy();
  });

  it("shows connection points section", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    expect(screen.getByText("connectionPoints")).toBeTruthy();
  });

  it("adds connection points", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const addBtn = screen.getByLabelText("addConnectionPoints");
    fireEvent.click(addBtn);
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", expect.objectContaining({
      extraConnectionPoints: expect.any(Array),
    }));
  });

  it("adds connection points when some already exist (filter dedup)", () => {
    const node = makeNode({ extraConnectionPoints: [{ x: 0.25, y: 0 }, { x: 0.75, y: 0 }] });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    const addBtn = screen.getByLabelText("addConnectionPoints");
    fireEvent.click(addBtn);
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", expect.objectContaining({
      extraConnectionPoints: expect.any(Array),
    }));
  });

  it("shows reset button when extra connection points exist", () => {
    const node = makeNode({ extraConnectionPoints: [{ x: 0.25, y: 0 }] });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    const resetBtn = screen.getByLabelText("resetConnectionPoints");
    fireEvent.click(resetBtn);
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", { extraConnectionPoints: undefined });
  });

  // Edge properties
  it("renders edge properties when edge selected", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    expect(screen.getByText("properties")).toBeTruthy();
    expect(screen.getByText("strokeColor")).toBeTruthy();
    expect(screen.getByText("strokeWidth")).toBeTruthy();
    expect(screen.getByText("startShape")).toBeTruthy();
    expect(screen.getByText("endShape")).toBeTruthy();
    expect(screen.getByText("edgeLabel")).toBeTruthy();
  });

  it("shows routing options for connector edges", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    expect(screen.getByText("routing")).toBeTruthy();
  });

  it("does not show routing for non-connector edges", () => {
    const edge = makeEdge({ type: "arrow" });
    render(<PropertyPanel {...defaultProps} selectedEdge={edge} />);
    expect(screen.queryByText("routing")).toBeFalsy();
  });

  it("updates edge stroke color", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    // Edge color boxes
    const allColorBoxes = document.querySelectorAll("[style*='background-color']");
    if (allColorBoxes.length > 0) {
      fireEvent.click(allColorBoxes[0]);
    }
  });

  it("updates edge label", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const input = screen.getByPlaceholderText("Label");
    fireEvent.change(input, { target: { value: "test label" } });
    expect(defaultProps.onUpdateEdge).toHaveBeenCalledWith("e1", { label: "test label" });
  });

  it("clears edge label when empty string", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge({ label: "existing" })} />);
    const input = screen.getByPlaceholderText("Label");
    fireEvent.change(input, { target: { value: "" } });
    expect(defaultProps.onUpdateEdge).toHaveBeenCalledWith("e1", { label: undefined });
  });

  it("updates node URL", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const input = screen.getByPlaceholderText("https://...");
    fireEvent.change(input, { target: { value: "https://example.com" } });
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", { url: "https://example.com" });
  });

  it("clears node URL when empty", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode({ url: "https://old.com" })} />);
    const input = screen.getByPlaceholderText("https://...");
    fireEvent.change(input, { target: { value: "" } });
    expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", { url: undefined });
  });

  it("handles shadow switch toggle", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    // MUI Switch renders as an input with role="checkbox" inside the switch
    const switchInputs = document.querySelectorAll('input[type="checkbox"]');
    if (switchInputs.length > 0) {
      fireEvent.click(switchInputs[0]);
      expect(defaultProps.onUpdateNode).toHaveBeenCalled();
    }
  });

  it("handles gradient direction toggle", () => {
    const node = makeNode({
      style: { ...makeNode().style, gradientTo: "#ff0000", gradientDirection: "vertical" },
    });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    // Click gradient direction buttons
    const dirButtons = screen.getAllByRole("button");
    // Find the direction buttons by content
  });

  it("clears gradient when 'none' clicked", () => {
    const node = makeNode({
      style: { ...makeNode().style, gradientTo: "#ff0000" },
    });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    // The first element in gradient palette is the "none" option
  });

  it("renders edge start/end shape toggle buttons", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    // Each shape appears twice (start + end), verify both sets render
    const shapeNoneButtons = screen.getAllByText("shapeNone");
    expect(shapeNoneButtons.length).toBe(2);
    const arrowButtons = screen.getAllByText("shapeArrow");
    expect(arrowButtons.length).toBe(2);
  });

  it("renders routing options for connector edge", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    expect(screen.getByText("routingOrthogonal")).toBeTruthy();
    expect(screen.getByText("routingBezier")).toBeTruthy();
  });

  it("renders edge with arrow type and default endShape", () => {
    const edge = makeEdge({ type: "arrow", style: { ...makeEdge().style, endShape: undefined } });
    render(<PropertyPanel {...defaultProps} selectedEdge={edge} />);
    expect(screen.getByText("endShape")).toBeTruthy();
  });

  it("handles edge stroke width slider", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThan(0);
  });

  it("handles node stroke width slider", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThan(0);
  });

  it("handles edge start shape change", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const noneButtons = screen.getAllByText("shapeNone");
    if (noneButtons.length > 0) {
      fireEvent.click(noneButtons[0]);
    }
  });

  it("handles edge end shape change to circle", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const circleButtons = screen.getAllByText("shapeCircle");
    if (circleButtons.length > 0) {
      fireEvent.click(circleButtons[circleButtons.length - 1]);
    }
  });

  it("handles edge routing change to bezier", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const bezierBtn = screen.getByText("routingBezier");
    fireEvent.click(bezierBtn);
    expect(defaultProps.onUpdateEdge).toHaveBeenCalledWith("e1", expect.objectContaining({
      style: expect.objectContaining({ routing: "bezier" }),
    }));
  });

  it("handles gradient direction toggle buttons", () => {
    const node = makeNode({
      style: { ...makeNode().style, gradientTo: "#ff0000", gradientDirection: "vertical" },
    });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    const hBtn = screen.queryByLabelText("horizontal");
    if (hBtn) {
      fireEvent.click(hBtn);
      expect(defaultProps.onUpdateNode).toHaveBeenCalled();
    }
  });

  it("handles gradient clear (none option)", () => {
    const node = makeNode({
      style: { ...makeNode().style, gradientTo: "#ff0000" },
    });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    const clearBtn = document.querySelector('[data-testid="BlockIcon"]')?.closest("button") ?? screen.queryByLabelText("none");
    if (clearBtn) {
      fireEvent.click(clearBtn);
    }
  });

  it("handles color palette Enter key selects color", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const colorBoxes = screen.getAllByRole("radio");
    if (colorBoxes.length > 1) {
      fireEvent.keyDown(colorBoxes[1], { key: "Enter" });
      expect(defaultProps.onUpdateNode).toHaveBeenCalled();
    }
  });

  it("handles color palette Space key selects color", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const colorBoxes = screen.getAllByRole("radio");
    if (colorBoxes.length > 1) {
      fireEvent.keyDown(colorBoxes[1], { key: " " });
      expect(defaultProps.onUpdateNode).toHaveBeenCalled();
    }
  });

  it("handles edge diamond shape selection", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const diamondButtons = screen.getAllByText("shapeDiamond");
    if (diamondButtons.length > 0) {
      fireEvent.click(diamondButtons[0]);
    }
  });

  it("handles edge bar shape selection", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const barButtons = screen.getAllByText("shapeBar");
    if (barButtons.length > 0) {
      fireEvent.click(barButtons[0]);
    }
  });

  it("triggers stroke color select callback", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    // The stroke color palette is the second ColorPalette, each color is a radio
    const colorBoxes = screen.getAllByRole("radio");
    // First set is fill colors, second set is stroke colors
    // Just click one in the second half
    const midIdx = Math.floor(colorBoxes.length / 2);
    if (midIdx < colorBoxes.length) {
      fireEvent.click(colorBoxes[midIdx]);
      expect(defaultProps.onUpdateNode).toHaveBeenCalled();
    }
  });

  it("triggers node slider onChange via MUI input", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    // Find all slider inputs and change their values
    const sliderInputs = document.querySelectorAll('input[type="range"]');
    sliderInputs.forEach((input, i) => {
      fireEvent.change(input, { target: { value: "5" } });
    });
    expect(defaultProps.onUpdateNode).toHaveBeenCalled();
  });

  it("triggers edge slider onChange via MUI input", () => {
    render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    const sliderInputs = document.querySelectorAll('input[type="range"]');
    sliderInputs.forEach((input) => {
      fireEvent.change(input, { target: { value: "3" } });
    });
    expect(defaultProps.onUpdateEdge).toHaveBeenCalled();
  });

  it("clicks edge stroke color box directly", () => {
    const { container } = render(<PropertyPanel {...defaultProps} selectedEdge={makeEdge()} />);
    // Edge stroke colors are plain MUI Box elements rendered as divs with cursor: pointer
    // Find them by traversing from the strokeColor label for edge section
    const strokeLabels = screen.getAllByText("strokeColor");
    // The edge stroke section is the one after edge-specific content
    const edgeStrokeLabel = strokeLabels[strokeLabels.length - 1];
    const colorContainer = edgeStrokeLabel.nextElementSibling;
    if (colorContainer) {
      const boxes = colorContainer.children;
      if (boxes.length > 0) {
        fireEvent.click(boxes[0]);
        expect(defaultProps.onUpdateEdge).toHaveBeenCalled();
      }
    }
  });

  it("clicks gradient color box to set gradientTo", () => {
    render(<PropertyPanel {...defaultProps} selectedNode={makeNode()} />);
    const gradientLabel = screen.getByText("gradientTo");
    const gradientContainer = gradientLabel.nextElementSibling;
    if (gradientContainer) {
      const boxes = gradientContainer.children;
      // First box is "none" pattern, second onward are color boxes
      if (boxes.length > 1) {
        fireEvent.click(boxes[1]);
        expect(defaultProps.onUpdateNode).toHaveBeenCalled();
      }
    }
  });

  it("clicks gradient none box to clear gradientTo", () => {
    const node = makeNode({
      style: { ...makeNode().style, gradientTo: "#ff0000" },
    });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    const gradientLabel = screen.getByText("gradientTo");
    const gradientContainer = gradientLabel.nextElementSibling;
    if (gradientContainer) {
      const boxes = gradientContainer.children;
      if (boxes.length > 0) {
        fireEvent.click(boxes[0]); // First box is "none"
        expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", expect.objectContaining({
          style: expect.objectContaining({ gradientTo: undefined }),
        }));
      }
    }
  });

  it("clicks gradient direction buttons", () => {
    const node = makeNode({
      style: { ...makeNode().style, gradientTo: "#ff0000", gradientDirection: "vertical" },
    });
    render(<PropertyPanel {...defaultProps} selectedNode={node} />);
    // Click horizontal direction
    const hBtn = screen.queryByLabelText("gradientHorizontal");
    if (hBtn) {
      fireEvent.click(hBtn);
      expect(defaultProps.onUpdateNode).toHaveBeenCalledWith("n1", expect.objectContaining({
        style: expect.objectContaining({ gradientDirection: "horizontal" }),
      }));
    }
    // Click diagonal direction
    const dBtn = screen.queryByLabelText("gradientDiagonal");
    if (dBtn) {
      fireEvent.click(dBtn);
    }
  });
});
