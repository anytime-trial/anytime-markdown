/**
 * FrontmatterBlock.tsx のスモークテスト
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SMALL_CAPTION_FONT_SIZE: 10,
}));

import { FrontmatterBlock } from "../components/FrontmatterBlock";

const theme = createTheme();
const t = (key: string) => key;

describe("FrontmatterBlock", () => {
  it("renders without crashing with null frontmatter", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FrontmatterBlock frontmatter={null} onChange={jest.fn()} t={t} />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with frontmatter text", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FrontmatterBlock
          frontmatter="title: Test\nauthor: Me"
          onChange={jest.fn()}
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders in readOnly mode", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FrontmatterBlock
          frontmatter="title: Test"
          onChange={jest.fn()}
          readOnly
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });

  it("renders with defaultCollapsed", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FrontmatterBlock
          frontmatter="title: Test"
          onChange={jest.fn()}
          defaultCollapsed
          t={t}
        />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});
