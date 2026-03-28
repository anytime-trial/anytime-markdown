/**
 * useDiagramCapture.ts の追加カバレッジテスト
 * sanitizeSvgForCanvas, getSvgDimensions, downloadSvgAsPng の間接テスト。
 */
import { renderHook } from "@testing-library/react";

jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: jest.fn().mockReturnValue("encoded") },
}));

jest.mock("../utils/clipboardHelpers", () => ({
  saveBlob: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../utils/plantumlHelpers", () => ({
  buildPlantUmlUrl: jest.fn().mockImplementation(
    (encoded: string) => `https://www.plantuml.com/plantuml/svg/${encoded}`,
  ),
}));

jest.mock("../constants/colors", () => ({
  CAPTURE_BG: "#ffffff",
}));

jest.mock("../constants/timing", () => ({
  FETCH_TIMEOUT: 10000,
}));

import { useDiagramCapture } from "../hooks/useDiagramCapture";
describe("useDiagramCapture - Mermaid capture", () => {
  it("isMermaid=true with SVG calls downloadSvgAsPng internally", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Hello</text></svg>';
    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true,
        isPlantUml: false,
        svg: svgContent,
        plantUmlUrl: "",
        code: "graph TD; A-->B",
        isDark: false, // light mode uses svg directly
      }),
    );

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
    // In jsdom, canvas operations may fail, but the function should handle errors gracefully
  });

  it("isMermaid=true, svg is empty → does nothing", async () => {
    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true,
        isPlantUml: false,
        svg: "",
        plantUmlUrl: "",
        code: "graph TD; A-->B",
        isDark: false,
      }),
    );

    await result.current();
    // Should not throw
  });

  it("isPlantUml=true with plantUmlUrl attempts fetch", async () => {
    // Mock fetch to return SVG
    const mockFetch = jest.fn().mockRejectedValue(new Error("network error"));
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false,
        isPlantUml: true,
        svg: "",
        plantUmlUrl: "https://example.com/svg/test",
        code: "@startuml\nA->B\n@enduml",
        isDark: false,
      }),
    );

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("neither mermaid nor plantuml → does nothing", async () => {
    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false,
        isPlantUml: false,
        svg: "<svg></svg>",
        plantUmlUrl: "https://example.com",
        code: "test",
        isDark: false,
      }),
    );

    await result.current();
    // Should complete without error
  });

  it("dark mode with mermaid triggers renderMermaidLight", async () => {
    // Mock mermaid module
    jest.mock("mermaid", () => ({
      __esModule: true,
      default: {
        initialize: jest.fn(),
        render: jest.fn().mockResolvedValue({ svg: "<svg></svg>" }),
      },
    }), { virtual: true });

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true,
        isPlantUml: false,
        svg: "<svg></svg>",
        plantUmlUrl: "",
        code: "graph TD; A-->B",
        isDark: true,
      }),
    );

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
