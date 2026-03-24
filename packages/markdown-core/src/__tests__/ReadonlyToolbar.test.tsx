/**
 * ReadonlyToolbar.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ReadonlyToolbar } from "../components/ReadonlyToolbar";

const theme = createTheme();
const t = (key: string) => key;

describe("ReadonlyToolbar", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ReadonlyToolbar
          outlineOpen={false}
          onToggleOutline={jest.fn()}
          fontSize={14}
          onFontSizeChange={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with outlineOpen", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ReadonlyToolbar
          outlineOpen={true}
          onToggleOutline={jest.fn()}
          fontSize={16}
          onFontSizeChange={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
