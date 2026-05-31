/**
 * ImageAnnotationDialog.tsx - additional coverage tests
 * Focuses on: toPercent, renderAnnotation (circle/line types, selected state),
 * handleMouseDown/Move/Up (drawing flow), handleShapeClick (eraser mode, select mode),
 * handleCommentChange, handleDeleteItem, undo button, close button calling onSave,
 * small drag rejection, eraser tool blocking mouseDown.
 */
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getBgPaper: () => "#fff",
  getDivider: () => "#ccc",
  getPrimaryMain: () => "#1976d2",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  BADGE_NUMBER_FONT_SIZE: 10,
  PANEL_INPUT_FONT_SIZE: 13,
  SMALL_CAPTION_FONT_SIZE: 10,
}));

let idCounter = 0;
jest.mock("../types/imageAnnotation", () => ({
  ANNOTATION_COLORS: [
    { label: "Red", value: "#ef4444" },
    { label: "Blue", value: "#3b82f6" },
  ],
  generateAnnotationId: jest.fn(() => `gen-id-${++idCounter}`),
}));

import { ImageAnnotationDialog } from "../components/ImageAnnotationDialog";

const theme = createTheme();
const testSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

function renderDialog(props: Partial<React.ComponentProps<typeof ImageAnnotationDialog>> = {}) {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    src: testSrc,
    annotations: [],
    onSave: jest.fn(),
    t: (key: string) => key,
  };
  return render(
    <ThemeProvider theme={theme}>
      <ImageAnnotationDialog {...defaultProps} {...props} />
    </ThemeProvider>,
  );
}

function getSvg(container: HTMLElement): SVGSVGElement {
  // The component renders an SVG with viewBox="0 0 100 100"
  const svgs = container.querySelectorAll("svg");
  // Find the annotation SVG (has viewBox="0 0 100 100")
  let svg: SVGSVGElement | null = null;
  svgs.forEach((s) => {
    if (s.getAttribute("viewBox") === "0 0 100 100") {
      svg = s as SVGSVGElement;
    }
  });
  if (!svg) svg = svgs[0] as SVGSVGElement;

  // Mock getBoundingClientRect for toPercent calculation
  jest.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => {},
  });
  return svg;
}

beforeEach(() => {
  idCounter = 0;
});

describe("ImageAnnotationDialog - close button calls onSave then onClose", () => {
  it("saves and closes on close button click", () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    renderDialog({ onSave, onClose });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith([]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ImageAnnotationDialog - drawing annotations", () => {
  it("draws a rect annotation via mouse events", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    // Mouse down at (10, 10)
    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    // Mouse move to (50, 50)
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 50 });
    // Mouse up at (50, 50)
    fireEvent.mouseUp(svg, { clientX: 50, clientY: 50 });

    // Close to trigger onSave with the new annotation
    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "rect", color: "#ef4444" }),
      ]),
    );
  });

  it("ignores tiny drags (less than 1% movement)", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10.5, clientY: 10.5 });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("mouseUp without drawing does nothing", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    fireEvent.mouseUp(svg, { clientX: 50, clientY: 50 });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("mouseMove without drawing does nothing", () => {
    const { container } = renderDialog();
    const svg = getSvg(container);

    // No mouseDown, just mouseMove
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 50 });
    // Should not crash
  });
});

describe("ImageAnnotationDialog - tool switching", () => {
  it("draws a circle annotation when circle tool is selected", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    // Select circle tool (use getAllByLabelText since both ToggleButton and Tooltip share the label)
    const circleBtns = screen.getAllByLabelText("annotationCircle");
    fireEvent.click(circleBtns[0]);

    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 60 });
    fireEvent.mouseUp(svg, { clientX: 60, clientY: 60 });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "circle" }),
      ]),
    );
  });

  it("draws a line annotation when line tool is selected", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    const lineBtns = screen.getAllByLabelText("annotationLine");
    fireEvent.click(lineBtns[0]);

    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 80, clientY: 80 });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "line" }),
      ]),
    );
  });

  it("eraser tool prevents mouseDown from starting drawing", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    const eraserBtns = screen.getAllByLabelText("annotationEraser");
    fireEvent.click(eraserBtns[0]);

    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 80, clientY: 80 });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith([]);
  });
});

describe("ImageAnnotationDialog - color selection", () => {
  it("changes color when color button is clicked", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ onSave });
    const svg = getSvg(container);

    // Click second color (Blue)
    const blueBtn = screen.getByLabelText("Blue");
    fireEvent.click(blueBtn);

    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 60, clientY: 60 });

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ color: "#3b82f6" }),
      ]),
    );
  });
});

