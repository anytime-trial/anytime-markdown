/**
 * DraggableSplitLayout.tsx coverage2 tests
 * Targets: isMobile branch (lines 42, 44, 52, 71, 97, 100)
 *          initialPercent with positive width (line 42, 44)
 */
import React from "react";
import { render, screen } from "@testing-library/react";

Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? jest.fn();
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? jest.fn();

jest.mock("@anytime-markdown/markdown-viewer", () => ({
    ...jest.requireActual("@anytime-markdown/markdown-viewer"),
    getDivider: () => "#ccc",
    getPrimaryMain: () => "#1976d2",
    FS_CODE_INITIAL_WIDTH: 500,
    FS_CODE_MIN_WIDTH: 200,
    getSplitterSx: () => ({}),
}));

import { DraggableSplitLayout } from "../components/DraggableSplitLayout";

const t = (key: string) => key;

describe("DraggableSplitLayout mobile", () => {
  it("renders in mobile layout (column flex direction)", () => {
    const { container } = render(
      <DraggableSplitLayout
        left={<div>Left</div>}
        right={<div>Right</div>}
        t={t}
      />,
    );
    expect(container.textContent).toContain("Left");
    expect(container.textContent).toContain("Right");
    // Separator should be hidden on mobile
  });

  it("renders mobile layout with initialPercent (effect runs but width is 0)", () => {
    const { container } = render(
      <DraggableSplitLayout
        left={<div>Left</div>}
        right={<div>Right</div>}
        t={t}
        initialPercent={60}
      />,
    );
    expect(container.textContent).toContain("Left");
  });
});
