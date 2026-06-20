/**
 * createPlantUmlEditDialog のユニットテスト
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
  PLANTUML_SAMPLES: [],
  PLANTUML_CONSENT_KEY: "plantuml_consent",
  FS_CODE_INITIAL_WIDTH: 500,
  FS_CODE_MIN_WIDTH: 120,
  FS_PANEL_HEADER_FONT_SIZE: "0.75rem",
  CHIP_FONT_SIZE: "0.75rem",
  FS_CHIP_HEIGHT: 26,
  FS_ZOOM_LABEL_WIDTH: 36,
  SMALL_CAPTION_FONT_SIZE: "0.75rem",
}));

jest.mock("@anytime-markdown/graph-core/ui-vanilla/Dialog", () => ({
  createDialog: ({ onClose }: { onClose: () => void }) => {
    const el = document.createElement("div");
    const paper = document.createElement("div");
    el.appendChild(paper);
    document.body.appendChild(el);
    return { el, paper, destroy: jest.fn(() => el.remove()) };
  },
}));

jest.mock("@anytime-markdown/graph-core/ui-vanilla/Tabs", () => ({
  createTabs: () => ({ el: document.createElement("div"), update: jest.fn(), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/graph-core/ui-vanilla/Button", () => ({
  createButton: () => ({ el: document.createElement("button"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/graph-core/ui-vanilla/IconButton", () => ({
  createIconButton: () => ({ el: document.createElement("button"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/graph-core/ui-vanilla/Menu", () => ({
  createMenu: () => ({ el: document.createElement("div"), destroy: jest.fn() }),
}));

jest.mock("@anytime-markdown/graph-core/ui-vanilla/MenuItem", () => ({
  createMenuItem: () => ({ el: document.createElement("div"), destroy: jest.fn() }),
}));

jest.mock("../hooks/usePlantUmlRender", () => ({
  buildPlantUmlImageUrl: jest.fn((code: string, isDark: boolean) => `https://plantuml.example.com/svg/enc?dark=${isDark}`),
  getPlantUmlConsent: jest.fn(() => "accepted"),
}));

jest.mock("../utils/plantumlConfig", () => ({
  extractPlantUmlConfig: (code: string) => ({ config: "", body: code }),
  mergePlantUmlConfig: (_config: string, body: string) => body,
}));

jest.mock("../utils/diagramAltText", () => ({
  extractDiagramAltText: () => "plantuml diagram",
}));

jest.mock("../vanilla/diagramCapture", () => ({
  captureDiagramPng: jest.fn(),
  exportDiagramSource: jest.fn(),
}));

import { createCodeEditState } from "../vanilla/codeEditState";
import { createPlantUmlEditDialog } from "../vanilla/createPlantUmlEditDialog";

function makeNode(text: string) {
  return { textContent: text, content: { size: text.length } } as unknown as import("@anytime-markdown/markdown-pm/model").Node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeEditor = () => ({ schema: { text: (s: string) => ({ text: s }) }, chain: () => ({ command: (fn: any) => { fn({ tr: { replaceWith: jest.fn(), delete: jest.fn() } }); return { run: jest.fn() }; } }) } as any);

const t = (key: string) => key;

describe("createPlantUmlEditDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  it("生成時に dialog が document.body に append される（consent=accepted）", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("@startuml"), onClose: jest.fn() });
    const handle = createPlantUmlEditDialog({
      label: "PlantUML", code: "@startuml", plantUmlUrl: "https://plantuml.example.com/svg/enc",
      isDark: false, editorBg: "#fff", fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    expect(document.body.contains(handle.el)).toBe(true);
    handle.destroy();
  });

  it("destroy で dialog が DOM から削除される", () => {
    const state = createCodeEditState({ editor: makeEditor(), pos: 0, node: makeNode("@startuml"), onClose: jest.fn() });
    const handle = createPlantUmlEditDialog({
      label: "PlantUML", code: "@startuml", plantUmlUrl: undefined,
      isDark: false, editorBg: "#fff", fontSize: 16, lineHeight: 1.5,
      state, t, onClose: jest.fn(),
    });
    handle.destroy();
    expect(document.body.contains(handle.el)).toBe(false);
  });
});