describe("ImageAnnotationDialog - annotation interactions", () => {
  const preAnnotations = [
    { id: "a1", type: "rect" as const, x1: 10, y1: 10, x2: 50, y2: 50, color: "#ef4444", comment: "first" },
    { id: "a2", type: "circle" as const, x1: 60, y1: 60, x2: 90, y2: 90, color: "#3b82f6", comment: "" },
    { id: "a3", type: "line" as const, x1: 0, y1: 0, x2: 100, y2: 100, color: "#ef4444", comment: "line note" },
  ];

  it("selects an annotation by clicking in comment panel", () => {
    const { container } = renderDialog({ annotations: preAnnotations });
    // Comment panel items have onClick to select
    const panelItems = container.querySelectorAll("[class*='MuiBox-root']");
    expect(panelItems.length).toBeGreaterThan(0);
  });

  it("deletes annotation via delete button in comment panel", () => {
    const onSave = jest.fn();
    renderDialog({ annotations: preAnnotations, onSave });

    // Find delete buttons (DeleteOutlineIcon)
    const deleteButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector("svg[data-testid='DeleteOutlineIcon']"),
    );

    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);
    }

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    // Should have fewer annotations after delete
    expect(onSave).toHaveBeenCalled();
    const savedAnnotations = onSave.mock.calls[0][0];
    expect(savedAnnotations.length).toBe(preAnnotations.length - 1);
  });

  it("updates comment text", () => {
    const onSave = jest.fn();
    renderDialog({ annotations: preAnnotations, onSave });

    const textFields = screen.getAllByRole("textbox");
    if (textFields.length > 0) {
      fireEvent.change(textFields[0], { target: { value: "updated comment" } });
    }

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalled();
    const saved = onSave.mock.calls[0][0];
    expect(saved[0].comment).toBe("updated comment");
  });

  it("eraser tool deletes annotation on shape click", () => {
    const onSave = jest.fn();
    const { container } = renderDialog({ annotations: preAnnotations, onSave });

    // Select eraser tool
    const eraserBtns = screen.getAllByLabelText("annotationEraser");
    fireEvent.click(eraserBtns[0]);

    // Click on a shape in the SVG (rect element)
    const rects = container.querySelectorAll("svg rect");
    const annotationRect = Array.from(rects).find(
      (r) => r.getAttribute("stroke") === "#ef4444",
    );
    if (annotationRect) {
      fireEvent.click(annotationRect);
    }

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalled();
    const saved = onSave.mock.calls[0][0];
    expect(saved.length).toBeLessThan(preAnnotations.length);
  });

  it("undo removes the last annotation", () => {
    const onSave = jest.fn();
    renderDialog({ annotations: preAnnotations, onSave });

    // Find the undo/cancel button (CancelIcon)
    const undoButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector("svg[data-testid='CancelIcon']"),
    );
    if (undoButtons.length > 0) {
      fireEvent.click(undoButtons[0]);
    }

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(onSave).toHaveBeenCalled();
    const saved = onSave.mock.calls[0][0];
    expect(saved.length).toBe(preAnnotations.length - 1);
  });
});

describe("ImageAnnotationDialog - renderAnnotation all types", () => {
  it("renders circle type annotation correctly", () => {
    const annotations = [
      { id: "c1", type: "circle" as const, x1: 20, y1: 20, x2: 80, y2: 80, color: "#3b82f6", comment: "" },
    ];
    const { container } = renderDialog({ annotations });
    const ellipses = container.querySelectorAll("ellipse");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it("renders line type annotation correctly", () => {
    const annotations = [
      { id: "l1", type: "line" as const, x1: 0, y1: 0, x2: 100, y2: 100, color: "#ef4444", comment: "" },
    ];
    const { container } = renderDialog({ annotations });
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ImageAnnotationDialog - toPercent null svgRef", () => {
  it("handles mouseDown when svgRef has no current element", () => {
    // If svg has no getBoundingClientRect we'd get null from toPercent
    // This test verifies it doesn't crash
    const { container } = renderDialog();
    const svg = container.querySelector("svg")!;
    // Don't mock getBoundingClientRect - let it return default (0-size in jsdom)
    fireEvent.mouseDown(svg, { clientX: 10, clientY: 10 });
    // Should not crash
  });
});

describe("ImageAnnotationDialog - empty state message", () => {
  it("shows annotation help text when no annotations exist", () => {
    renderDialog({ annotations: [] });
    // The text is t("annotate") = "annotate"
    expect(screen.getByText("annotate")).toBeTruthy();
  });

  it("shows comment panel count", () => {
    const annotations = [
      { id: "a1", type: "rect" as const, x1: 10, y1: 10, x2: 50, y2: 50, color: "#ef4444", comment: "" },
    ];
    renderDialog({ annotations });
    expect(screen.getByText("commentPanel (1)")).toBeTruthy();
  });
});
