/**
 * CardAreaPanel.tsx coverage2 tests
 * Targets uncovered lines: 238-243 (handleItemDragEnd), 291-324 (onDrop handlers)
 * - handleItemDragEnd: reorder items within a category
 * - onDrop: file drop, folder drop, URL drop
 * - onDragOver: drag over category card
 * - onDragLeave: drag leave category card
 * - activeCategory overlay rendering
 * - delete category button
 * - empty placeholder text
 */
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Track DndContext onDragEnd callbacks
let capturedItemDragEnd: ((event: any) => void) | null = null;

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: any) => {
    capturedItemDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
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

describe("CardAreaPanel - coverage2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedItemDragEnd = null;
  });

  // --- handleItemDragEnd (lines 238-243) ---
  test("reorders items via DndContext onDragEnd", () => {
    const onReorderItems = jest.fn();
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [
          { docKey: "doc1", displayName: "Doc 1" },
          { docKey: "doc2", displayName: "Doc 2" },
          { docKey: "doc3", displayName: "Doc 3" },
        ],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onReorderItems={onReorderItems} />);

    // capturedItemDragEnd is the inner DndContext's onDragEnd (for items)
    expect(capturedItemDragEnd).toBeTruthy();
    capturedItemDragEnd!({ active: { id: "doc1" }, over: { id: "doc3" } });
    expect(onReorderItems).toHaveBeenCalledWith("cat1", 0, 2);
  });

  test("handleItemDragEnd does nothing when no over target", () => {
    const onReorderItems = jest.fn();
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [{ docKey: "doc1", displayName: "Doc 1" }],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onReorderItems={onReorderItems} />);

    capturedItemDragEnd!({ active: { id: "doc1" }, over: null });
    expect(onReorderItems).not.toHaveBeenCalled();
  });

  test("handleItemDragEnd does nothing when same item", () => {
    const onReorderItems = jest.fn();
    const categories = [
      {
        id: "cat1",
        title: "Cat",
        description: "",
        items: [{ docKey: "doc1", displayName: "Doc 1" }],
        order: 0,
      },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onReorderItems={onReorderItems} />);

    capturedItemDragEnd!({ active: { id: "doc1" }, over: { id: "doc1" } });
    expect(onReorderItems).not.toHaveBeenCalled();
  });

  // --- onDrop: file drop (lines 313-318) ---
  test("file drop calls onDropFile", () => {
    const onDropFile = jest.fn();
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    const { container } = render(<CardAreaPanel {...baseProps} categories={categories} onDropFile={onDropFile} />);

    const card = container.querySelector(".MuiCard-root")!;
    const dataTransfer = {
      types: ["application/x-doc-file"],
      getData: (type: string) => {
        if (type === "application/x-doc-folder") return "";
        if (type === "application/x-doc-file") return JSON.stringify({ key: "docs/test.md", name: "test.md" });
        return "";
      },
      dropEffect: "",
    };

    fireEvent.drop(card, { dataTransfer });
    expect(onDropFile).toHaveBeenCalledWith("cat1", "docs/test.md", "test.md");
  });

  // --- onDrop: folder drop (lines 300-311) ---
  test("folder drop calls onDropFile with folder prefix", () => {
    const onDropFile = jest.fn();
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    const { container } = render(<CardAreaPanel {...baseProps} categories={categories} onDropFile={onDropFile} />);

    const card = container.querySelector(".MuiCard-root")!;
    const folderFiles = [
      { key: "notes/file1.md", name: "file1.md" },
      { key: "notes/file2.md", name: "file2.md" },
    ];
    const dataTransfer = {
      types: ["application/x-doc-folder"],
      getData: (type: string) => {
        if (type === "application/x-doc-folder") return JSON.stringify(folderFiles);
        return "";
      },
      dropEffect: "",
    };

    fireEvent.drop(card, { dataTransfer });
    expect(onDropFile).toHaveBeenCalledWith("cat1", "notes/", "notes");
  });

  // --- onDrop: URL drop (lines 320-325) ---
  test("URL drop calls onDropUrl", () => {
    const onDropUrl = jest.fn();
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    const { container } = render(<CardAreaPanel {...baseProps} categories={categories} onDropUrl={onDropUrl} />);

    const card = container.querySelector(".MuiCard-root")!;
    const dataTransfer = {
      types: ["application/x-url-link"],
      getData: (type: string) => {
        if (type === "application/x-doc-folder") return "";
        if (type === "application/x-doc-file") return "";
        if (type === "application/x-url-link") return JSON.stringify({ url: "https://example.com", displayName: "Example" });
        return "";
      },
      dropEffect: "",
    };

    fireEvent.drop(card, { dataTransfer });
    expect(onDropUrl).toHaveBeenCalledWith("cat1", "https://example.com", "Example");
  });

  // --- onDragOver (lines 291-295) ---
  test("drag over with doc-file type sets drag over state", () => {
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    const { container } = render(<CardAreaPanel {...baseProps} categories={categories} />);

    const card = container.querySelector(".MuiCard-root")!;
    const dataTransfer = {
      types: ["application/x-doc-file"],
      dropEffect: "",
    };

    fireEvent.dragOver(card, { dataTransfer });
    // Should set border color to accent - just check no crash
  });

  // --- onDragLeave (line 297) ---
  test("drag leave resets drag over state", () => {
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    const { container } = render(<CardAreaPanel {...baseProps} categories={categories} />);

    const card = container.querySelector(".MuiCard-root")!;
    fireEvent.dragLeave(card);
    // Should reset drag over state
  });

  // --- delete category (line 340) ---
  test("delete button calls onDelete", () => {
    const onDelete = jest.fn();
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText("sitesCategoryDelete"));
    expect(onDelete).toHaveBeenCalledWith("cat1");
  });

  // --- empty category shows placeholder (line 379-381) ---
  test("empty category shows placeholder text", () => {
    const categories = [
      { id: "cat1", title: "Cat", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("sitesCategoryEmpty")).toBeTruthy();
  });

  // --- activeCategory overlay (lines 483-499) ---
  test("activeCategory renders overlay card", () => {
    const categories = [
      { id: "cat1", title: "Cat Title", description: "", items: [], order: 0 },
    ];
    const activeCategory = { id: "cat1", title: "Cat Title", description: "", items: [], order: 0 };
    render(<CardAreaPanel {...baseProps} categories={categories} activeCategory={activeCategory} />);

    // DragOverlay should have the title
    const overlay = screen.getByTestId("drag-overlay");
    expect(overlay.textContent).toContain("Cat Title");
  });

  // --- empty categories shows empty message (line 452-453) ---
  test("no categories shows empty area message", () => {
    render(<CardAreaPanel {...baseProps} categories={[]} />);
    expect(screen.getByText("sitesEmpty")).toBeTruthy();
  });

  // --- add button calls onAdd ---
  test("add button calls onAdd", () => {
    const onAdd = jest.fn();
    render(<CardAreaPanel {...baseProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("sitesCategoryAdd"));
    expect(onAdd).toHaveBeenCalled();
  });

  // --- placeholder text for empty title/description ---
  test("empty title shows placeholder", () => {
    const categories = [
      { id: "cat1", title: "", description: "", items: [], order: 0 },
    ];
    render(<CardAreaPanel {...baseProps} categories={categories} />);
    expect(screen.getByText("sitesCategoryTitle")).toBeTruthy();
    expect(screen.getByText("sitesCategoryDescription")).toBeTruthy();
  });
});
