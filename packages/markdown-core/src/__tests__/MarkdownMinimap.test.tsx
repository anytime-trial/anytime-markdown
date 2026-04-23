/**
 * MarkdownMinimap コンポーネントのテスト
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { MarkdownMinimap } from "../components/MarkdownMinimap";

// useMarkdownMinimap をモック
const mockGoToNext = jest.fn();
const mockGoToPrev = jest.fn();
const mockHandleBarClick = jest.fn();

jest.mock("../hooks/useMarkdownMinimap", () => ({
  useMarkdownMinimap: jest.fn(() => ({
    markerRatios: [0.2, 0.6],
    viewportRatio: { top: 0.1, height: 0.3 },
    hasChanges: true,
    handleBarClick: mockHandleBarClick,
    goToNext: mockGoToNext,
    goToPrev: mockGoToPrev,
  })),
}));

function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeProvider theme={createTheme({ palette: { mode: "light" } })}>
      {children}
    </ThemeProvider>
  );
}

describe("MarkdownMinimap", () => {
  beforeEach(() => jest.clearAllMocks());

  it("Prevボタンが存在し、クリックで goToPrev を呼ぶ", () => {
    render(
      <Wrapper>
        <MarkdownMinimap editor={null} editorHeight={600} />
      </Wrapper>,
    );
    const btn = screen.getByRole("button", { name: "前の変更へ" });
    fireEvent.click(btn);
    expect(mockGoToPrev).toHaveBeenCalledTimes(1);
  });

  it("Nextボタンが存在し、クリックで goToNext を呼ぶ", () => {
    render(
      <Wrapper>
        <MarkdownMinimap editor={null} editorHeight={600} />
      </Wrapper>,
    );
    const btn = screen.getByRole("button", { name: "次の変更へ" });
    fireEvent.click(btn);
    expect(mockGoToNext).toHaveBeenCalledTimes(1);
  });

  it("変更なしのとき Prev/Next ボタンが disabled", () => {
    const { useMarkdownMinimap } = require("../hooks/useMarkdownMinimap");
    useMarkdownMinimap.mockReturnValueOnce({
      markerRatios: [],
      viewportRatio: { top: 0, height: 1 },
      hasChanges: false,
      handleBarClick: mockHandleBarClick,
      goToNext: mockGoToNext,
      goToPrev: mockGoToPrev,
    });
    render(
      <Wrapper>
        <MarkdownMinimap editor={null} editorHeight={600} />
      </Wrapper>,
    );
    expect((screen.getByRole("button", { name: "前の変更へ" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "次の変更へ" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
