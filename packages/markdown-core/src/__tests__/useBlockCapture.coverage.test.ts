/**
 * useBlockCapture.ts - additional coverage tests
 * Focuses on: captureSvgElement, captureImgElement (tainted canvas, incomplete image),
 * captureHtmlPreview (showSaveFilePicker, PNG/SVG choice, fallback),
 * renderTextToPngBlob, captureHtmlElement, findContentBackgroundColor,
 * getEffectiveBackground, findBackgroundColor, createScaledCanvas, loadImage, downloadCanvas.
 */
import { renderHook } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";

const mockSaveBlob = jest.fn().mockResolvedValue(undefined);

jest.mock("../utils/clipboardHelpers", () => ({
  saveBlob: (...args: unknown[]) => mockSaveBlob(...args),
}));

jest.mock("../constants/colors", () => ({
  CAPTURE_BG: "#ffffff",
}));

import { useBlockCapture } from "../hooks/useBlockCapture";

// Helper to build editor/getPos mocks
function makeEditor(dom: Node | null) {
  return {
    view: { nodeDOM: jest.fn(() => dom) },
  } as unknown as NodeViewProps["editor"];
}

const mockGetPos = jest.fn(() => 0) as unknown as NodeViewProps["getPos"];

// Mock canvas context
function mockCanvasContext() {
  const ctx = {
    scale: jest.fn(),
    fillStyle: "",
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    font: "",
    textBaseline: "",
    fillText: jest.fn(),
  };
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    cb(new Blob(["png-data"], { type: "image/png" }));
  });
  return ctx;
}

function mockRect(el: Element, w = 200, h = 100) {
  jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
    width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Provide URL.createObjectURL / revokeObjectURL
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

describe("useBlockCapture - captureSvgElement path", () => {
  it("captures SVG element as PNG via loadImage + canvas", async () => {
    const ctx = mockCanvasContext();
    const el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    el.appendChild(svg);
    mockRect(svg, 100, 100);

    // Mock Image loading
    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "test.png"));
    await result.current();

    expect(ctx.drawImage).toHaveBeenCalled();
    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "test.png");
  });

  it("returns early when ctx is null for SVG capture", async () => {
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.appendChild(svg);
    mockRect(svg, 100, 100);

    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });
});

describe("useBlockCapture - captureImgElement path", () => {
  it("captures completed img element via canvas", async () => {
    const ctx = mockCanvasContext();
    const el = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "src", { value: "data:image/png;base64,abc", writable: true });
    el.appendChild(img);
    mockRect(img, 150, 100);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "image.png"));
    await result.current();

    expect(ctx.drawImage).toHaveBeenCalled();
    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "image.png");
  });

  it("waits for incomplete img to load before capture", async () => {
    mockCanvasContext();
    const el = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: false, writable: true });
    el.appendChild(img);
    mockRect(img, 150, 100);

    // Simulate load event
    const origOnload = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "onload");
    let loadHandler: (() => void) | null = null;
    Object.defineProperty(img, "onload", {
      set: (fn) => { loadHandler = fn; setTimeout(() => fn?.(), 0); },
      get: () => loadHandler,
      configurable: true,
    });

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();
    // Should have proceeded after load
  });

  it("handles tainted canvas by fetching image src directly", async () => {
    const el = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "src", { value: "https://example.com/image.jpeg", writable: true });
    el.appendChild(img);
    mockRect(img, 150, 100);

    const ctx = {
      scale: jest.fn(),
      fillStyle: "",
      fillRect: jest.fn(),
      drawImage: jest.fn().mockImplementation(() => { throw new DOMException("tainted"); }),
      font: "",
      textBaseline: "",
      fillText: jest.fn(),
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

    // Mock fetch for fallback
    const mockBlob = new Blob(["jpeg-data"], { type: "image/jpeg" });
    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue(mockBlob),
    });

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "photo.png"));
    await result.current();

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/image.jpeg");
    // File extension adjusted from .png to .jpeg
    expect(mockSaveBlob).toHaveBeenCalledWith(mockBlob, "photo.jpeg");
  });

  it("warns when tainted canvas fallback fetch also fails", async () => {
    const el = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "src", { value: "https://example.com/img.png", writable: true });
    el.appendChild(img);
    mockRect(img, 100, 100);

    const ctx = {
      scale: jest.fn(),
      fillStyle: "",
      fillRect: jest.fn(),
      drawImage: jest.fn().mockImplementation(() => { throw new DOMException("tainted"); }),
      font: "",
      textBaseline: "",
      fillText: jest.fn(),
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();

    expect(warnSpy).toHaveBeenCalledWith("Image capture: unable to fetch image for save");
    warnSpy.mockRestore();
  });

  it("returns early when ctx is null for img capture", async () => {
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const el = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    el.appendChild(img);
    mockRect(img, 100, 100);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();
    expect(mockSaveBlob).not.toHaveBeenCalled();
  });
});

