import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

// --- Mocks ---
let mockSvg: string | null = '<svg viewBox="0 0 200 100" width="100%"><rect /></svg>';
let mockMermaidError: string | null = null;
let mockPlantUmlUrl: string | null = null;
let mockPlantUmlConsent = "pending";

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: React.PropsWithChildren) => <div data-testid="node-view-wrapper">{children}</div>,
  NodeViewContent: () => <code data-testid="node-view-content" />,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: {
      mode: "light",
      primary: { main: "#1976d2" },
      divider: "#e0e0e0",
      text: { secondary: "#666", disabled: "#999" },
      action: { hover: "#f5f5f5" },
      background: { paper: "#fff" },
      grey: { 900: "#212121", 50: "#fafafa" },
    },
    spacing: (n: number) => `${n * 8}px`,
  }),
}));

jest.mock("../../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ fontSize: 16, lineHeight: 1.6, editorBg: "white" }),
}));

jest.mock("../../hooks/useMermaidRender", () => ({
  useMermaidRender: () => ({ svg: mockSvg, error: mockMermaidError, setError: jest.fn() }),
  SVG_SANITIZE_CONFIG: {},
}));

jest.mock("../../hooks/usePlantUmlRender", () => ({
  usePlantUmlRender: () => ({
    plantUmlUrl: mockPlantUmlUrl,
    error: null,
    plantUmlConsent: mockPlantUmlConsent,
    handlePlantUmlAccept: jest.fn(),
    handlePlantUmlReject: jest.fn(),
    setError: jest.fn(),
  }),
}));

jest.mock("../../hooks/useDiagramCapture", () => ({
  useDiagramCapture: () => jest.fn(),
}));

jest.mock("../../hooks/useZoomPan", () => ({
  useZoomPan: () => ({
    zoom: 1, pan: { x: 0, y: 0 }, isPanningRef: { current: false },
    handlePointerDown: jest.fn(), handlePointerMove: jest.fn(), handlePointerUp: jest.fn(), handleWheel: jest.fn(), reset: jest.fn(),
  }),
}));

