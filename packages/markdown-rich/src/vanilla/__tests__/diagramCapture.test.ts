/**
 * diagramCapture のユニットテスト
 * jsdom で Canvas / mermaid 実レンダリングは不可能なため seam を mock する。
 */

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  CAPTURE_BG: "#ffffff",
  FETCH_TIMEOUT: 5000,
  saveBlob: jest.fn(),
  buildPlantUmlUrl: (encoded: string) => `https://plantuml.example.com/svg/${encoded}`,
}));

jest.mock("../../hooks/useMermaidRender", () => ({
  enqueueRender: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock("../../hooks/usePlantUmlRender", () => ({
  buildPlantUmlImageUrl: jest.fn((code: string, isDark: boolean) => `https://plantuml.example.com/svg/enc?dark=${isDark}`),
}));

jest.mock("../../utils/diagramAltText", () => ({
  extractDiagramAltText: (_code: string, type: string) => `${type} diagram`,
}));

import { captureDiagramPng, exportDiagramSource } from "../diagramCapture";
import { saveBlob } from "@anytime-markdown/markdown-viewer";

describe("exportDiagramSource", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Mermaid ソースを .mmd として保存する", async () => {
    await exportDiagramSource("graph LR\nA-->B", true);
    expect(saveBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "mermaid.mmd",
    );
  });

  it("PlantUML ソースを .puml として保存する", async () => {
    await exportDiagramSource("@startuml\nA->B\n@enduml", false);
    expect(saveBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "plantuml.puml",
    );
  });
});

describe("captureDiagramPng", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("isMermaid=false, isPlantUml=false では何もしない", async () => {
    await captureDiagramPng({ isMermaid: false, isPlantUml: false, svg: undefined, plantUmlUrl: undefined, code: "", isDark: false });
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("mermaid + svg なし では何もしない", async () => {
    await captureDiagramPng({ isMermaid: true, isPlantUml: false, svg: undefined, plantUmlUrl: undefined, code: "graph", isDark: false });
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
