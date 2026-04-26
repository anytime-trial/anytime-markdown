/**
 * CardAreaPanel.tsx - 追加カバレッジテスト
 *
 * InlineEditField のインライン編集、ドラッグ&ドロップ、アイテム操作など
 * 既存テストで未カバーのブランチを検証する。
 */

import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  DragOverlay: ({ children }: any) => <div>{children}</div>,
  closestCenter: jest.fn(),
  useSensor: jest.fn().mockReturnValue({}),
  useSensors: jest.fn().mockReturnValue([]),
  PointerSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
}));

jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  rectSortingStrategy: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  sortableKeyboardCoordinates: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

jest.mock("@anytime-markdown/markdown-core", () => ({
  ACCENT_COLOR: "#e8a012",
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#F8F9FA",
}));

import CardAreaPanel from "../app/docs/edit/CardAreaPanel";

const baseProps = {
  categories: [] as any[],
  activeCategory: null,
  sensors: [] as any,
  onDragStart: jest.fn(),
  onDragEnd: jest.fn(),
  onDelete: jest.fn(),
  onRemoveItem: jest.fn(),
  onUpdateField: jest.fn(),
  onUpdateItemDisplayName: jest.fn(),
  onReorderItems: jest.fn(),
  onDropFile: jest.fn(),
  onDropUrl: jest.fn(),
  onAdd: jest.fn(),
  t: ((key: string) => key) as any,
};

describe("CardAreaPanel - InlineEditField", () => {
  it("タイトルクリックで編集モードに入る", () => {
    const categories = [
      { id: "cat1", title: "My Title", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    fireEvent.click(screen.getByText("My Title"));
    // 編集モードに入るとテキストフィールドが表示される
    expect(screen.getByDisplayValue("My Title")).toBeTruthy();
  });

  it("Enter キーで編集を保存する", () => {
    const onUpdateField = jest.fn();
    const categories = [
      { id: "cat1", title: "Old Title", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onUpdateField={onUpdateField} />);

    // Click to enter edit mode
    fireEvent.click(screen.getByText("Old Title"));
    const input = screen.getByDisplayValue("Old Title");
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateField).toHaveBeenCalledWith("cat1", "title", "New Title");
  });

  it("Escape キーで編集をキャンセルする", () => {
    const categories = [
      { id: "cat1", title: "My Title", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);

    fireEvent.click(screen.getByText("My Title"));
    const input = screen.getByDisplayValue("My Title");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });

    // After Escape, should revert to original and exit editing
    expect(screen.getByText("My Title")).toBeTruthy();
  });

  it("blur で編集を保存する", () => {
    const onUpdateField = jest.fn();
    const categories = [
      { id: "cat1", title: "Title", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onUpdateField={onUpdateField} />);

    fireEvent.click(screen.getByText("Title"));
    const input = screen.getByDisplayValue("Title");
    fireEvent.change(input, { target: { value: "Updated" } });
    fireEvent.blur(input);

    expect(onUpdateField).toHaveBeenCalledWith("cat1", "title", "Updated");
  });

  it("値を変更しないで blur した場合は onSave を呼ばない", () => {
    const onUpdateField = jest.fn();
    const categories = [
      { id: "cat1", title: "Same", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onUpdateField={onUpdateField} />);

    fireEvent.click(screen.getByText("Same"));
    const input = screen.getByDisplayValue("Same");
    fireEvent.blur(input);

    expect(onUpdateField).not.toHaveBeenCalled();
  });

  it("description のインライン編集", () => {
    const onUpdateField = jest.fn();
    const categories = [
      { id: "cat1", title: "T", description: "Old Desc", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onUpdateField={onUpdateField} />);

    fireEvent.click(screen.getByText("Old Desc"));
    const input = screen.getByDisplayValue("Old Desc");
    fireEvent.change(input, { target: { value: "New Desc" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateField).toHaveBeenCalledWith("cat1", "description", "New Desc");
  });

  it("アイテムの displayName をインライン編集する", () => {
    const onUpdateItemDisplayName = jest.fn();
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [{ docKey: "doc1", displayName: "Doc Name" }],
        order: 0,
      },
    ];
    render(
      <CardAreaPanel
        {...baseProps}
        categories={categories}
        onUpdateItemDisplayName={onUpdateItemDisplayName}
      />,
    );

    fireEvent.click(screen.getByText("Doc Name"));
    const input = screen.getByDisplayValue("Doc Name");
    fireEvent.change(input, { target: { value: "Updated Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateItemDisplayName).toHaveBeenCalledWith("cat1", "doc1", "Updated Name");
  });

  it("Shift+Enter では保存しない", () => {
    const onUpdateField = jest.fn();
    const categories = [
      { id: "cat1", title: "Title", description: "Desc", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onUpdateField={onUpdateField} />);

    fireEvent.click(screen.getByText("Desc"));
    const input = screen.getByDisplayValue("Desc");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    // Should still be in editing mode, onUpdateField not called
    expect(onUpdateField).not.toHaveBeenCalled();
  });
});

describe("CardAreaPanel - アイテム操作", () => {
  it("onRemoveItem が呼ばれる", () => {
    const onRemoveItem = jest.fn();
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [{ docKey: "doc1", displayName: "Doc 1" }],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onRemoveItem={onRemoveItem} />);

    fireEvent.click(screen.getByLabelText("sitesCategoryRemoveItem"));
    expect(onRemoveItem).toHaveBeenCalledWith("cat1", "doc1");
  });

  it("複数アイテムのレンダリング", () => {
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [
          { docKey: "doc1", displayName: "Doc 1" },
          { docKey: "doc2", displayName: "Doc 2" },
        ],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("Doc 1")).toBeTruthy();
    expect(screen.getByText("Doc 2")).toBeTruthy();
  });
});

describe("CardAreaPanel - DragOverlay", () => {
  it("activeCategory が null の場合 DragOverlay は空", () => {
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    const { container } = render(
      <CardAreaPanel {...baseProps} categories={categories} activeCategory={null} />,
    );
    // Category title appears only once (in card, not in overlay)
    const titles = screen.getAllByText("Cat");
    expect(titles.length).toBe(1);
  });
});
