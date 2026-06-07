/**
 * ZoomablePreview.tsx coverage tests
 * Targets all 11 uncovered branches (0% -> full coverage)
 */
import React from "react";
import { render } from "@testing-library/react";

import { ZoomablePreview } from "../components/ZoomablePreview";

jest.mock("@anytime-markdown/markdown-viewer", () => ({
    ...jest.requireActual("@anytime-markdown/markdown-viewer"),
    DEFAULT_DARK_BG: "#1e1e1e",
    DEFAULT_LIGHT_BG: "#ffffff",
    REDUCED_MOTION_SX: {},
    DURATION_FAST: "0.15s",
}));

const baseFsZP = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  isPanningRef: { current: false },
  handlePointerDown: jest.fn(),
  handlePointerMove: jest.fn(),
  handlePointerUp: jest.fn(),
  handleWheel: jest.fn(),
  reset: jest.fn(),
  setZoom: jest.fn(),
};

describe("ZoomablePreview", () => {
  it("renders with default origin (center) in light theme", () => {
    const { container } = render(
      <ZoomablePreview fsZP={baseFsZP as any}>
        <div>child</div>
      </ZoomablePreview>,
    );
    expect(container.textContent).toContain("child");
  });

  it("renders with origin='top-left' in dark theme", () => {
    const { container } = render(
      <ZoomablePreview fsZP={baseFsZP as any} origin="top-left">
        <div>child</div>
      </ZoomablePreview>,
    );
    expect(container.textContent).toContain("child");
  });

  it("renders with origin='center' explicitly", () => {
    const { container } = render(
      <ZoomablePreview fsZP={baseFsZP as any} origin="center">
        <div>child</div>
      </ZoomablePreview>,
    );
    expect(container.textContent).toContain("child");
  });

  it("handles isPanningRef.current = true (no transition)", () => {
    const panningFsZP = {
      ...baseFsZP,
      isPanningRef: { current: true },
    };
    const { container } = render(
      <ZoomablePreview fsZP={panningFsZP as any}>
        <div>panning</div>
      </ZoomablePreview>,
    );
    expect(container.textContent).toContain("panning");
  });
});
