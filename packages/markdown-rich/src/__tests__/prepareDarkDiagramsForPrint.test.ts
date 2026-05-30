/**
 * prepareDarkDiagramsForPrint tests
 *
 * markdown-core の useEditorFileOps.coverage3 から移設 (B-5)。
 * prerenderMermaidLight / replacePlantUmlLight の挙動を直接検証する。
 */
const mockMermaidInit = jest.fn();
const mockMermaidRender = jest.fn().mockResolvedValue({ svg: "<svg>light-theme</svg>" });
jest.mock("mermaid", () => ({
  __esModule: true,
  default: { initialize: mockMermaidInit, render: mockMermaidRender },
}));

const mockEncode = jest.fn((code: string) => `encoded_${code.length}`);
jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: mockEncode },
}));

jest.mock(
  "@anytime-markdown/markdown-core",
  () => ({
    buildPlantUmlUrl: (encoded: string) => `https://plantuml.test/svg/${encoded}`,
    MERMAID_RENDER_TIMEOUT: 5000,
  }),
  { virtual: true },
);

import { prepareDarkDiagramsForPrint } from "../pdf/prepareDarkDiagramsForPrint";

/** img.src への代入で onload を非同期発火させ、replacePlantUmlLight の load 待ちを解消する */
function patchImgSrcAutoLoad(): () => void {
  const orig = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    set(val: string) {
      orig.set!.call(this, val);
      Promise.resolve().then(() => this.onload?.call(this, new Event("load")));
    },
    get() {
      return orig.get!.call(this);
    },
    configurable: true,
  });
  return () => Object.defineProperty(HTMLImageElement.prototype, "src", orig);
}

function addMermaidWrapper(opts: { svg?: boolean; code?: string }): void {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-node-view-wrapper", "");
  const imgBox = document.createElement("div");
  imgBox.setAttribute("role", "img");
  const innerDiv = document.createElement("div");
  innerDiv.textContent = "dark svg";
  imgBox.appendChild(innerDiv);
  if (opts.svg !== false) {
    imgBox.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
  }
  wrapper.appendChild(imgBox);
  if (opts.code !== undefined) {
    const code = document.createElement("code");
    code.textContent = opts.code;
    wrapper.appendChild(code);
  }
  document.body.appendChild(wrapper);
}

function addPlantUmlWrapper(opts: { code?: string }): void {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-node-view-wrapper", "");
  const img = document.createElement("img");
  img.setAttribute("src", "https://www.plantuml.com/plantuml/svg/abc");
  wrapper.appendChild(img);
  if (opts.code !== undefined) {
    const code = document.createElement("code");
    code.textContent = opts.code;
    wrapper.appendChild(code);
  }
  document.body.appendChild(wrapper);
}

describe("prepareDarkDiagramsForPrint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.querySelectorAll("[data-node-view-wrapper]").forEach((el) => el.remove());
    document.querySelectorAll('[id^="dprint-mermaid-"]').forEach((el) => el.remove());
  });

  it("prerenders mermaid diagrams with light theme and restores dark after", async () => {
    addMermaidWrapper({ code: "graph TD; A-->B;" });
    const { hasChanges, applyBeforePrint, restore } = await prepareDarkDiagramsForPrint();

    expect(mockMermaidInit).toHaveBeenCalledWith(expect.objectContaining({ theme: "default" }));
    expect(mockMermaidInit).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
    expect(hasChanges).toBe(true);

    const imgBox = document.querySelector<HTMLElement>("[role='img']")!;
    const innerDiv = imgBox.querySelector<HTMLElement>(":scope > div")!;
    applyBeforePrint();
    expect(innerDiv.innerHTML).toContain("light-theme");
    restore();
    expect(imgBox.innerHTML).toContain("dark svg");
  });

  it("skips mermaid wrapper without svg element", async () => {
    addMermaidWrapper({ svg: false, code: "graph TD;" });
    const { hasChanges } = await prepareDarkDiagramsForPrint();
    expect(mockMermaidRender).not.toHaveBeenCalled();
    expect(hasChanges).toBe(false);
  });

  it("skips mermaid wrapper without code element", async () => {
    addMermaidWrapper({ code: undefined });
    await prepareDarkDiagramsForPrint();
    expect(mockMermaidRender).not.toHaveBeenCalled();
  });

  it("handles mermaid render failure gracefully", async () => {
    mockMermaidRender.mockRejectedValueOnce(new Error("Parse error"));
    addMermaidWrapper({ code: "invalid" });
    const { hasChanges } = await prepareDarkDiagramsForPrint();
    expect(hasChanges).toBe(false);
  });

  it("cleans up temporary mermaid containers", async () => {
    const leftover = document.createElement("div");
    leftover.id = "dprint-mermaid-1";
    document.body.appendChild(leftover);
    await prepareDarkDiagramsForPrint();
    expect(document.getElementById("dprint-mermaid-1")).toBeNull();
  });

  it("replaces plantuml img src with light theme URL", async () => {
    const restoreSrc = patchImgSrcAutoLoad();
    try {
      addPlantUmlWrapper({ code: "@startuml\nAlice -> Bob\n@enduml" });
      const { hasChanges } = await prepareDarkDiagramsForPrint();
      expect(mockEncode).toHaveBeenCalled();
      expect(hasChanges).toBe(true);
    } finally {
      restoreSrc();
    }
  });

  it("wraps plantuml code in @startuml when no @start directive", async () => {
    const restoreSrc = patchImgSrcAutoLoad();
    try {
      addPlantUmlWrapper({ code: "Alice -> Bob" });
      await prepareDarkDiagramsForPrint();
      expect(mockEncode).toHaveBeenCalledWith(expect.stringContaining("@startuml"));
    } finally {
      restoreSrc();
    }
  });

  it("skips plantuml img without code element", async () => {
    addPlantUmlWrapper({ code: undefined });
    await prepareDarkDiagramsForPrint();
    expect(mockEncode).not.toHaveBeenCalled();
  });
});