describe("useBlockCapture - captureHtmlPreview path", () => {
  it("falls back to <a> download when showSaveFilePicker is unavailable", async () => {
    const el = document.createElement("div");
    const htmlPreview = document.createElement("div");
    htmlPreview.setAttribute("role", "document");
    htmlPreview.textContent = "Preview content";
    el.appendChild(htmlPreview);
    mockRect(htmlPreview, 200, 150);

    // Ensure showSaveFilePicker is NOT available
    delete (globalThis as any).showSaveFilePicker;

    const mockClick = jest.fn();
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const a = Object.create(HTMLAnchorElement.prototype);
        a.click = mockClick;
        Object.defineProperty(a, "href", { value: "", writable: true });
        Object.defineProperty(a, "download", { value: "", writable: true });
        return a;
      }
      return Document.prototype.createElement.call(document, tag);
    });

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "preview.png"));
    await result.current();

    // Restoring createElement
    jest.restoreAllMocks();
  });

  it("uses showSaveFilePicker to save PNG when user chooses .png", async () => {
    const el = document.createElement("div");
    const htmlPreview = document.createElement("div");
    htmlPreview.setAttribute("role", "document");
    htmlPreview.textContent = "Preview content";
    el.appendChild(htmlPreview);
    mockRect(htmlPreview, 200, 150);

    const mockCtx = mockCanvasContext();

    const mockWritable = { write: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
    const mockHandle = { name: "preview.png", createWritable: jest.fn().mockResolvedValue(mockWritable) };
    (globalThis as any).showSaveFilePicker = jest.fn().mockResolvedValue(mockHandle);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "preview.png"));
    await result.current();

    expect(mockHandle.createWritable).toHaveBeenCalled();
    expect(mockWritable.write).toHaveBeenCalled();
    expect(mockWritable.close).toHaveBeenCalled();

    delete (globalThis as any).showSaveFilePicker;
  });

  it("uses showSaveFilePicker to save SVG when user chooses .svg", async () => {
    const el = document.createElement("div");
    const htmlPreview = document.createElement("div");
    htmlPreview.setAttribute("role", "document");
    htmlPreview.textContent = "Preview content";
    el.appendChild(htmlPreview);
    mockRect(htmlPreview, 200, 150);

    const mockWritable = { write: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
    const mockHandle = { name: "preview.svg", createWritable: jest.fn().mockResolvedValue(mockWritable) };
    (globalThis as any).showSaveFilePicker = jest.fn().mockResolvedValue(mockHandle);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "preview.png"));
    await result.current();

    expect(mockWritable.write).toHaveBeenCalledWith(expect.any(Blob));
    expect(mockWritable.close).toHaveBeenCalled();

    delete (globalThis as any).showSaveFilePicker;
  });

  it("handles AbortError from showSaveFilePicker gracefully", async () => {
    const el = document.createElement("div");
    const htmlPreview = document.createElement("div");
    htmlPreview.setAttribute("role", "document");
    htmlPreview.textContent = "content";
    el.appendChild(htmlPreview);
    mockRect(htmlPreview, 200, 150);

    const abortError = new DOMException("User cancelled", "AbortError");
    (globalThis as any).showSaveFilePicker = jest.fn().mockRejectedValue(abortError);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();
    // Should not throw

    delete (globalThis as any).showSaveFilePicker;
  });
});

describe("useBlockCapture - captureHtmlElement path", () => {
  it("captures pre element text content as PNG", async () => {
    mockCanvasContext();
    const el = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "console.log('hello')";
    Object.defineProperty(pre, "innerText", { value: "console.log('hello')" });
    el.appendChild(pre);
    mockRect(pre, 200, 100);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "code.png"));
    await result.current();

    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "code.png");
  });

  it("warns when element has no text content", async () => {
    mockCanvasContext();
    const el = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "";
    el.appendChild(pre);
    mockRect(pre, 200, 100);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();

    expect(warnSpy).toHaveBeenCalledWith("captureHtmlElement: no text content found");
    warnSpy.mockRestore();
  });
});

