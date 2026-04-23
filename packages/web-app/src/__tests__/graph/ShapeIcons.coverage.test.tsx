import { render } from "@testing-library/react";
import React from "react";

import {
  DiamondShapeIcon,
  ParallelogramShapeIcon,
  StickyNoteShapeIcon,
  CylinderShapeIcon,
} from "@anytime-markdown/graph-viewer/src/components/ShapeIcons";

describe("ShapeIcons", () => {
  it("renders DiamondShapeIcon", () => {
    const { container } = render(<DiamondShapeIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
  });

  it("renders ParallelogramShapeIcon", () => {
    const { container } = render(<ParallelogramShapeIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders StickyNoteShapeIcon", () => {
    const { container } = render(<StickyNoteShapeIcon />);
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("renders CylinderShapeIcon", () => {
    const { container } = render(<CylinderShapeIcon />);
    expect(container.querySelector("ellipse")).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
  });

  it("passes through SvgIconProps", () => {
    const { container } = render(<DiamondShapeIcon data-testid="diamond" fontSize="large" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });
});
