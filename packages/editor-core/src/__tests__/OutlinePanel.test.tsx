import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { OutlinePanel } from "../components/OutlinePanel";
import type { HeadingItem } from "../types";

// next-intl モック（コンポーネント自体は t を props で受け取るが、依存先で必要になる場合に備える）
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const theme = createTheme();
const t = (key: string) => key;

/** テスト用の最小限 props を生成 */
function createDefaultProps(overrides: Partial<Parameters<typeof OutlinePanel>[0]> = {}) {
  return {
    outlineWidth: 220,
    setOutlineWidth: jest.fn(),
    editorHeight: 600,
    headings: [] as HeadingItem[],
    foldedIndices: new Set<number>(),
    hiddenByFold: new Set<number>(),
    foldAll: jest.fn(),
    unfoldAll: jest.fn(),
    toggleFold: jest.fn(),
    handleOutlineClick: jest.fn(),
    handleOutlineResizeStart: jest.fn(),
    t,
    ...overrides,
  };
}

/** ThemeProvider でラップしてレンダリング */
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe("OutlinePanel", () => {
  // --- 1. 最小限の props でクラッシュしない ---
  test("空の headings 配列でクラッシュせずレンダリングされる", () => {
    const props = createDefaultProps();
    const { container } = renderWithTheme(<OutlinePanel {...props} />);
    expect(container.firstChild).toBeTruthy();
  });

  test("headings が空の場合 noHeadings メッセージが表示される", () => {
    const props = createDefaultProps();
    renderWithTheme(<OutlinePanel {...props} />);
    const nav = screen.getByRole("navigation");
    expect(nav.textContent).toContain("noHeadings");
  });

  // --- 2. headings が渡された場合に見出し項目が表示される ---
  test("headings prop に見出しを渡すとテキストが表示される", () => {
    const headings: HeadingItem[] = [
      { level: 1, text: "Introduction", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 2, text: "Details", pos: 10, kind: "heading", headingIndex: 1 },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    // 各見出しのテキスト要素は role="button" + tabIndex=0 の Box
    // 折りたたみ IconButton も role="button" なので、aria-expanded を持たないものでフィルタ
    const allButtons = screen.getAllByRole("button");
    const textButtons = allButtons.filter(
      (btn) => !btn.hasAttribute("aria-expanded") && /Introduction|Details/.test(btn.textContent || ""),
    );
    expect(textButtons.length).toBe(2);
    expect(textButtons[0].textContent).toBe("Introduction");
    expect(textButtons[1].textContent).toBe("Details");
  });

  // --- 3. 見出しクリックで onOutlineClick が呼ばれる ---
  test("見出し項目をクリックすると handleOutlineClick が呼ばれる", () => {
    const handleOutlineClick = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Chapter 1", pos: 42, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, handleOutlineClick });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByRole("button", { name: "Chapter 1" });
    fireEvent.click(btn);
    expect(handleOutlineClick).toHaveBeenCalledWith(42);
  });

  // --- 4. fold/unfold ボタンが表示される ---
  test("headings がある場合 fold/unfold ボタンが表示される", () => {
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    // foldedIndices が空なので foldAll ラベルが表示される
    const foldBtn = screen.getByLabelText("foldAll");
    expect(foldBtn).toBeTruthy();
  });

  test("foldedIndices が非空の場合 unfoldAll ラベルが表示される", () => {
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({
      headings,
      foldedIndices: new Set([0]),
    });
    renderWithTheme(<OutlinePanel {...props} />);

    const unfoldBtn = screen.getByLabelText("unfoldAll");
    expect(unfoldBtn).toBeTruthy();
  });

  // --- 5. fold ボタンクリックで対応するコールバックが呼ばれる ---
  test("foldAll ボタンクリックで foldAll が呼ばれる", () => {
    const foldAll = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, foldAll });
    renderWithTheme(<OutlinePanel {...props} />);

    const foldBtn = screen.getByLabelText("foldAll");
    fireEvent.click(foldBtn);
    expect(foldAll).toHaveBeenCalledTimes(1);
  });

  test("unfoldAll ボタンクリックで unfoldAll が呼ばれる", () => {
    const unfoldAll = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({
      headings,
      foldedIndices: new Set([0]),
      unfoldAll,
    });
    renderWithTheme(<OutlinePanel {...props} />);

    const unfoldBtn = screen.getByLabelText("unfoldAll");
    fireEvent.click(unfoldBtn);
    expect(unfoldAll).toHaveBeenCalledTimes(1);
  });

  // --- toggleFold ---
  test("見出しの折りたたみボタンクリックで toggleFold が呼ばれる", () => {
    const toggleFold = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, toggleFold });
    renderWithTheme(<OutlinePanel {...props} />);

    // 各見出しには aria-expanded を持つ折りたたみボタンがある
    const expandBtn = screen.getByLabelText('Collapse Title');
    fireEvent.click(expandBtn);
    expect(toggleFold).toHaveBeenCalledWith(0);
  });
});
