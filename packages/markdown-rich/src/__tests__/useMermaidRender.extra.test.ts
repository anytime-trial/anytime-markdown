/**
 * useMermaidRender.ts の追加カバレッジテスト
 *
 * 既存テストでカバーされていない行を対象:
 * - getMermaid lazy loading (lines 9-13)
 * - enqueueRender (lines 21-23)
 * - cacheKey (line 56)
 * - requestMermaidRender: cache hit, pending join, new render, parse error, render error, cancel (lines 67-135)
 * - useMermaidRender hook: cache restore, effect branches (lines 148-185)
 */
import { renderHook, act, waitFor } from "@testing-library/react";

// mermaid モジュールのモック
const mockMermaid = {
  initialize: jest.fn(),
  parse: jest.fn().mockResolvedValue(undefined),
  render: jest.fn().mockResolvedValue({ svg: "<svg>rendered</svg>" }),
};

jest.mock("mermaid", () => ({
  __esModule: true,
  default: mockMermaid,
}), { virtual: true });

// テスト間で内部状態（svgCache, mermaidInstance）をリセットするために
// モジュールを再インポートできるよう isolateModules を使う場面もあるが、
// ここでは直接テストする
import { useMermaidRender, detectMermaidType } from "../hooks/useMermaidRender";

describe("detectMermaidType - extra cases", () => {
  it("flowchart with brace syntax", () => {
    expect(detectMermaidType("graph{TD}\n  A-->B")).toBe("diagramFlowchart");
  });

  it("code with leading newlines", () => {
    expect(detectMermaidType("\n\n  pie\n  title Test")).toBe("diagramPie");
  });
});

describe("useMermaidRender hook - extended coverage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockMermaid.parse.mockResolvedValue(undefined);
    mockMermaid.render.mockResolvedValue({ svg: "<svg>rendered</svg>" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("isMermaid=false の場合 svg と error が空", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "graph TD; A-->B", isMermaid: false, isDark: false }),
    );
    expect(result.current.svg).toBe("");
    expect(result.current.error).toBe("");
  });

  it("空コードの場合 svg が空", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "", isMermaid: true, isDark: false }),
    );
    expect(result.current.svg).toBe("");
  });

  it("空白のみのコードの場合 svg が空", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "   ", isMermaid: true, isDark: false }),
    );
    expect(result.current.svg).toBe("");
  });

  it("isMermaid=true + 有効コードで requestMermaidRender が呼ばれ、レンダリング結果を返す", async () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "graph TD; A-->B", isMermaid: true, isDark: false }),
    );

    // タイマーを進めて setTimeout(500ms) を発火
    await act(async () => {
      jest.advanceTimersByTime(600);
      // mermaid のプロミスを解決させる
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.svg).toBe("<svg>rendered</svg>");
    });
    expect(result.current.error).toBe("");
  });

  it("mermaid.parse がエラーを投げた場合 error が設定される", async () => {
    mockMermaid.parse.mockRejectedValue(new Error("bad syntax"));

    const { result } = renderHook(() =>
      useMermaidRender({ code: "invalid code here", isMermaid: true, isDark: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.error).toContain("Mermaid:");
      expect(result.current.error).toContain("bad syntax");
    });
    expect(result.current.svg).toBe("");
  });

  it("mermaid.parse が非 Error オブジェクトを投げた場合 syntax error メッセージ", async () => {
    mockMermaid.parse.mockRejectedValue("string error");

    const { result } = renderHook(() =>
      useMermaidRender({ code: "invalid2", isMermaid: true, isDark: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Mermaid: syntax error");
    });
  });

  it("mermaid.render が失敗した場合 render error になる", async () => {
    mockMermaid.render.mockRejectedValue(new Error("render failed"));

    const { result } = renderHook(() =>
      useMermaidRender({ code: "graph TD; renderFail", isMermaid: true, isDark: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.error).toContain("Mermaid:");
    });
  });

  it("isDark=true の場合 dark テーマで初期化される", async () => {
    const { result: _result } = renderHook(() =>
      useMermaidRender({ code: "graph TD; DarkTest", isMermaid: true, isDark: true }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockMermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });
  });

  it("キャッシュヒット時は即座に svg を返す（タイマー不要）", async () => {
    // 最初のレンダリングでキャッシュを作成
    const { result: firstResult, unmount } = renderHook(() =>
      useMermaidRender({ code: "graph TD; Cached", isMermaid: true, isDark: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(firstResult.current.svg).toBe("<svg>rendered</svg>");
    });

    unmount();

    // 2回目のレンダリング - キャッシュからの復元
    const { result: secondResult } = renderHook(() =>
      useMermaidRender({ code: "graph TD; Cached", isMermaid: true, isDark: false }),
    );

    // キャッシュがあるので即座に svg が返る
    expect(secondResult.current.svg).toBe("<svg>rendered</svg>");
    expect(secondResult.current.error).toBe("");
  });

  it("isMermaid が true から false に変わっても svg はクリアされない（非 Mermaid 時は状態を保持）", () => {
    const { result, rerender } = renderHook(
      ({ isMermaid }) =>
        useMermaidRender({ code: "graph TD; A-->B", isMermaid, isDark: false }),
      { initialProps: { isMermaid: true } },
    );

    rerender({ isMermaid: false });
    // isMermaid=false の場合、effect は setSvg/setError を呼ばない
    expect(result.current.error).toBe("");
  });

  it("コードが空に変わると svg がクリアされる (isMermaid=true)", () => {
    const { result, rerender } = renderHook(
      ({ code }: { code: string }) =>
        useMermaidRender({ code, isMermaid: true, isDark: false }),
      { initialProps: { code: "graph TD; X-->Y" } },
    );

    rerender({ code: "" });
    expect(result.current.svg).toBe("");
  });

  it("アンマウント時にクリーンアップが実行される（cancel 関数）", async () => {
    const { unmount } = renderHook(() =>
      useMermaidRender({ code: "graph TD; UnmountTest", isMermaid: true, isDark: false }),
    );

    // タイマー発火前にアンマウント
    unmount();

    // タイマーを進めてもエラーにならない
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("setError で error を更新できる", () => {
    const { result } = renderHook(() =>
      useMermaidRender({ code: "", isMermaid: false, isDark: false }),
    );

    act(() => {
      result.current.setError("custom error");
    });

    expect(result.current.error).toBe("custom error");
  });

  it("同じコードで複数の hook がマウントされた場合、pending に join する", async () => {
    const code = "graph TD; SharedRender" + Date.now();
    const { result: r1 } = renderHook(() =>
      useMermaidRender({ code, isMermaid: true, isDark: false }),
    );
    const { result: r2 } = renderHook(() =>
      useMermaidRender({ code, isMermaid: true, isDark: false }),
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(r1.current.svg).toBe("<svg>rendered</svg>");
      expect(r2.current.svg).toBe("<svg>rendered</svg>");
    });
  });
});
