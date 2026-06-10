/**
 * createMermaidEditDialog のユニットテスト
 */

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  getDivider: () => "#ccc",
  getEditDialogBg: () => "#fff",
  getTextDisabled: () => "#888",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#555",
  getActionHover: () => "rgba(0,0,0,0.04)",
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#ffffff",
  MERMAID_SAMPLES: [],
  FS_CODE_INITIAL_WIDTH: 500,
  FS_CODE_MIN_WIDTH: 120,
  FS_PANEL_HEADER_FONT_SIZE: "0.75rem",
  CHIP_FONT_SIZE: "0.75rem",
  FS_CHIP_HEIGHT: 26,
  FS_ZOOM_LABEL_WIDTH: 36,
  SMALL_CAPTION_FONT_SIZE: "0.75rem",
}));

jest.mock("@anytime-markdown/markdown-viewer/src/ui-vanilla/Dialog", () => ({
  createDialog: ({ onClose }: { onClose: () => void }) => {
    const el = document.createElement("div");
    const paper = document.createElement("div");
    el.appendChild(paper);
    document.body.appendChild(el);
    return { el, paper, destroy: jest.fn(() => el.remove()) };
  },
}));

jest.mock("@anytime-markdown/markdown-viewer/src/ui-vanilla/Tabs", () => ({
  createTabs: () => ({ el: document.createElement("div"), update: jest.fn(), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/markdown-viewer/src/ui-vanilla/Button", () => ({
  createButton: () => ({ el: document.createElement("button"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/markdown-viewer/src/ui-vanilla/IconButton", () => ({
  createIconButton: () => ({ el: document.createElement("button"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/markdown-viewer/src/ui-vanilla/Menu", () => ({
  createMenu: () => ({ el: document.createElement("div"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/markdown-viewer/src/ui-vanilla/MenuItem", () => ({
  createMenuItem: () => ({ el: document.createElement("div"), destroy: jest.fn() }),
}));

jest.mock("../../hooks/useMermaidRender", () => ({
  requestMermaidRender: jest.fn(() => jest.fn()),
}));

jest.mock("../../utils/mermaidConfig", () => ({
  extractMermaidConfig: (code: string) => ({ config: "", body: code }),
  mergeMermaidConfig: (_config: string, body: string) => body,
}));

jest.mock("../../utils/diagramAltText", () => ({
  extractDiagramAltText: () => "mermaid diagram",
}));

jest.mock("../diagramCapture", () => ({
  captureDiagramPng: jest.fn(),
  exportDiagramSource: jest.fn(),
}));

import { createCodeEditState } from "../codeEditState";
import { createMermaidEditDialog } from "../createMermaidEditDialog";
import { requestMermaidRender } from "../../hooks/useMermaidRender";

function makeNode(text: string) {
  return { textContent: text, content: { size: text.length } } as unknown as import("@anytime-markdown/markdown-pm/model").Node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeEditor = () => ({ schema: { text: (s: string) => ({ text: s }) }, chain: () => ({ command: (fn: any) => { fn({ tr: { replaceWith: jest.fn(), delete: jest.fn() } }); return { run: jest.fn() }; } }) } as any);

const t = (key: string) => key;

describe("createMermaidEditDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  it("生成時に dialog が document.body に append される", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("graph LR"), onClose: jest.fn() });
    const handle = createMermaidEditDialog({
      label: "Mermaid", code: "graph LR", svg: undefined,
      isDark: false, editorBg: "#fff", fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    expect(document.body.contains(handle.el)).toBe(true);
    handle.destroy();
  });

  it("svg 未指定のとき requestMermaidRender が呼ばれる", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("graph"), onClose: jest.fn() });
    const handle = createMermaidEditDialog({
      label: "Mermaid", code: "graph", svg: undefined,
      isDark: false, editorBg: "#fff", fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    expect(requestMermaidRender).toHaveBeenCalled();
    handle.destroy();
  });

  it("updateSvg で SVG コンテンツが更新される", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("graph"), onClose: jest.fn() });
    const handle = createMermaidEditDialog({
      label: "Mermaid", code: "graph", svg: "<svg></svg>",
      isDark: false, editorBg: "#fff", fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    // SVG コンテナが存在すること
    const svgContainer = handle.el.querySelector(".am-med-svg");
    handle.updateSvg("<svg><circle/></svg>");
    expect(svgContainer?.innerHTML).toContain("circle");
    handle.destroy();
  });

  it("destroy で dialog が DOM から削除される", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("graph"), onClose: jest.fn() });
    const handle = createMermaidEditDialog({
      label: "Mermaid", code: "graph", svg: undefined,
      isDark: false, editorBg: "#fff", fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    handle.destroy();
    expect(document.body.contains(handle.el)).toBe(false);
  });
});
