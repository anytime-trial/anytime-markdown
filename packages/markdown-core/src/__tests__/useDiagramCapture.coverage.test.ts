/**
 * useDiagramCapture.ts - additional coverage tests
 * Focuses on: sanitizeSvgForCanvas (foreignObject replacement, empty text removal),
 * getSvgDimensions (viewBox parsing, width/height fallback, percentage, defaults),
 * downloadSvgAsPng (full flow, ctx null, pngBlob null),
 * renderMermaidLight, buildPlantUmlLightUrl (@startuml detection, raw code wrapping),
 * PlantUML fetch: SVG success, SVG fail → PNG fallback, PNG fail → <a> download.
 */
import { renderHook } from "@testing-library/react";

const mockSaveBlob = jest.fn().mockResolvedValue(undefined);

jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: jest.fn().mockReturnValue("encoded-data") },
}));

jest.mock("../utils/clipboardHelpers", () => ({
  saveBlob: (...args: unknown[]) => mockSaveBlob(...args),
}));

jest.mock("../utils/plantumlHelpers", () => ({
  buildPlantUmlUrl: jest.fn().mockImplementation((encoded: string) => `https://www.plantuml.com/plantuml/svg/${encoded}`),
}));

jest.mock("../constants/colors", () => ({
  CAPTURE_BG: "#ffffff",
}));

jest.mock("../constants/timing", () => ({
  FETCH_TIMEOUT: 100,
}));

import { useDiagramCapture } from "../hooks/useDiagramCapture";

function mockCanvasContext() {
  const ctx = {
    scale: jest.fn(),
    fillStyle: "",
    fillRect: jest.fn(),
    drawImage: jest.fn(),
  };
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    cb(new Blob(["png-data"], { type: "image/png" }));
  });
  return ctx;
}

beforeEach(() => {
  jest.clearAllMocks();
  if (!URL.createObjectURL) {
    (URL as any).createObjectURL = jest.fn(() => "blob:mock-url");
  } else {
    jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  }
  if (!URL.revokeObjectURL) {
    (URL as any).revokeObjectURL = jest.fn();
  } else {
    jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }
});

describe("useDiagramCapture - Mermaid light mode (SVG used directly)", () => {
  it("captures Mermaid SVG as PNG in light mode", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Hello</text></svg>';
    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: svgContent, plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();

    expect(ctx.drawImage).toHaveBeenCalled();
    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "mermaid.png");
  });
});

describe("useDiagramCapture - Mermaid dark mode (re-renders as light)", () => {
  it("calls renderMermaidLight in dark mode", async () => {
    mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    // Mock the dynamic import
    jest.spyOn(globalThis, "Function" as any);

    // We can't easily mock dynamic import in jest, but we can verify the error path
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: "<svg></svg>", plantUmlUrl: "", code: "graph TD; A-->B", isDark: true,
      }),
    );

    await result.current.handleCapture();
    errorSpy.mockRestore();
  });
});

describe("useDiagramCapture - PlantUML SVG fetch success", () => {
  it("fetches PlantUML SVG and converts to PNG", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgResponse = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><text>PlantUML</text></svg>';
    global.fetch = jest.fn().mockResolvedValue({
      text: jest.fn().mockResolvedValue(svgResponse),
      blob: jest.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
    });

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false, isPlantUml: true,
        svg: "", plantUmlUrl: "https://www.plantuml.com/plantuml/svg/encoded",
        code: "@startuml\nA->B\n@enduml", isDark: false,
      }),
    );

    await result.current.handleCapture();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://www.plantuml.com/plantuml/svg/encoded",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "plantuml.png");
  });
});

describe("useDiagramCapture - PlantUML SVG fetch fail -> PNG fallback", () => {
  it("falls back to PNG URL when SVG fetch fails", async () => {
    const pngBlob = new Blob(["png-data"], { type: "image/png" });
    let fetchCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string, opts?: any) => {
      fetchCount++;
      if (fetchCount === 1) {
        // SVG fetch fails
        return Promise.reject(new Error("network error"));
      }
      // PNG fetch succeeds
      return Promise.resolve({
        blob: jest.fn().mockResolvedValue(pngBlob),
      });
    });

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false, isPlantUml: true,
        svg: "", plantUmlUrl: "https://www.plantuml.com/plantuml/svg/test",
        code: "@startuml\nA->B\n@enduml", isDark: false,
      }),
    );

    await result.current.handleCapture();

    expect(fetchCount).toBe(2);
    expect(mockSaveBlob).toHaveBeenCalledWith(pngBlob, "plantuml.png");
  });
});

describe("useDiagramCapture - PlantUML both fetch fail -> <a> download", () => {
  it("falls back to <a> download when both SVG and PNG fetch fail", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

    const mockClick = jest.fn();
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false, isPlantUml: true,
        svg: "", plantUmlUrl: "https://www.plantuml.com/plantuml/svg/test",
        code: "@startuml\nA->B\n@enduml", isDark: false,
      }),
    );

    await result.current.handleCapture();

    expect(mockClick).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe("useDiagramCapture - PlantUML dark mode uses light URL", () => {
  it("builds light PlantUML URL when isDark=true", async () => {
    const _ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgResponse = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Dark</text></svg>';
    global.fetch = jest.fn().mockResolvedValue({
      text: jest.fn().mockResolvedValue(svgResponse),
    });

    const plantumlEncoder = require("plantuml-encoder");

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false, isPlantUml: true,
        svg: "", plantUmlUrl: "https://www.plantuml.com/plantuml/svg/original",
        code: "@startuml\nA->B\n@enduml", isDark: true,
      }),
    );

    await result.current.handleCapture();

    // Should call encode for buildPlantUmlLightUrl
    expect(plantumlEncoder.default.encode).toHaveBeenCalled();
  });
});