jest.mock("../../types", () => ({
  usePlantUmlToolbar: () => ({ setSampleAnchorEl: jest.fn() }),
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

jest.mock("../../components/MermaidEditDialog", () => ({
  MermaidEditDialog: ({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) => <div data-testid="fs-dialog">{toolbarExtra}</div>,
}));

jest.mock("../../components/PlantUmlEditDialog", () => ({
  PlantUmlEditDialog: ({ toolbarExtra }: { toolbarExtra?: React.ReactNode }) => <div data-testid="fs-dialog">{toolbarExtra}</div>,
}));



jest.mock("../../utils/diagramAltText", () => ({
  extractDiagramAltText: () => "diagram alt text",
}));

import { DiagramBlock } from "../../components/codeblock/DiagramBlock";

function createMockEditor(): NodeViewProps["editor"] {
  const run = jest.fn();
  const commandFn = jest.fn(() => ({ run }));
  const focus = jest.fn(() => ({ command: commandFn }));
  return {
    chain: jest.fn(() => ({ focus, command: commandFn })),
    commands: { setTextSelection: jest.fn() },
    state: { selection: { from: 0 } },
    schema: { text: jest.fn((t: string) => t) },
  } as unknown as NodeViewProps["editor"];
}

function createMockNode(lang: string) {
  return {
    attrs: { language: lang, collapsed: false, codeCollapsed: true, width: null },
    nodeSize: 10,
    textContent: "graph TD; A-->B",
    content: { size: 15 },
  } as unknown as NodeViewProps["node"];
}

function setup(overrides?: { lang?: string; isSelected?: boolean; editOpen?: boolean }) {
  mockSvg = '<svg viewBox="0 0 200 100" width="100%"><rect /></svg>';
  mockMermaidError = null;
  mockPlantUmlUrl = null;
  mockPlantUmlConsent = "pending";

  const lang = overrides?.lang ?? "mermaid";
  if (lang === "plantuml") {
    mockSvg = null;
    mockPlantUmlUrl = "https://plantuml.com/test.svg";
    mockPlantUmlConsent = "accepted";
  }

  const fsSearch = { reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() };
  const props = {
    editor: createMockEditor(),
    node: createMockNode(lang),
    updateAttributes: jest.fn(),
    getPos: jest.fn(() => 0) as unknown as NodeViewProps["getPos"],
    codeCollapsed: true,
    isSelected: overrides?.isSelected ?? true,
    selectNode: jest.fn(),
    code: "graph TD; A-->B",
    handleCopyCode: jest.fn(),
    handleDeleteBlock: jest.fn(),
    deleteDialogOpen: false,
    setDeleteDialogOpen: jest.fn(),
    editOpen: overrides?.editOpen ?? false,
    setEditOpen: jest.fn(),
    fsCode: "",
    onFsCodeChange: jest.fn(),
    fsTextareaRef: { current: null },
    fsSearch: fsSearch as never,

    handleFsTextChange: jest.fn(),
    t: (key: string) => key,
    isDark: false,
  };
  const result = render(<DiagramBlock {...props} />);
  return { ...result, ...props };
}

describe("DiagramBlock", () => {
  beforeEach(() => {
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn(),
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  // --- Mermaid ---
  test("Mermaid: ラベル表示", () => {
    setup({ lang: "mermaid" });
    expect(screen.getByText("mermaid")).toBeTruthy();
  });

  test("Mermaid: SVG が role=img で表示", () => {
    setup({ lang: "mermaid" });
    expect(screen.getByRole("img")).toBeTruthy();
  });

  test("Mermaid: エラー表示", () => {
    mockMermaidError = "Syntax error in graph";
    mockSvg = null;
    const fsSearch = { reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() };
    render(
      <DiagramBlock
        editor={createMockEditor()}
        node={createMockNode("mermaid")}
        updateAttributes={jest.fn()}
        getPos={jest.fn(() => 0) as unknown as NodeViewProps["getPos"]}
        codeCollapsed={true}
        isSelected={true}
        selectNode={jest.fn()}
        code="invalid"
        handleCopyCode={jest.fn()}
        handleDeleteBlock={jest.fn()}
        deleteDialogOpen={false}
        setDeleteDialogOpen={jest.fn()}
        editOpen={false}
        setEditOpen={jest.fn()}
        fsCode=""
        onFsCodeChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={fsSearch as never}

        handleFsTextChange={jest.fn()}
        t={(key: string) => key}
        isDark={false}
      />
    );
    expect(screen.getByText("Syntax error in graph")).toBeTruthy();
  });

  // --- PlantUML ---
  test("PlantUML: ラベル表示", () => {
    setup({ lang: "plantuml" });
    expect(screen.getByText("plantuml")).toBeTruthy();
  });

  test("PlantUML: consent=pending -> 警告表示", () => {
    mockPlantUmlConsent = "pending";
    mockPlantUmlUrl = null;
    mockSvg = null;
    const fsSearch = { reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() };
    render(
      <DiagramBlock
        editor={createMockEditor()}
        node={createMockNode("plantuml")}
        updateAttributes={jest.fn()}
        getPos={jest.fn(() => 0) as unknown as NodeViewProps["getPos"]}
        codeCollapsed={true}
        isSelected={true}
        selectNode={jest.fn()}
        code="@startuml\nA->B\n@enduml"
        handleCopyCode={jest.fn()}
        handleDeleteBlock={jest.fn()}
        deleteDialogOpen={false}
        setDeleteDialogOpen={jest.fn()}
        editOpen={false}
        setEditOpen={jest.fn()}
        fsCode=""
        onFsCodeChange={jest.fn()}
        fsTextareaRef={{ current: null }}
        fsSearch={fsSearch as never}

        handleFsTextChange={jest.fn()}
        t={(key: string) => key}
        isDark={false}
      />
    );
    expect(screen.getByText("plantumlExternalWarning")).toBeTruthy();
  });

});
