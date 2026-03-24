import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

// --- Mocks ---
let mockIsSelected = false;

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children }: React.PropsWithChildren) => <div data-testid="node-view-wrapper">{children}</div>,
  NodeViewContent: () => <code data-testid="node-view-content" />,
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
      grey: { 900: "#212121", 50: "#fafafa" },
    },
    spacing: (n: number) => `${n * 8}px`,
  }),
}));

jest.mock("../../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ fontSize: 16, lineHeight: 1.6, editorBg: "white" }),
}));

jest.mock("../../hooks/useTextareaSearch", () => ({
  useTextareaSearch: () => ({ reset: jest.fn(), query: "", setQuery: jest.fn(), matches: [], currentIdx: 0, next: jest.fn(), prev: jest.fn(), replace: jest.fn(), replaceAll: jest.fn() }),
}));

jest.mock("../../hooks/useKatexRender", () => ({
  useKatexRender: () => ({ html: "<span>rendered</span>", error: null }),
  MATH_SANITIZE_CONFIG: {},
}));

jest.mock("../../hooks/useMermaidRender", () => ({
  useMermaidRender: () => ({ svg: '<svg viewBox="0 0 100 100"></svg>', error: null, setError: jest.fn() }),
  SVG_SANITIZE_CONFIG: {},
  detectMermaidType: () => "flowchart",
}));

jest.mock("../../hooks/usePlantUmlRender", () => ({
  usePlantUmlRender: () => ({ plantUmlUrl: null, error: null, plantUmlConsent: "pending", handlePlantUmlAccept: jest.fn(), handlePlantUmlReject: jest.fn(), setError: jest.fn() }),
}));

jest.mock("../../hooks/useDiagramCapture", () => ({
  useDiagramCapture: () => jest.fn(),
}));

jest.mock("../../hooks/useZoomPan", () => ({
  useZoomPan: () => ({ zoom: 1, pan: { x: 0, y: 0 }, isPanningRef: { current: false }, handlePointerDown: jest.fn(), handlePointerMove: jest.fn(), handlePointerUp: jest.fn(), handleWheel: jest.fn(), reset: jest.fn() }),
}));


jest.mock("../../types", () => ({
  usePlantUmlToolbar: () => ({ setSampleAnchorEl: jest.fn() }),
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: { sanitize: (html: string) => html },
}));

// Mock sub-components to verify routing
jest.mock("../../components/codeblock/MathBlock", () => ({
  MathBlock: () => <div data-testid="math-block" />,
}));
jest.mock("../../components/codeblock/HtmlPreviewBlock", () => ({
  HtmlPreviewBlock: () => <div data-testid="html-preview-block" />,
}));
jest.mock("../../components/codeblock/RegularCodeBlock", () => ({
  RegularCodeBlock: () => <div data-testid="regular-code-block" />,
}));
jest.mock("../../components/codeblock/DiagramBlock", () => ({
  DiagramBlock: () => <div data-testid="diagram-block" />,
}));

import { CodeBlockNodeView } from "../../MermaidNodeView";

function createMockEditor(): NodeViewProps["editor"] {
  const run = jest.fn();
  const commandFn = jest.fn((_fn: unknown) => ({ run }));
  const focus = jest.fn(() => ({ command: commandFn }));
  const chain = jest.fn(() => ({ focus, command: commandFn }));
  return {
    chain,
    commands: { setTextSelection: jest.fn() },
    state: { selection: { from: 0 } },
    schema: { text: jest.fn((t: string) => t) },
  } as unknown as NodeViewProps["editor"];
}

function createMockNode(lang?: string) {
  return {
    attrs: { language: lang ?? "", collapsed: false, codeCollapsed: true, width: null },
    nodeSize: 10,
    textContent: "test code",
    content: { size: 9 },
  } as unknown as NodeViewProps["node"];
}

function setup(lang?: string) {
  mockIsSelected = true;
  const editor = createMockEditor();
  const node = createMockNode(lang);
  const updateAttributes = jest.fn();
  const getPos = jest.fn(() => 0);
  const result = render(
    <CodeBlockNodeView
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

describe("CodeBlockNodeView routing", () => {
  beforeEach(() => {
    mockIsSelected = true;
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn(),
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  test("language=math -> MathBlock", () => {
    setup("math");
    expect(screen.getByTestId("math-block")).toBeTruthy();
  });

  test("language=html -> HtmlPreviewBlock", () => {
    setup("html");
    expect(screen.getByTestId("html-preview-block")).toBeTruthy();
  });

  test("language=mermaid -> DiagramBlock", () => {
    setup("mermaid");
    expect(screen.getByTestId("diagram-block")).toBeTruthy();
  });

  test("language=plantuml -> DiagramBlock", () => {
    setup("plantuml");
    expect(screen.getByTestId("diagram-block")).toBeTruthy();
  });

  test("language=javascript -> RegularCodeBlock", () => {
    setup("javascript");
    expect(screen.getByTestId("regular-code-block")).toBeTruthy();
  });
});
