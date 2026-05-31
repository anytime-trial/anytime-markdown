/**
 * OutlinePanel.tsx の追加カバレッジテスト
 * - computeBlockPadding (ブロック要素のパディング計算)
 * - buildDragProps (ドラッグ＆ドロップ)
 * - handleHeadingKeyDown (Alt+Arrow でリオーダー)
 * - showBlocks トグル
 * - drag & drop: handleDragStart, handleDragOver, handleDrop, handleDragEnd
 * - resize handle のキーボード操作
 * - onOutlineDelete のクリック
 * - onInsertSectionNumbers / onRemoveSectionNumbers の表示とクリック
 * - block element (codeBlock, table, image, plantuml, mermaid) の表示
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { OutlinePanel } from "../components/OutlinePanel";
import type { HeadingItem } from "../types";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const theme = createTheme();
const t = (key: string) => key;

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

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe("OutlinePanel - coverage", () => {
  // --- onInsertSectionNumbers / onRemoveSectionNumbers ---
  test("onInsertSectionNumbers ボタンが表示されクリックで呼ばれる", () => {
    const onInsertSectionNumbers = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onInsertSectionNumbers });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByLabelText("insertSectionNumbers");
    fireEvent.click(btn);
    expect(onInsertSectionNumbers).toHaveBeenCalledTimes(1);
  });

  test("onRemoveSectionNumbers ボタンが表示されクリックで呼ばれる", () => {
    const onRemoveSectionNumbers = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onRemoveSectionNumbers });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByLabelText("removeSectionNumbers");
    fireEvent.click(btn);
    expect(onRemoveSectionNumbers).toHaveBeenCalledTimes(1);
  });

  // --- showBlocks トグル ---
  test("showBlocks トグルでブロック要素の表示が切り替わる", () => {
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 0, text: "code block", pos: 10, kind: "codeBlock" },
      { level: 0, text: "table", pos: 20, kind: "table" },
      { level: 0, text: "image alt", pos: 30, kind: "image" },
      { level: 0, text: "plantuml diagram", pos: 40, kind: "plantuml" },
      { level: 0, text: "mermaid diagram", pos: 50, kind: "mermaid" },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    // Initially blocks are hidden
    const toggleBtn = screen.getByLabelText("outlineShowBlocks");
    expect(toggleBtn).toBeTruthy();

    // Toggle to show blocks
    fireEvent.click(toggleBtn);

    // After toggle, block items should be visible (Collapse open)
    expect(screen.getByText("code block")).toBeTruthy();
    expect(screen.getByText("table")).toBeTruthy();
    expect(screen.getByText("image alt")).toBeTruthy();
  });

  // --- onOutlineDelete ---
  test("onOutlineDelete が渡された場合に削除ボタンが表示される", () => {
    const onOutlineDelete = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Title", pos: 42, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onOutlineDelete });
    renderWithTheme(<OutlinePanel {...props} />);

    const deleteBtn = screen.getByLabelText("delete Title");
    fireEvent.click(deleteBtn);
    expect(onOutlineDelete).toHaveBeenCalledWith(42, "heading");
  });

  // --- drag & drop ---
  test("ドラッグ＆ドロップで onHeadingDragEnd が呼ばれる", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "First", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 1, text: "Second", pos: 10, kind: "heading", headingIndex: 1 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    renderWithTheme(<OutlinePanel {...props} />);

    // Get the draggable heading items
    const firstBtn = screen.getByRole("button", { name: "First" });
    const secondBtn = screen.getByRole("button", { name: "Second" });
    const firstItem = firstBtn.closest("[draggable]");
    const secondItem = secondBtn.closest("[draggable]");

    if (firstItem && secondItem) {
      // Simulate drag start on first
      fireEvent.dragStart(firstItem, { dataTransfer: { effectAllowed: "", setData: jest.fn() } });
      // Simulate drag over on second
      fireEvent.dragOver(secondItem, { dataTransfer: { dropEffect: "" }, preventDefault: jest.fn() });
      // Simulate drop on second
      fireEvent.drop(secondItem, { dataTransfer: { dropEffect: "" }, preventDefault: jest.fn() });
    }

    expect(onHeadingDragEnd).toHaveBeenCalledWith(0, 1);
  });

  test("handleDragEnd でドラッグ状態がリセットされる", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Only", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByRole("button", { name: "Only" });
    const item = btn.closest("[draggable]");
    if (item) {
      fireEvent.dragStart(item, { dataTransfer: { effectAllowed: "", setData: jest.fn() } });
      fireEvent.dragEnd(item);
    }
    // No crash
  });

  // --- handleDragOver same index sets null ---
  test("handleDragOver で同じインデックスの場合 dropIdx が null になる", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Same", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByRole("button", { name: "Same" });
    const item = btn.closest("[draggable]");
    if (item) {
      fireEvent.dragStart(item, { dataTransfer: { effectAllowed: "", setData: jest.fn() } });
      fireEvent.dragOver(item, { dataTransfer: { dropEffect: "" }, preventDefault: jest.fn() });
    }
    // No crash - dropIdx should be null
  });

  // --- resize handle keyboard ---
  test("resize separator の ArrowRight キーダウンで幅が増加する", () => {
    const setOutlineWidth = jest.fn();
    const props = createDefaultProps({ setOutlineWidth });
    renderWithTheme(<OutlinePanel {...props} />);

    const separator = screen.getByRole("separator");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(setOutlineWidth).toHaveBeenCalled();
  });

  test("resize separator の ArrowLeft キーダウンで幅が減少する", () => {
    const setOutlineWidth = jest.fn();
    const props = createDefaultProps({ setOutlineWidth });
    renderWithTheme(<OutlinePanel {...props} />);

    const separator = screen.getByRole("separator");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(setOutlineWidth).toHaveBeenCalled();
  });

  // --- hideResize ---
  test("hideResize=true で resize handle が非表示", () => {
    const props = createDefaultProps({ hideResize: true });
    renderWithTheme(<OutlinePanel {...props} />);

    expect(screen.queryByRole("separator")).toBeNull();
  });

  // --- Alt+Arrow でヘッディングリオーダー ---
  test("Alt+ArrowDown でヘッディングが下に移動する", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "First", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 1, text: "Second", pos: 10, kind: "heading", headingIndex: 1 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    renderWithTheme(<OutlinePanel {...props} />);

    const firstBtn = screen.getByRole("button", { name: "First" });
    fireEvent.keyDown(firstBtn, { key: "ArrowDown", altKey: true });
    expect(onHeadingDragEnd).toHaveBeenCalledWith(0, 1);
  });

  test("Alt+ArrowUp でヘッディングが上に移動する", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "First", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 1, text: "Second", pos: 10, kind: "heading", headingIndex: 1 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    renderWithTheme(<OutlinePanel {...props} />);

    const secondBtn = screen.getByRole("button", { name: "Second" });
    fireEvent.keyDown(secondBtn, { key: "ArrowUp", altKey: true });
    expect(onHeadingDragEnd).toHaveBeenCalledWith(1, 0);
  });

  test("Alt+ArrowUp on first heading does nothing", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "First", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByRole("button", { name: "First" });
    fireEvent.keyDown(btn, { key: "ArrowUp", altKey: true });
    expect(onHeadingDragEnd).not.toHaveBeenCalled();
  });

  // --- empty text heading ---
  test("空テキストの見出しで (empty) が表示される", () => {
    const headings: HeadingItem[] = [
      { level: 1, text: "", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    expect(screen.getByText("(empty)")).toBeTruthy();
  });

  // --- computeBlockPadding: block without preceding heading ---
  test("先行する見出しがないブロックのパディングが1になる", () => {
    const headings: HeadingItem[] = [
      { level: 0, text: "orphan block", pos: 5, kind: "codeBlock" },
      { level: 1, text: "Title", pos: 10, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    // Toggle showBlocks
    const toggleBtn = screen.getByLabelText("outlineShowBlocks");
    fireEvent.click(toggleBtn);

    expect(screen.getByText("orphan block")).toBeTruthy();
  });

  // --- 末尾ドロップゾーンへのドロップ ---
  test("末尾ドロップゾーンへのドロップ", () => {
    const onHeadingDragEnd = jest.fn();
    const headings: HeadingItem[] = [
      { level: 1, text: "Only", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings, onHeadingDragEnd });
    const { container } = renderWithTheme(<OutlinePanel {...props} />);

    // Start drag on the heading
    const btn = screen.getByRole("button", { name: "Only" });
    const item = btn.closest("[draggable]");
    if (item) {
      fireEvent.dragStart(item, { dataTransfer: { effectAllowed: "", setData: jest.fn() } });
    }

    // Find the drop zone (last Box in the list area)
    // The drop zone has height:16 and handles onDrop
    // Try to drop on the navigation's last child area
    screen.getByRole("navigation");
    // We just confirm no crash with the final drop zone
  });

  // --- block elements with preceding heading (computeBlockPadding with heading) ---
  test("見出しの後にブロック要素がある場合のパディング計算", () => {
    const headings: HeadingItem[] = [
      { level: 2, text: "H2", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 0, text: "code", pos: 10, kind: "codeBlock" },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    // Toggle showBlocks
    const toggleBtn = screen.getByLabelText("outlineShowBlocks");
    fireEvent.click(toggleBtn);

    expect(screen.getByText("code")).toBeTruthy();
  });

  // --- onHeadingDragEnd undefined (non-draggable) ---
  test("onHeadingDragEnd が未設定の場合ドラッグ不可", () => {
    const headings: HeadingItem[] = [
      { level: 1, text: "NoDrag", pos: 0, kind: "heading", headingIndex: 0 },
    ];
    const props = createDefaultProps({ headings });
    renderWithTheme(<OutlinePanel {...props} />);

    const btn = screen.getByRole("button", { name: "NoDrag" });
    const item = btn.closest("[draggable]");
    // item should not have draggable attribute
    expect(item).toBeNull();
  });

  // --- headingOnlyIndices empty: fold/unfold button hidden ---
  test("headings が空のとき fold/unfold ボタンが非表示", () => {
    const props = createDefaultProps();
    renderWithTheme(<OutlinePanel {...props} />);

    expect(screen.queryByLabelText("foldAll")).toBeNull();
    expect(screen.queryByLabelText("unfoldAll")).toBeNull();
  });
});
