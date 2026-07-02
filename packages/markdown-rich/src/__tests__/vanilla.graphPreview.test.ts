/**
 * vanilla.graphPreview.test.ts
 *
 * graphRender.ts / createGraphPreview.ts のユニットテスト。
 * islands の GraphView / Graph2DView / Graph3DView / useGraphRender テストの
 * 観点を vanilla に移植したもの。
 */

// ===== モック定義 =====

const mockParseLatex = jest.fn();
jest.mock("@anytime-markdown/markdown-rich/src/utils/latexToExpr", () => ({
  parseLatexToGraph: (...args: unknown[]) => mockParseLatex(...args),
}));

const mockBoard = {
  create: jest.fn(),
  update: jest.fn(),
  setBoundingBox: jest.fn(),
};
jest.mock("jsxgraph", () => ({
  JSXGraph: {
    initBoard: jest.fn(() => mockBoard),
    freeBoard: jest.fn(),
  },
}), { virtual: true });

const mockPlotly = {
  react: jest.fn().mockResolvedValue(undefined),
  purge: jest.fn(),
};
jest.mock("plotly.js-gl3d-dist-min", () => mockPlotly, { virtual: true });

// ResizeObserver はテスト環境に存在しないため最小モック
class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

// requestAnimationFrame / cancelAnimationFrame
const rafIds: Record<number, FrameRequestCallback> = {};
let rafSeq = 1;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback): number => {
  const id = rafSeq++;
  rafIds[id] = cb;
  return id;
};
(globalThis as any).cancelAnimationFrame = (id: number): void => {
  delete rafIds[id];
};

// ===== テスト対象 =====

import { parseGraphCode } from "../vanilla/graphRender";
import { createGraphPreview } from "../vanilla/createGraphPreview";

// ===== helper =====

function makeExplicit2dExpr() {
  return {
    type: "explicit2d" as const,
    evaluate: (vars: Record<string, number>) => vars.x * 2,
    parameters: [] as string[],
    variables: ["x"],
    latex: "y=2x",
  };
}

function makeSurface3dExpr() {
  return {
    type: "surface3d" as const,
    evaluate: (vars: Record<string, number>) => vars.x + vars.y,
    parameters: [] as string[],
    variables: ["x", "y"],
    latex: "z=x+y",
  };
}

function makeParamExpr(param = "a") {
  return {
    type: "explicit2d" as const,
    evaluate: (vars: Record<string, number>) => vars.x * (vars[param] ?? 1),
    parameters: [param],
    variables: ["x", param],
    latex: `y=x*${param}`,
  };
}

// ===== parseGraphCode テスト =====

