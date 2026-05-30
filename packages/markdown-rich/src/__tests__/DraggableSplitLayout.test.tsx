/**
 * DraggableSplitLayout.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { DraggableSplitLayout } from "../components/DraggableSplitLayout";

jest.mock("@anytime-markdown/markdown-core", () => ({
    ...jest.requireActual("@anytime-markdown/markdown-core"),
    getDivider: () => "#ccc",
    getPrimaryMain: () => "#1976d2",
    FS_CODE_INITIAL_WIDTH: 500,
    FS_CODE_MIN_WIDTH: 200,
    getSplitterSx: () => ({}),
}));

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
