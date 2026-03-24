/**
 * printStyles.ts のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PrintStyles } from "../styles/printStyles";

const theme = createTheme();

describe("PrintStyles", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <PrintStyles />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
