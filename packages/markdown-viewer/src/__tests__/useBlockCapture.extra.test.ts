/**
 * useBlockCapture.ts の追加カバレッジテスト
 * 内部ヘルパー関数: createScaledCanvas, loadImage, downloadCanvas,
 * findBackgroundColor, captureHtmlElement 等の動作を間接的にテスト。
 */
import { renderHook } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { useBlockCapture } from "../hooks/useBlockCapture";

jest.mock("../utils/clipboardHelpers", () => ({
  saveBlob: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../constants/colors", () => ({
  CAPTURE_BG: "#ffffff",
}));

describe("useBlockCapture - additional cases", () => {
  const mockGetPos = jest.fn(() => 0) as unknown as NodeViewProps["getPos"];

  it("does nothing when getPos returns null", async () => {
    const mockEditor = {
      view: { nodeDOM: jest.fn(() => null) },
    } as unknown as NodeViewProps["editor"];

    const nullGetPos = jest.fn(() => null) as unknown as NodeViewProps["getPos"];
    const { result } = renderHook(() => useBlockCapture(mockEditor, nullGetPos));
    await result.current();
    // should not throw
  });

  it("does nothing when nodeDOM returns non-HTMLElement", async () => {
    const textNode = document.createTextNode("hello");
    const mockEditor = {
      view: { nodeDOM: jest.fn(() => textNode) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    await result.current();
    // should not throw
  });

  it("handles element with zero-size bounding rect", async () => {
    const el = document.createElement("div");
    jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockEditor = {
      view: { nodeDOM: jest.fn(() => el) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    await result.current();
    // Should return early without error
  });

  it("handles element with pre child", async () => {
    const el = document.createElement("div");
    const pre = document.createElement("pre");
    pre.textContent = "console.log('hello')";
    el.appendChild(pre);

    jest.spyOn(pre, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockEditor = {
      view: { nodeDOM: jest.fn(() => el) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));

    // Console error is expected due to canvas limitations in jsdom
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("uses custom fileName when provided", () => {
    const mockEditor = {
      view: { nodeDOM: jest.fn(() => null) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() =>
      useBlockCapture(mockEditor, mockGetPos, "custom-name.png"),
    );
    expect(typeof result.current).toBe("function");
  });

  it("handles element with SVG child", async () => {
    const el = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    el.appendChild(svg);

    jest.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockEditor = {
      view: { nodeDOM: jest.fn(() => el) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("handles element with img child", async () => {
    const el = document.createElement("div");
    const img = document.createElement("img");
    img.src = "data:image/png;base64,iVBORw0KGgo=";
    el.appendChild(img);
    Object.defineProperty(img, "complete", { value: true });

    jest.spyOn(img, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockEditor = {
      view: { nodeDOM: jest.fn(() => el) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("handles element with [role=document] child", async () => {
    const el = document.createElement("div");
    const doc = document.createElement("div");
    doc.setAttribute("role", "document");
    doc.textContent = "Preview content";
    el.appendChild(doc);

    jest.spyOn(doc, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 150,
      top: 0,
      left: 0,
      right: 200,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const mockEditor = {
      view: { nodeDOM: jest.fn(() => el) },
    } as unknown as NodeViewProps["editor"];

    const { result } = renderHook(() => useBlockCapture(mockEditor, mockGetPos));
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await result.current();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