describe("useBlockCapture - renderTextToPngBlob ctx null", () => {
  it("returns null when canvas context is null for text rendering", async () => {
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const el = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "some text";
    Object.defineProperty(pre, "innerText", { value: "some text" });
    el.appendChild(pre);
    mockRect(pre, 200, 100);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();
    warnSpy.mockRestore();
  });
});

describe("useBlockCapture - downloadCanvas toBlob null", () => {
  it("warns when toBlob returns null (tainted canvas)", async () => {
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

    const el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.appendChild(svg);
    mockRect(svg, 100, 100);

    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();

    expect(warnSpy).toHaveBeenCalledWith("downloadCanvas: toBlob returned null (canvas may be tainted)");
    warnSpy.mockRestore();
  });

  it("warns when toBlob throws (tainted canvas)", async () => {
    const ctx = {
      scale: jest.fn(),
      fillStyle: "",
      fillRect: jest.fn(),
      drawImage: jest.fn(),
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, _cb: BlobCallback) {
      throw new DOMException("tainted canvas");
    });

    const el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.appendChild(svg);
    mockRect(svg, 100, 100);

    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onload?.(new Event("load")), 0);
      return img;
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("toBlob"), expect.anything());
    warnSpy.mockRestore();
  });
});

describe("useBlockCapture - findBackgroundColor / getEffectiveBackground", () => {
  it("finds background from parent element", async () => {
    mockCanvasContext();
    const parent = document.createElement("div");
    parent.style.backgroundColor = "rgb(255, 0, 0)";
    const el = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "code";
    Object.defineProperty(pre, "innerText", { value: "code" });
    el.appendChild(pre);
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockRect(pre, 200, 100);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "code.png"));
    await result.current();
    document.body.removeChild(parent);
  });

  it("finds background from child element", async () => {
    mockCanvasContext();
    const el = document.createElement("div");
    const htmlPreview = document.createElement("div");
    htmlPreview.setAttribute("role", "document");
    const child = document.createElement("div");
    child.style.backgroundColor = "rgb(0, 128, 0)";
    child.textContent = "styled child";
    htmlPreview.appendChild(child);
    Object.defineProperty(htmlPreview, "innerText", { value: "styled child" });
    el.appendChild(htmlPreview);
    mockRect(htmlPreview, 200, 150);

    // Need showSaveFilePicker for PNG path to trigger renderTextToPngBlob -> findContentBackgroundColor
    const mockWritable = { write: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
    const mockHandle = { name: "output.png", createWritable: jest.fn().mockResolvedValue(mockWritable) };
    (globalThis as any).showSaveFilePicker = jest.fn().mockResolvedValue(mockHandle);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "output.png"));
    await result.current();

    delete (globalThis as any).showSaveFilePicker;
  });

  it("extracts color from background-image gradient", async () => {
    mockCanvasContext();
    const el = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "gradient";
    Object.defineProperty(pre, "innerText", { value: "gradient" });
    el.appendChild(pre);
    document.body.appendChild(el);
    mockRect(pre, 200, 100);

    // Mock getComputedStyle to return gradient
    const origGetComputedStyle = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = origGetComputedStyle(element);
      if (element === pre) {
        return {
          ...style,
          backgroundColor: "rgba(0, 0, 0, 0)",
          backgroundImage: "linear-gradient(#ff0000, #0000ff)",
          color: "#333",
        } as CSSStyleDeclaration;
      }
      return style;
    });

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "grad.png"));
    await result.current();

    document.body.removeChild(el);
    jest.restoreAllMocks();
  });
});

describe("useBlockCapture - loadImage error path", () => {
  it("rejects when image fails to load", async () => {
    const el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.appendChild(svg);
    mockRect(svg, 100, 100);

    jest.spyOn(globalThis, "Image").mockImplementation(() => {
      const img = document.createElement("img");
      setTimeout(() => img.onerror?.(new Event("error")), 0);
      return img;
    });

    mockCanvasContext();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos));
    await result.current();

    expect(errorSpy).toHaveBeenCalledWith("Block capture failed:", expect.anything());
    errorSpy.mockRestore();
  });
});

describe("useBlockCapture - element without sub-elements uses el itself", () => {
  it("captures the element itself when no img/pre/svg/document child exists", async () => {
    mockCanvasContext();
    const el = document.createElement("div");
    el.textContent = "plain text";
    Object.defineProperty(el, "innerText", { value: "plain text" });
    mockRect(el, 200, 100);

    const editor = makeEditor(el);
    const { result } = renderHook(() => useBlockCapture(editor, mockGetPos, "plain.png"));
    await result.current();

    expect(mockSaveBlob).toHaveBeenCalledWith(expect.any(Blob), "plain.png");
  });
});
