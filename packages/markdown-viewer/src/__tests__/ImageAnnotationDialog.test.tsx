/**
 * ImageAnnotationDialog.tsx のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
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

jest.mock("../types/imageAnnotation", () => ({
  ANNOTATION_COLORS: ["#f00", "#0f0", "#00f"],
  generateAnnotationId: () => "test-id",
}));

import { ImageAnnotationDialog } from "../components/ImageAnnotationDialog";

const theme = createTheme();

describe("ImageAnnotationDialog", () => {
  const t = (key: string) => key;
  const testSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

  it("does not render when closed", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ImageAnnotationDialog
          open={false}
          onClose={jest.fn()}
          src={testSrc}
          annotations={[]}
          onSave={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders when open with empty annotations", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ImageAnnotationDialog
          open={true}
          onClose={jest.fn()}
          src={testSrc}
          annotations={[]}
          onSave={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with annotations", () => {
    const annotations = [
      { id: "a1", type: "rect" as const, x1: 10, y1: 10, x2: 60, y2: 40, color: "#f00", comment: "test" },
    ];
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ImageAnnotationDialog
          open={true}
          onClose={jest.fn()}
          src={testSrc}
          annotations={annotations}
          onSave={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