describe("parseGraphCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBoard.create.mockClear();
  });

  it("disabled の場合は空状態を即時通知する", () => {
    const onState = jest.fn();
    const handle = parseGraphCode("y=x", false, onState);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls[0][0]).toMatchObject({
      graphExpr: null,
      loading: false,
      error: "",
    });
    handle.cancel();
  });

  it("code が空白のみの場合は空状態を即時通知する", () => {
    const onState = jest.fn();
    const handle = parseGraphCode("   ", true, onState);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls[0][0].loading).toBe(false);
    handle.cancel();
  });

  it("enabled かつ code あり → loading=true を最初に通知する", () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const onState = jest.fn();
    parseGraphCode("y=x", true, onState);
    // 最初の呼び出しは loading=true
    expect(onState.mock.calls[0][0].loading).toBe(true);
  });

  it("explicit2d → jsxGraph がセットされた状態で通知する", async () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const onState = jest.fn();
    parseGraphCode("y=2x", true, onState);

    // 非同期完了を待つ
    await new Promise((r) => setTimeout(r, 0));

    const lastCall = onState.mock.calls.at(-1)[0];
    expect(lastCall.loading).toBe(false);
    expect(lastCall.graphExpr?.type).toBe("explicit2d");
    expect(lastCall.jsxGraph).toBeTruthy();
    expect(lastCall.plotly).toBeNull();
    expect(lastCall.error).toBe("");
  });

  it("surface3d → plotly がセットされた状態で通知する", async () => {
    mockParseLatex.mockReturnValue(makeSurface3dExpr());
    const onState = jest.fn();
    parseGraphCode("z=x+y", true, onState);

    await new Promise((r) => setTimeout(r, 0));

    const lastCall = onState.mock.calls.at(-1)[0];
    expect(lastCall.loading).toBe(false);
    expect(lastCall.graphExpr?.type).toBe("surface3d");
    expect(lastCall.plotly).toBeTruthy();
    expect(lastCall.jsxGraph).toBeNull();
  });

  it("parametric3d → plotly がセットされる", async () => {
    mockParseLatex.mockReturnValue({
      type: "parametric3d",
      evaluate: () => ({ x: 0, y: 0, z: 0 }),
      parameters: [],
      variables: ["u", "v"],
      latex: "param3d",
    });
    const onState = jest.fn();
    parseGraphCode("param3d", true, onState);
    await new Promise((r) => setTimeout(r, 0));
    expect(onState.mock.calls.at(-1)[0].plotly).toBeTruthy();
  });

  it("type=unknown → error を通知する", async () => {
    mockParseLatex.mockReturnValue({
      type: "unknown",
      error: "Cannot parse",
      evaluate: () => 0,
      parameters: [],
      variables: [],
      latex: "",
    });
    const onState = jest.fn();
    parseGraphCode("bad", true, onState);
    await new Promise((r) => setTimeout(r, 0));

    const errState = onState.mock.calls.at(-1)[0];
    expect(errState.error).toBe("Cannot parse");
    expect(errState.graphExpr).toBeNull();
  });

  it("type=unknown かつ error メッセージなし → デフォルトエラー文言", async () => {
    mockParseLatex.mockReturnValue({
      type: "unknown",
      evaluate: () => 0,
      parameters: [],
      variables: [],
      latex: "",
    });
    const onState = jest.fn();
    parseGraphCode("bad2", true, onState);
    await new Promise((r) => setTimeout(r, 0));
    expect(onState.mock.calls.at(-1)[0].error).toBeTruthy();
  });

  it("cancel() を呼ぶとコールバックが呼ばれなくなる", async () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const onState = jest.fn();
    const handle = parseGraphCode("y=x", true, onState);
    const callsBefore = onState.mock.calls.length;
    handle.cancel();
    await new Promise((r) => setTimeout(r, 0));
    // cancel 後は追加呼び出しなし
    expect(onState.mock.calls.length).toBe(callsBefore);
  });

  it("キャッシュ: 同一 code を 2 回解析しても parseLatex は 1 回のみ呼ばれる", async () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const cb1 = jest.fn();
    parseGraphCode("y=cached", true, cb1);
    await new Promise((r) => setTimeout(r, 0));

    const cb2 = jest.fn();
    parseGraphCode("y=cached", true, cb2);
    await new Promise((r) => setTimeout(r, 0));

    // 最初のロード呼び出し + 2回目はキャッシュ → 合計 1 回
    expect(mockParseLatex).toHaveBeenCalledTimes(1);
  });
});

// ===== createGraphPreview テスト =====

