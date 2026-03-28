import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: { mode: "light" },
  }),
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  FS_TOOLBAR_HEIGHT: 32,
  FS_ZOOM_LABEL_WIDTH: 48,
  SMALL_CAPTION_FONT_SIZE: 10,
}));

import { ZoomToolbar } from "../components/ZoomToolbar";

function createFsZP(overrides: Partial<any> = {}) {
  return {
    zoom: 1,
    pan: { x: 0, y: 0 },
    isDirty: false,
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    reset: jest.fn(),
    setZoom: jest.fn(),
    containerRef: { current: null },
    isPanningRef: { current: false },
    handleWheel: jest.fn(),
    handlePointerDown: jest.fn(),
    handlePointerMove: jest.fn(),
    handlePointerUp: jest.fn(),
    ...overrides,
  };
}

const t = (key: string) => key;

describe("ZoomToolbar coverage", () => {
  it("renders zoom controls", () => {
    render(<ZoomToolbar fsZP={createFsZP()} t={t} />);
    expect(screen.getByLabelText("zoomIn")).toBeTruthy();
    expect(screen.getByLabelText("zoomOut")).toBeTruthy();
  });

  it("shows export button when onExport provided", () => {
    const onExport = jest.fn();
    render(<ZoomToolbar fsZP={createFsZP()} onExport={onExport} t={t} />);
    const btn = screen.getByLabelText("capture");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onExport).toHaveBeenCalled();
  });

  it("does not show export button when onExport is undefined", () => {
    render(<ZoomToolbar fsZP={createFsZP()} t={t} />);
    expect(screen.queryByLabelText("capture")).not.toBeTruthy();
  });

  it("shows reset button when isDirty is true", () => {
    render(<ZoomToolbar fsZP={createFsZP({ isDirty: true })} t={t} />);
    expect(screen.getByLabelText("zoomReset")).toBeTruthy();
  });

  it("hides reset button when isDirty is false", () => {
    render(<ZoomToolbar fsZP={createFsZP({ isDirty: false })} t={t} />);
    expect(screen.queryByLabelText("zoomReset")).not.toBeTruthy();
  });

  it("displays zoom percentage", () => {
    render(<ZoomToolbar fsZP={createFsZP({ zoom: 1.5 })} t={t} />);
    expect(screen.getByText("150%")).toBeTruthy();
  });
});
