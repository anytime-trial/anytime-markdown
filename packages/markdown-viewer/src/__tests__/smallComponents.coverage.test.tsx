/**
 * Small component coverage tests
 * Targets: AppIcon
 */
import React from "react";
import { render } from "@testing-library/react";


describe("AppIcon", () => {
  it("renders with default props", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <AppIcon />
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
  });

  it("renders with large fontSize", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <AppIcon fontSize="large" />
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("renders with medium fontSize", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <AppIcon fontSize="medium" />
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("renders with custom src", () => {
    const AppIcon = require("../icons/AppIcon").default;
    const { container } = render(
      <AppIcon src="/custom.png" />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/custom.png");
  });
});
