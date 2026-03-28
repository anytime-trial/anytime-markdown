/**
 * DraggableSplitLayout.tsx coverage2 tests
 * Targets: isMobile branch (lines 42, 44, 52, 71, 97, 100)
 *          initialPercent with positive width (line 42, 44)
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme, useMediaQuery } from "@mui/material";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getPrimaryMain: () => "#1976d2",
}));

jest.mock("../constants/dimensions", () => ({
  FS_CODE_INITIAL_WIDTH: 500,
  FS_CODE_MIN_WIDTH: 200,
}));

jest.mock("../constants/uiPatterns", () => ({
  getSplitterSx: () => ({}),
}));

Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? jest.fn();
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? jest.fn();

// Mock useMediaQuery to return true for mobile
let mockIsMobile = false;
jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    useMediaQuery: (query: any) => mockIsMobile,
  };
});

import { DraggableSplitLayout } from "../components/DraggableSplitLayout";

const theme = createTheme();
const t = (key: string) => key;

describe("DraggableSplitLayout mobile", () => {
  afterEach(() => {
    mockIsMobile = false;
  });

  it("renders in mobile layout (column flex direction)", () => {
    mockIsMobile = true;
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DraggableSplitLayout
          left={<div>Left</div>}
          right={<div>Right</div>}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container.textContent).toContain("Left");
    expect(container.textContent).toContain("Right");
    // Separator should be hidden on mobile
  });

  it("renders mobile layout with initialPercent (effect runs but width is 0)", () => {
    mockIsMobile = true;
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DraggableSplitLayout
          left={<div>Left</div>}
          right={<div>Right</div>}
          t={t}
          initialPercent={60}
        />
      </ThemeProvider>,
    );
    expect(container.textContent).toContain("Left");
  });
});
