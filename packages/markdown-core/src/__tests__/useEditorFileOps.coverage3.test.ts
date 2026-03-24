/**
 * useEditorFileOps.ts coverage3 tests
 * Targets remaining uncovered lines:
 *   52-99: prerenderMermaidLight (DOM queries, mermaid render, cleanup)
 *   104-127: replacePlantUmlLight (img src replacement, load promises)
 *   340-341, 350-351, 355: mermaid replacement during print with dark mode
 */
import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@tiptap/react";

jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useTheme: () => ({ palette: { mode: "dark" } }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockConfirm = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({
  __esModule: true,
  default: () => mockConfirm,
}));

const mockedGetMarkdown = jest.fn();
jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  getMarkdownFromEditor: (...args: unknown[]) => mockedGetMarkdown(...args),
}));

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: (md: string) => md,
  preserveBlankLines: (md: string) => md,
}));

jest.mock("../utils/fileReading", () => ({
  readFileAsText: jest.fn().mockResolvedValue({ text: "# Mocked", encoding: "UTF-8", lineEnding: "LF" }),
}));

jest.mock("../utils/editorContentLoader", () => ({
  applyMarkdownToEditor: jest.fn().mockReturnValue({ frontmatter: null, comments: new Map(), body: "" }),
}));

jest.mock("../utils/plantumlHelpers", () => ({
  buildPlantUmlUrl: jest.fn((encoded: string) => `https://plantuml.test/svg/${encoded}`),
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: { sanitize: jest.fn((html: string) => html) },
}));

jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: jest.fn((code: string) => `encoded_${code.length}`) },
}));

const mockMermaidInit = jest.fn();
const mockMermaidRender = jest.fn().mockResolvedValue({ svg: "<svg>light-theme</svg>" });
jest.mock("mermaid", () => ({
  __esModule: true,
  default: { initialize: mockMermaidInit, render: mockMermaidRender },
}));

import { useEditorFileOps } from "../hooks/useEditorFileOps";

function createMockEditor(overrides?: {
  isEmpty?: boolean;
  collapsed?: Array<{ pos: number }>;
  isDestroyed?: boolean;
}): Editor {
  const collapsed = overrides?.collapsed ?? [];
  const mockTr = { setNodeAttribute: jest.fn().mockReturnThis() };
  const mockDoc = {
    descendants: jest.fn((cb: (node: { attrs: { collapsed?: boolean } }, pos: number) => void) => {
      for (const c of collapsed) cb({ attrs: { collapsed: true } }, c.pos);
    }),
  };
  return {
    isEmpty: overrides?.isEmpty ?? true,
    isDestroyed: overrides?.isDestroyed ?? false,
    commands: { clearContent: jest.fn(), setContent: jest.fn(), initComments: jest.fn() },
    state: { doc: mockDoc, tr: mockTr },
    view: { dispatch: jest.fn() },
    storage: { markdown: { parser: { parse: jest.fn((c: string) => c) }, getMarkdown: jest.fn(() => "") } },
  } as unknown as Editor;
}

function setup(opts: Record<string, unknown> = {}) {
  const editor = (opts.editor !== undefined ? opts.editor : createMockEditor()) as Editor | null;
  const hookResult = renderHook(() =>
    useEditorFileOps({
      editor,
      sourceMode: (opts.sourceMode as boolean) ?? false,
      sourceText: (opts.sourceText as string) ?? "",
      setSourceText: jest.fn(),
      saveContent: jest.fn(),
      downloadMarkdown: jest.fn(),
      clearContent: jest.fn(),
      frontmatterRef: { current: null },
    }),
  );
  return { result: hookResult.result, editor };
}

