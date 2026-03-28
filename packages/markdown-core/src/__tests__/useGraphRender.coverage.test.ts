/**
 * useGraphRender.ts のカバレッジテスト
 */
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock latexToExpr module
const mockParseLatex = jest.fn();
jest.mock("../utils/latexToExpr", () => ({
  parseLatexToGraph: (...args: unknown[]) => mockParseLatex(...args),
}));

// Mock jsxgraph
jest.mock("jsxgraph", () => ({
  JSXGraph: { initBoard: jest.fn(), freeBoard: jest.fn() },
}), { virtual: true });

// Mock plotly
jest.mock("plotly.js-gl3d-dist-min", () => ({
  react: jest.fn(),
  purge: jest.fn(),
}), { virtual: true });

import { useGraphRender } from "../hooks/useGraphRender";

describe("useGraphRender", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns initial state when disabled", () => {
    const { result } = renderHook(() =>
      useGraphRender({ code: "y=x", enabled: false, isDark: false })
    );
    expect(result.current.graphExpr).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("");
  });

  it("returns initial state when code is empty", () => {
    const { result } = renderHook(() =>
      useGraphRender({ code: "  ", enabled: true, isDark: false })
    );
    expect(result.current.graphExpr).toBeNull();
  });

  it("parses code and loads 2D library", async () => {
    mockParseLatex.mockReturnValue({
      type: "explicit2d",
      evaluate: (v: Record<string, number>) => v.x,
      parameters: [],
      variables: ["x"],
      latex: "test",
    });

    const { result } = renderHook(() =>
      useGraphRender({ code: "y=x", enabled: true, isDark: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.graphExpr).toBeTruthy();
    expect(result.current.graphExpr?.type).toBe("explicit2d");
    expect(result.current.jsxGraph).toBeTruthy();
  });

  it("parses code and loads 3D library for surface3d", async () => {
    mockParseLatex.mockReturnValue({
      type: "surface3d",
      evaluate: (v: Record<string, number>) => v.x + v.y,
      parameters: [],
      variables: ["x", "y"],
      latex: "test",
    });

    const { result } = renderHook(() =>
      useGraphRender({ code: "z=x+y", enabled: true, isDark: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.graphExpr?.type).toBe("surface3d");
    expect(result.current.plotly).toBeTruthy();
  });

  it("handles unknown expression type", async () => {
    mockParseLatex.mockReturnValue({
      type: "unknown",
      error: "Cannot parse",
      evaluate: () => 0,
      parameters: [],
      variables: ["x", "y"],
      latex: "test",
    });

    const { result } = renderHook(() =>
      useGraphRender({ code: "invalid", enabled: true, isDark: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.graphExpr).toBeNull();
    expect(result.current.error).toBe("Cannot parse");
  });

  it("handles unknown expression without error message", async () => {
    mockParseLatex.mockReturnValue({
      type: "unknown",
      evaluate: () => 0,
      parameters: [],
      variables: ["x"],
      latex: "test",
    });

    const { result } = renderHook(() =>
      useGraphRender({ code: "bad", enabled: true, isDark: false })
    );

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it("uses cache for repeated code", async () => {
    mockParseLatex.mockReturnValue({
      type: "explicit2d",
      evaluate: (v: Record<string, number>) => v.x,
      parameters: [],
      variables: ["x"],
      latex: "test",
    });

    const { result, rerender } = renderHook(
      ({ code }) => useGraphRender({ code, enabled: true, isDark: false }),
      { initialProps: { code: "y=x" } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Same code again - should use cache
    rerender({ code: "y=x" });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("handles parametric3d type", async () => {
    mockParseLatex.mockReturnValue({
      type: "parametric3d",
      evaluate: () => ({ x: 0, y: 0, z: 0 }),
      parameters: [],
      variables: ["u", "v"],
      latex: "test",
    });

    const { result } = renderHook(() =>
      useGraphRender({ code: "param3d", enabled: true, isDark: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.plotly).toBeTruthy();
  });

  it("clears state when disabled after being enabled", async () => {
    mockParseLatex.mockReturnValue({
      type: "explicit2d",
      evaluate: (v: Record<string, number>) => v.x,
      parameters: [],
      variables: ["x"],
      latex: "test",
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useGraphRender({ code: "y=x", enabled, isDark: false }),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => expect(result.current.graphExpr).toBeTruthy());

    rerender({ enabled: false });

    expect(result.current.graphExpr).toBeNull();
    expect(result.current.error).toBe("");
  });
});