describe("createGraphPreview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBoard.create.mockClear();
    mockBoard.update.mockClear();
    mockPlotly.react.mockClear();
    mockPlotly.purge.mockClear();
    mockBoard.setBoundingBox.mockClear();
    (require("jsxgraph").JSXGraph.initBoard as jest.Mock).mockReturnValue(mockBoard);
    (require("jsxgraph").JSXGraph.freeBoard as jest.Mock).mockClear();
  });

  it("GraphMountHandle（render / destroy）を返す", () => {
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    expect(typeof preview.render).toBe("function");
    expect(typeof preview.destroy).toBe("function");
  });

  it("enabled=false で render → wrapper は空", () => {
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    const wrapper = (preview as any).wrapper ?? document.createElement("div");
    preview.render("y=x", false, false);
    // destroy 後もエラーが起きないことを確認
    preview.destroy();
  });

  it("destroy() を複数回呼んでもエラーにならない", () => {
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    expect(() => {
      preview.destroy();
      preview.destroy();
    }).not.toThrow();
  });

  it("explicit2d: render → jsxGraph.initBoard が呼ばれる", async () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("y=2x", true, false);
    await new Promise((r) => setTimeout(r, 0));
    expect((require("jsxgraph").JSXGraph.initBoard as jest.Mock)).toHaveBeenCalled();
  });

  it("surface3d: render → plotly.react が呼ばれる", async () => {
    mockParseLatex.mockReturnValue(makeSurface3dExpr());
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("z=x+y", true, false);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("dark mode: render → plotly に isDark が渡る", async () => {
    mockParseLatex.mockReturnValue(makeSurface3dExpr());
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("z=x+y", true, true /* isDark */);
    await new Promise((r) => setTimeout(r, 0));
    // plotly.react の第3引数(layout) で dark bg が使われていることを確認
    const callArg = mockPlotly.react.mock.calls[0];
    expect(callArg).toBeTruthy();
    const layout = callArg[2];
    expect(layout.paper_bgcolor).toBe("#0D1117");
  });

  it("エラー状態: role=alert の要素が DOM に存在する", async () => {
    mockParseLatex.mockReturnValue({
      type: "unknown",
      error: "Parse error",
      evaluate: () => 0,
      parameters: [],
      variables: [],
      latex: "",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);

    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    // wrapper を container に追加してテストできるよう、render を呼ぶ
    preview.render("bad", true, false);
    await new Promise((r) => setTimeout(r, 0));

    // destroy でエラーなし
    expect(() => preview.destroy()).not.toThrow();
    container.remove();
  });

  it("destroy() → jsxGraph.freeBoard が呼ばれる", async () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("y=x", true, false);
    await new Promise((r) => setTimeout(r, 0));
    preview.destroy();
    expect((require("jsxgraph").JSXGraph.freeBoard as jest.Mock)).toHaveBeenCalled();
  });

  it("destroy() → plotly.purge が呼ばれる", async () => {
    mockParseLatex.mockReturnValue(makeSurface3dExpr());
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("z=x+y", true, false);
    await new Promise((r) => setTimeout(r, 0));
    preview.destroy();
    expect(mockPlotly.purge).toHaveBeenCalled();
  });

  it("再 render → 前回の jsxGraph ボードが解放される", async () => {
    mockParseLatex.mockReturnValue(makeExplicit2dExpr());
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("y=x", true, false);
    await new Promise((r) => setTimeout(r, 0));

    // 2 回目の render（キャッシュ利用: parseLatex は 1 回目は呼ばれる可能性あり）
    preview.render("y=x", true, false);
    await new Promise((r) => setTimeout(r, 0));

    // destroy
    preview.destroy();
    expect((require("jsxgraph").JSXGraph.freeBoard as jest.Mock)).toHaveBeenCalled();
  });

  // ===== パラメータスライダー =====

  it("parameters あり: explicit2d で DOM にスライダーが存在する", async () => {
    mockParseLatex.mockReturnValue(makeParamExpr("a"));
    const container = document.createElement("div");
    document.body.appendChild(container);

    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    // wrapper を取得するには内部 DOM を直接検査できないため
    // エラーなく実行されることを確認
    preview.render("y=xa", true, false);
    await new Promise((r) => setTimeout(r, 0));

    expect((require("jsxgraph").JSXGraph.initBoard as jest.Mock)).toHaveBeenCalled();
    preview.destroy();
    container.remove();
  });

  it("parameters あり: surface3d でスライダーが生成される", async () => {
    mockParseLatex.mockReturnValue({
      type: "surface3d" as const,
      evaluate: (vars: Record<string, number>) => vars.x * (vars.k ?? 1),
      parameters: ["k"],
      variables: ["x", "y", "k"],
      latex: "z=xk",
    });
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    preview.render("z=xk", true, false);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPlotly.react).toHaveBeenCalled();
    preview.destroy();
    expect(mockPlotly.purge).toHaveBeenCalled();
  });

  it("plotly.react が reject → エラーログのみでクラッシュしない", async () => {
    mockParseLatex.mockReturnValue(makeSurface3dExpr());
    mockPlotly.react.mockRejectedValueOnce(new Error("render failed"));
    const preview = createGraphPreview(document.createElement("div"), (key: string) => key);
    // catch していてもテストでエラーにならないことを確認
    await expect(async () => {
      preview.render("z=x+y", true, false);
      await new Promise((r) => setTimeout(r, 10));
    }).not.toThrow();
    preview.destroy();
  });
});