describe("useEditorFileOps - coverage3 (dark mode, mermaid prerender)", () => {
  let printSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockedGetMarkdown.mockReturnValue("");
    printSpy = jest.spyOn(globalThis, "print").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    printSpy.mockRestore();
    document.querySelectorAll("[data-node-view-wrapper]").forEach((el) => el.remove());
    document.querySelectorAll('[id^="dprint-mermaid-"]').forEach((el) => el.remove());
  });

  it("calls globalThis.print() directly when editor is null", async () => {
    const { result } = setup({ editor: null });
    await act(async () => { await result.current.handleExportPdf(); });
    expect(printSpy).toHaveBeenCalled();
  });

  it("prerenders mermaid diagrams with light theme and restores dark after", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const imgBox = document.createElement("div");
    imgBox.setAttribute("role", "img");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const innerDiv = document.createElement("div");
    innerDiv.textContent = "dark svg";
    imgBox.appendChild(innerDiv);
    imgBox.appendChild(svg);
    wrapper.appendChild(imgBox);
    const code = document.createElement("code");
    code.textContent = "graph TD; A-->B;";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });

    expect(printSpy).toHaveBeenCalled();
    expect(mockMermaidInit).toHaveBeenCalledWith(expect.objectContaining({ theme: "default" }));
    expect(mockMermaidInit).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("skips mermaid wrapper without svg element", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const imgBox = document.createElement("div");
    imgBox.setAttribute("role", "img");
    wrapper.appendChild(imgBox);
    const code = document.createElement("code");
    code.textContent = "graph TD;";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
    expect(mockMermaidRender).not.toHaveBeenCalled();
  });

  it("skips mermaid wrapper without code element", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const imgBox = document.createElement("div");
    imgBox.setAttribute("role", "img");
    imgBox.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    wrapper.appendChild(imgBox);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
  });

  it("handles mermaid render failure gracefully", async () => {
    mockMermaidRender.mockRejectedValueOnce(new Error("Parse error"));
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const imgBox = document.createElement("div");
    imgBox.setAttribute("role", "img");
    const innerDiv = document.createElement("div");
    imgBox.appendChild(innerDiv);
    imgBox.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    wrapper.appendChild(imgBox);
    const code = document.createElement("code");
    code.textContent = "invalid";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
  });

  it("cleans up temporary mermaid containers", async () => {
    const leftover = document.createElement("div");
    leftover.id = "dprint-mermaid-1";
    document.body.appendChild(leftover);
    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(document.getElementById("dprint-mermaid-1")).toBeNull();
  });

  it("applies mermaid light HTML in setTimeout with collapsed blocks", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const imgBox = document.createElement("div");
    imgBox.setAttribute("role", "img");
    const innerDiv = document.createElement("div");
    innerDiv.innerHTML = "<svg>dark</svg>";
    imgBox.appendChild(innerDiv);
    imgBox.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    wrapper.appendChild(imgBox);
    const code = document.createElement("code");
    code.textContent = "graph LR; X-->Y;";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);

    const editor = createMockEditor({ collapsed: [{ pos: 10 }] });
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
  });

  it("replaces plantuml img src with light theme URL", async () => {
    const origDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      set(val: string) { origDescriptor.set!.call(this, val); Promise.resolve().then(() => this.onload?.call(this, new Event("load"))); },
      get() { return origDescriptor.get!.call(this); },
      configurable: true,
    });

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const img = document.createElement("img");
    img.setAttribute("src", "https://www.plantuml.com/plantuml/svg/abc");
    wrapper.appendChild(img);
    const code = document.createElement("code");
    code.textContent = "@startuml\nAlice -> Bob\n@enduml";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
    const encoder = require("plantuml-encoder").default;
    expect(encoder.encode).toHaveBeenCalled();
    Object.defineProperty(HTMLImageElement.prototype, "src", origDescriptor);
  });

  it("wraps plantuml code in @startuml when no @start directive", async () => {
    const origDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      set(val: string) { origDescriptor.set!.call(this, val); Promise.resolve().then(() => this.onload?.call(this, new Event("load"))); },
      get() { return origDescriptor.get!.call(this); },
      configurable: true,
    });

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const img = document.createElement("img");
    img.setAttribute("src", "https://www.plantuml.com/plantuml/svg/abc");
    wrapper.appendChild(img);
    const code = document.createElement("code");
    code.textContent = "Alice -> Bob";
    wrapper.appendChild(code);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
    const encoder = require("plantuml-encoder").default;
    expect(encoder.encode).toHaveBeenCalledWith(expect.stringContaining("@startuml"));
    Object.defineProperty(HTMLImageElement.prototype, "src", origDescriptor);
  });

  it("skips plantuml img without code element", async () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    const img = document.createElement("img");
    img.setAttribute("src", "https://www.plantuml.com/plantuml/svg/abc");
    wrapper.appendChild(img);
    document.body.appendChild(wrapper);

    const editor = createMockEditor();
    const { result } = setup({ editor });
    await act(async () => { await result.current.handleExportPdf(); });
    act(() => { jest.advanceTimersByTime(500); });
    expect(printSpy).toHaveBeenCalled();
  });
});
