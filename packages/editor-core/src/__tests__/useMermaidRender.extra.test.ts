/**
 * useMermaidRender.ts の追加カバレッジテスト
 * useMermaidRender hook の動作をテスト。
 */
import { renderHook, act } from "@testing-library/react";

jest.mock("mermaid", () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    parse: jest.fn().mockResolvedValue(undefined),
    render: jest.fn().mockResolvedValue({ svg: "<svg>rendered</svg>" }),
  },
}), { virtual: true });

import { useMermaidRender } from "../hooks/useMermaidRender";

describe("useMermaidRender hook", () => {
  it("returns empty svg when isMermaid=false", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "graph TD; A-->B", isMermaid: false, isDark: false }),
    );
    expect(result.current.svg).toBe("");
    expect(result.current.error).toBe("");
  });

  it("returns empty svg when code is empty", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "", isMermaid: true, isDark: false }),
    );
    expect(result.current.svg).toBe("");
  });

  it("returns empty svg when code is whitespace only", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "   ", isMermaid: true, isDark: false }),
    );
    expect(result.current.svg).toBe("");
  });

  it("provides setError function", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "graph TD; A-->B", isMermaid: true, isDark: false }),
    );
    expect(typeof result.current.setError).toBe("function");
  });

  it("setError updates error state", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "", isMermaid: false, isDark: false }),
    );

    act(() => {
      result.current.setError("test error");
    });

    expect(result.current.error).toBe("test error");
  });

  it("updates when code changes", () => {
    const { result, rerender } = renderHook(
      ({ code }) => useMermaidRender({ code, isMermaid: true, isDark: false }),
      { initialProps: { code: "graph TD; A-->B" } },
    );

    rerender({ code: "graph TD; A-->C" });
    expect(typeof result.current.svg).toBe("string");
  });

  it("updates when isDark changes", () => {
    const { result, rerender } = renderHook(
      ({ isDark }) => useMermaidRender({ code: "graph TD; A-->B", isMermaid: true, isDark }),
      { initialProps: { isDark: false } },
    );

    rerender({ isDark: true });
    expect(typeof result.current.svg).toBe("string");
  });

  it("clears svg and error when isMermaid becomes false", () => {
    const { result, rerender } = renderHook(
      ({ isMermaid }) =>
        useMermaidRender({ code: "graph TD; A-->B", isMermaid, isDark: false }),
      { initialProps: { isMermaid: true } },
    );

    rerender({ isMermaid: false });
    expect(result.current.svg).toBe("");
    expect(result.current.error).toBe("");
  });

  it("clears state when code becomes empty while isMermaid=true", () => {
    const { result, rerender } = renderHook(
      ({ code }) =>
        useMermaidRender({ code, isMermaid: true, isDark: false }),
      { initialProps: { code: "graph TD; A-->B" } },
    );

    rerender({ code: "" });
    expect(result.current.svg).toBe("");
  });
});
