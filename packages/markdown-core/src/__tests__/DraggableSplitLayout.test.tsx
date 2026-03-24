/**
 * DraggableSplitLayout.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

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

import { DraggableSplitLayout } from "../components/DraggableSplitLayout";

const theme = createTheme();
const t = (key: string) => key;

describe("DraggableSplitLayout", () => {
  it("renders left and right panels", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DraggableSplitLayout
          left={<div>Left</div>}
          right={<div>Right</div>}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
    expect(container.textContent).toContain("Left");
    expect(container.textContent).toContain("Right");
  });
});
