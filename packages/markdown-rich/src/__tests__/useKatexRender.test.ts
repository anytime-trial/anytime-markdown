/**
 * useKatexRender のユニットテスト
 *
 * KaTeX の動的インポートをモックし、数式レンダリングを検証する。
 */

import { renderHook, act } from "@testing-library/react";

const mockRenderToString = jest.fn();

jest.mock("katex", () => ({
  __esModule: true,
  default: { renderToString: mockRenderToString },
}));

jest.mock("katex/dist/katex.min.css", () => ({}));

import { useKatexRender, MATH_SANITIZE_CONFIG } from "../hooks/useKatexRender";

beforeEach(() => {
  mockRenderToString.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useKatexRender", () => {
  it("isMath=true のとき KaTeX でレンダリングする", async () => {
    mockRenderToString.mockReturnValue("<span>E=mc^2</span>");

    const { result } = renderHook(() =>
      useKatexRender({ code: "E=mc^2", isMath: true }),
    );

    // 初期状態
    expect(result.current.html).toBe("");

    // 500ms タイマーを進める
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.html).toBe("<span>E=mc^2</span>");
    expect(result.current.error).toBe("");
    expect(mockRenderToString).toHaveBeenCalledWith("E=mc^2", {
      displayMode: true,
      throwOnError: false,
    });
  });

  it("isMath=false のときはレンダリングしない", () => {
    const { result } = renderHook(() =>
      useKatexRender({ code: "E=mc^2", isMath: false }),
    );

    jest.advanceTimersByTime(500);

    expect(result.current.html).toBe("");
    expect(mockRenderToString).not.toHaveBeenCalled();
  });

  it("空の code のときはレンダリングしない", async () => {
    const { result } = renderHook(() =>
      useKatexRender({ code: "  ", isMath: true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.html).toBe("");
    expect(mockRenderToString).not.toHaveBeenCalled();
  });

  it("KaTeX がエラーを投げた場合は error を返す", async () => {
    mockRenderToString.mockImplementation(() => {
      throw new Error("Parse error");
    });

    const { result } = renderHook(() =>
      useKatexRender({ code: "\\invalid", isMath: true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.error).toBe("KaTeX: Parse error");
    expect(result.current.html).toBe("");
  });
});

describe("MATH_SANITIZE_CONFIG", () => {
  it("必要なタグが許可されている", () => {
    expect(MATH_SANITIZE_CONFIG.ALLOWED_TAGS).toContain("span");
    expect(MATH_SANITIZE_CONFIG.ALLOWED_TAGS).toContain("math");
    expect(MATH_SANITIZE_CONFIG.ALLOWED_TAGS).toContain("svg");
  });

  it("data 属性は許可されていない", () => {
    expect(MATH_SANITIZE_CONFIG.ALLOW_DATA_ATTR).toBe(false);
  });
});
