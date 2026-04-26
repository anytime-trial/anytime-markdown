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

describe("CardAreaPanel", () => {
  it("renders category area title", () => {
    render(<CardAreaPanel {...baseProps} />);
    expect(screen.getByText("sitesCategoryArea")).toBeTruthy();
  });

  it("renders add button", () => {
    render(<CardAreaPanel {...baseProps} />);
    expect(screen.getByText("sitesCategoryAdd")).toBeTruthy();
  });

  it("shows empty message when no categories", () => {
    render(<CardAreaPanel {...baseProps} />);
    expect(screen.getByText("sitesEmpty")).toBeTruthy();
  });

  it("renders categories", () => {
    const categories = [
      {
        id: "cat1",
        title: "Category 1",
        description: "Desc",
        items: [],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("Category 1")).toBeTruthy();
  });

  it("renders category with items", () => {
    const categories = [
      {
        id: "cat1",
        title: "Category 1",
        description: "",
        items: [{ docKey: "doc1", displayName: "Doc 1" }],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("Doc 1")).toBeTruthy();
  });

  it("renders category description", () => {
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "Some description here",
        items: [],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("Some description here")).toBeTruthy();
  });

  it("shows empty category message", () => {
    const categories = [
      {
        id: "cat1",
        title: "Empty Cat",
        description: "",
        items: [],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("sitesCategoryEmpty")).toBeTruthy();
  });

  it("renders multiple categories", () => {
    const categories = [
      { id: "cat1", title: "First", description: "", items: [], order: 0 },
      { id: "cat2", title: "Second", description: "", items: [], order: 1 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("renders drag overlay when activeCategory is set", () => {
    const activeCategory = {
      id: "active",
      title: "Active Category",
      description: "",
      items: [],
      order: 0,
    };
    const categories = [activeCategory];
    render(<CardAreaPanel {...baseProps} categories={categories} activeCategory={activeCategory} />);
    // The DragOverlay renders the active category title
    const titles = screen.getAllByText("Active Category");
    expect(titles.length).toBeGreaterThanOrEqual(2); // One in card, one in overlay
  });

  it("renders placeholder texts for untitled categories", () => {
    const categories = [
      {
        id: "cat1",
        title: "",
        description: "",
        items: [],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("sitesCategoryTitle")).toBeTruthy();
    expect(screen.getByText("sitesCategoryDescription")).toBeTruthy();
  });

  it("calls onAdd when add button clicked", () => {
    const onAdd = jest.fn();
    render(<CardAreaPanel {...baseProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("sitesCategoryAdd"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("renders delete button for categories", () => {
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    const deleteBtn = screen.getByLabelText("sitesCategoryDelete");
    expect(deleteBtn).toBeTruthy();
  });

  it("calls onDelete when delete button clicked", () => {
    const onDelete = jest.fn();
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("sitesCategoryDelete"));
    expect(onDelete).toHaveBeenCalledWith("cat1");
  });

  it("renders remove button for items", () => {
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [{ docKey: "doc1", displayName: "Doc 1" }],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    const removeBtn = screen.getByLabelText("sitesCategoryRemoveItem");
    expect(removeBtn).toBeTruthy();
  });
});
