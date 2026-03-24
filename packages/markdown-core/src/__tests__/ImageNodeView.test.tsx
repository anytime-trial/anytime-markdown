import { render, screen, fireEvent, within } from "@testing-library/react";
import { ImageNodeView } from "../ImageNodeView";
import type { NodeViewProps } from "@tiptap/react";

// --- Mocks ---
let mockIsSelected = false;

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: React.PropsWithChildren) => <div data-testid="node-view-wrapper">{children}</div>,
  useEditorState: () => mockIsSelected,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: {
      mode: "light",
      success: { main: "#4caf50" },
      error: { main: "#f44336" },
      warning: { main: "#ff9800" },
      primary: { main: "#1976d2" },
      divider: "#e0e0e0",
      text: { secondary: "#666", disabled: "#999" },
      action: { hover: "#f5f5f5", selected: "#eee" },
      background: { paper: "#fff" },
      grey: { 900: "#212121" },
    },
    spacing: (n: number) => `${n * 8}px`,
  }),
}));

// --- Helpers ---
function createMockEditor(): NodeViewProps["editor"] {
  // Explicitly type to avoid circular inference
  const run = jest.fn();
  const commandFn = jest.fn((_fn: unknown) => ({ run }));
  const focus = jest.fn(() => ({ command: commandFn }));
  const chain = jest.fn(() => ({ focus }));

  return {
    chain,
    state: {
      selection: { from: 0 },
    },
    storage: {
      image: { onEditImage: jest.fn() },
    },
  } as unknown as NodeViewProps["editor"];
}

function createMockNode(overrides?: Record<string, unknown>) {
  return {
    attrs: {
      src: "https://example.com/image.png",
      alt: "test image",
      title: "Test Title",
      width: "200px",
      collapsed: false,
      ...overrides,
    },
    nodeSize: 1,
  } as unknown as NodeViewProps["node"];
}

function setup(options?: {
  nodeAttrs?: Record<string, unknown>;
  isSelected?: boolean;
  editor?: NodeViewProps["editor"];
}) {
  mockIsSelected = options?.isSelected ?? false;
  const editor = options?.editor ?? createMockEditor();
  const node = createMockNode(options?.nodeAttrs);
  const updateAttributes = jest.fn();
  const getPos = jest.fn(() => 0);

  const result = render(
    <ImageNodeView
      editor={editor}
      node={node}
      updateAttributes={updateAttributes}
      getPos={getPos}
      deleteNode={jest.fn()}
      decorations={[] as unknown as NodeViewProps["decorations"]}
      selected={false}
      extension={null as unknown as NodeViewProps["extension"]}
      HTMLAttributes={{}}
      view={null as unknown as NodeViewProps["view"]}
      innerDecorations={[] as unknown as NodeViewProps["innerDecorations"]}
    />,
  );

  return { ...result, editor, node, updateAttributes, getPos };
}

// --- Tests ---
describe("ImageNodeView", () => {
  beforeEach(() => {
    mockIsSelected = false;
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- 画像表示 ---
  test("画像表示: src, alt, title が img 要素に反映", () => {
    setup({ isSelected: true });
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://example.com/image.png");
    expect(img.getAttribute("alt")).toBe("test image");
    expect(img.getAttribute("title")).toBe("Test Title");
  });

  test("alt が空 → デフォルト alt (imageNoAlt)", () => {
    setup({ nodeAttrs: { alt: "" }, isSelected: true });
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toBe("imageNoAlt");
  });

  // --- ツールバー表示条件 ---
  test("isSelected=true → toolbar の role='toolbar' が存在", () => {
    setup({ isSelected: true });
    expect(screen.getByRole("toolbar")).toBeTruthy();
  });

  test("collapsed=true → toolbar 表示、画像非表示", () => {
    setup({ nodeAttrs: { collapsed: true } });
    expect(screen.getByRole("toolbar")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  // --- editOpen ---
  test("editOpen ボタン → close ボタンが表示される", () => {
    setup({ isSelected: true });
    const fullscreenBtn = screen.getByLabelText("edit");
    fireEvent.click(fullscreenBtn);
    expect(screen.getByLabelText("close")).toBeTruthy();
  });

  // --- delete dialog ---
  test("delete ボタン → 確認 dialog 表示", () => {
    setup({ isSelected: true });
    const deleteBtn = screen.getByLabelText("delete");
    fireEvent.click(deleteBtn);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("clearConfirm")).toBeTruthy();
  });

  test("confirm delete → editor.chain() 呼び出し", () => {
    const editor = createMockEditor();
    setup({ isSelected: true, editor });
    fireEvent.click(screen.getByLabelText("delete"));
    const dialog = screen.getByRole("dialog");
    // Find the delete button inside the dialog (the confirm one)
    const buttons = within(dialog).getAllByRole("button");
    const confirmBtn = buttons.find(
      (btn) => btn.textContent === "delete",
    );
    if (confirmBtn) fireEvent.click(confirmBtn);
    expect(editor.chain).toHaveBeenCalled();
  });

  test("cancel delete → editor.chain() は呼ばれない", () => {
    const editor = createMockEditor();
    setup({ isSelected: true, editor });
    fireEvent.click(screen.getByLabelText("delete"));
    const dialog = screen.getByRole("dialog");
    const cancelBtn = within(dialog).getByText("cancel");
    fireEvent.click(cancelBtn);
    // cancel should NOT trigger delete
    expect(editor.chain).not.toHaveBeenCalled();
  });

  // --- alt text warning ---
  test("alt がない → warning アイコン表示", () => {
    setup({ nodeAttrs: { alt: "" }, isSelected: true });
    const toolbar = screen.getByRole("toolbar");
    expect(toolbar.querySelector("[data-testid='WarningAmberIcon']")).toBeTruthy();
  });

  test("alt がある → alt テキスト表示", () => {
    setup({ isSelected: true });
    expect(screen.getByText("test image")).toBeTruthy();
  });

  // --- src display ---
  test("base64 src → (base64) 表示", () => {
    setup({ nodeAttrs: { src: "data:image/png;base64,abc123" }, isSelected: true });
    expect(screen.getByText("(base64)")).toBeTruthy();
  });

  test("通常 src → URL 表示", () => {
    setup({ isSelected: true });
    expect(screen.getByText("(https://example.com/image.png)")).toBeTruthy();
  });

  // --- resize handle ---
  test("isSelected=true → resize handle (slider) 表示", () => {
    setup({ isSelected: true });
    expect(screen.getByRole("slider")).toBeTruthy();
  });

  test("isSelected=false, collapsed=true → resize handle 非表示", () => {
    setup({ isSelected: false, nodeAttrs: { collapsed: true } });
    expect(screen.queryByRole("slider")).toBeNull();
  });

  // --- drag handle ---
  test("editOpen 時 → inline toolbar 非表示", () => {
    setup({ isSelected: true });
    fireEvent.click(screen.getByLabelText("edit"));
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});
