/**
 * Small component coverage tests
 * Targets: AppIcon
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme();

describe("AppIcon", () => {
  it("renders with default props", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <ThemeProvider theme={theme}><AppIcon /></ThemeProvider>
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
  });

  it("renders with large fontSize", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <ThemeProvider theme={theme}><AppIcon fontSize="large" /></ThemeProvider>
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("renders with medium fontSize", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <ThemeProvider theme={theme}><AppIcon fontSize="medium" /></ThemeProvider>
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("renders with custom src", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <ThemeProvider theme={theme}><AppIcon src="/custom.png" /></ThemeProvider>
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/custom.png");
  });
});
