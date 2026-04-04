/**
 * useDiagramCapture のユニットテスト
 *
 * ダイアグラムキャプチャ hook のコールバック生成を検証する。
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
  buildPlantUmlUrl: jest.fn().mockImplementation((encoded: string) => `https://www.plantuml.com/plantuml/svg/${encoded}`),
}));

jest.mock("../constants/colors", () => ({
  CAPTURE_BG: "#ffffff",
}));

jest.mock("../constants/timing", () => ({
  FETCH_TIMEOUT: 10000,
}));

import { useDiagramCapture } from "../hooks/useDiagramCapture";

describe("useDiagramCapture", () => {
  it("useCallback を返す（関数が生成される）", () => {
    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false,
        isPlantUml: false,
        svg: "",
        plantUmlUrl: "",
        code: "",
        isDark: false,
      }),
    );

    expect(typeof result.current.handleCapture).toBe("function");
  });

  it("isMermaid=false, isPlantUml=false のとき実行してもエラーにならない", async () => {
    const { result } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false,
        isPlantUml: false,
        svg: "",
        plantUmlUrl: "",
        code: "",
        isDark: false,
      }),
    );

    // エラーなく完了すること
    await result.current.handleCapture();
  });

  it("deps が変わると新しいコールバックが返る", () => {
    const { result, rerender } = renderHook(
      ({ code }) =>
        useDiagramCapture({
          isMermaid: true,
          isPlantUml: false,
          svg: "<svg></svg>",
          plantUmlUrl: "",
          code,
          isDark: false,
        }),
      { initialProps: { code: "graph TD; A-->B" } },
    );

    const first = result.current.handleCapture;

    rerender({ code: "graph TD; A-->C" });

    const second = result.current.handleCapture;

    // useCallback の deps が変わったので新しい参照
    expect(first).not.toBe(second);
  });

  it("同じ deps なら同じコールバック参照を返す", () => {
    const { result, rerender } = renderHook(() =>
      useDiagramCapture({
        isMermaid: false,
        isPlantUml: false,
        svg: "",
        plantUmlUrl: "",
        code: "test",
        isDark: false,
      }),
    );

    const first = result.current.handleCapture;

    rerender();

    expect(result.current.handleCapture).toBe(first);
  });
});