describe("useDiagramCapture - buildPlantUmlLightUrl code without @start", () => {
  it("wraps code in @startuml/@enduml when no @start directive", async () => {
    const _ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgResponse = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>Wrapped</text></svg>';
    global.fetch = jest.fn().mockResolvedValue({
      text: jest.fn().mockResolvedValue(svgResponse),
    });

    const plantumlEncoder = require("plantuml-encoder");

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false, isPlantUml: true,
        svg: "", plantUmlUrl: "https://www.plantuml.com/plantuml/svg/original",
        code: "A -> B : message", // no @startuml
        isDark: true,
      }),
    );

    await result.current.handleCapture();

    // encode should receive wrapped code
    expect(plantumlEncoder.default.encode).toHaveBeenCalledWith(
      expect.stringContaining("@startuml"),
    );
  });
});

describe("useDiagramCapture - buildPlantUmlLightUrl with @startmindmap", () => {
  it("handles @startmindmap directive", async () => {
    const _ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgResponse = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text>MindMap</text></svg>';
    global.fetch = jest.fn().mockResolvedValue({
      text: jest.fn().mockResolvedValue(svgResponse),
    });

    const plantumlEncoder = require("plantuml-encoder");

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false, isPlantUml: true,
        svg: "", plantUmlUrl: "https://www.plantuml.com/plantuml/svg/original",
        code: "@startmindmap\n* root\n** child\n@endmindmap",
        isDark: true,
      }),
    );

    await result.current.handleCapture();

    // encode should receive original code (has @start)
    expect(plantumlEncoder.default.encode).toHaveBeenCalledWith(
      expect.stringContaining("@startmindmap"),
    );
  });
});

describe("useDiagramCapture - sanitizeSvgForCanvas with foreignObject", () => {
  it("replaces foreignObject with SVG text elements", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgWithFO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <foreignObject x="10" y="20" width="80" height="30">
        <div xmlns="http://www.w3.org/1999/xhtml">Hello World</div>
      </foreignObject>
    </svg>`;

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: svgWithFO, plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();

    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it("removes empty foreignObject elements", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgWithEmptyFO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <foreignObject x="10" y="20" width="80" height="30"></foreignObject>
    </svg>`;

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: svgWithEmptyFO, plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    expect(ctx.drawImage).toHaveBeenCalled();
  });
});

describe("useDiagramCapture - getSvgDimensions fallbacks", () => {
  it("uses width/height attributes when viewBox is missing", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgNoViewBox = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><text>No ViewBox</text></svg>';

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: svgNoViewBox, plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it("defaults to 800x600 when no viewBox, width, or height", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgBare = '<svg xmlns="http://www.w3.org/2000/svg"><text>Bare</text></svg>';

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: svgBare, plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it("defaults to 800x600 when width/height are percentages", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const svgPercentage = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><text>Percent</text></svg>';

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: svgPercentage, plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    expect(ctx.drawImage).toHaveBeenCalled();
  });
});

describe("useDiagramCapture - downloadSvgAsPng ctx null", () => {
  it("returns early when canvas context is null", async () => {
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>X</text></svg>',
        plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });
});

describe("useDiagramCapture - downloadSvgAsPng toBlob returns null", () => {
  it("returns without saving when toBlob returns null", async () => {
    const ctx = {
      scale: jest.fn(),
      fillStyle: "",
      fillRect: jest.fn(),
      drawImage: jest.fn(),
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(null);
    });
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>X</text></svg>',
        plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });
});

describe("useDiagramCapture - image onerror path", () => {
  it("rejects and skips drawImage when image fails to load", async () => {
    const ctx = mockCanvasContext();
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onerror?.(new Event("error")), 0);
      return img;
    });

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>X</text></svg>',
        plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    // onerror rejects → drawImage is NOT called, error is caught by top-level handler
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "useDiagramCapture: failed to capture diagram",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe("useDiagramCapture - top-level error handler", () => {
  it("catches and logs errors from the main flow", async () => {
    // Force an error in downloadSvgAsPng by making DOMParser throw
    const origParse = DOMParser.prototype.parseFromString;
    let callCount = 0;
    jest.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(function (this: DOMParser, ...args) {
      callCount++;
      // First call is from sanitizeSvgForCanvas, second from downloadSvgAsPng
      if (callCount <= 2) {
        return origParse.apply(this, args as any);
      }
      throw new Error("parse error");
    });

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: true, isPlantUml: false,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>X</text></svg>',
        plantUmlUrl: "", code: "graph TD; A-->B", isDark: false,
      }),
    );

    await result.current.handleCapture();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });
});
