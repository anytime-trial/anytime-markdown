/**
 * ImageCropTool.tsx のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getTextDisabled: () => "#999",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  CHIP_FONT_SIZE: 12,
  PANEL_BUTTON_FONT_SIZE: 12,
  STATUSBAR_FONT_SIZE: 11,
}));

import { ImageCropTool } from "../components/ImageCropTool";

const theme = createTheme();

describe("ImageCropTool", () => {
  const t = (key: string) => key;
  // 1x1 white PNG as base64
  const testSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ImageCropTool
          src={testSrc}
          onCrop={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders scale preset chips", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ImageCropTool
          src={testSrc}
          onCrop={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    // Scale presets: 25, 50, 75, 100, 150, 200
    expect(container.textContent).toContain("100%");
  });
});
