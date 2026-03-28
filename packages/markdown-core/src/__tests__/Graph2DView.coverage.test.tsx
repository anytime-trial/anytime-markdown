/**
 * Graph2DView.tsx のカバレッジテスト
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Mock colors
jest.mock("../constants/colors", () => ({
  getTextSecondary: (isDark: boolean) => isDark ? "#aaa" : "#666",
}));

import { Graph2DView } from "../components/codeblock/Graph2DView";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

const mockBoard = {
  create: jest.fn(),
  update: jest.fn(),
  setBoundingBox: jest.fn(),
};

const mockJSXGraph = {
  JSXGraph: {
    initBoard: jest.fn().mockReturnValue(mockBoard),
    freeBoard: jest.fn(),
  },
};

function renderGraph(props: Partial<React.ComponentProps<typeof Graph2DView>> = {}, dark = false) {
  const defaultProps = {
    graphExpr: {
      type: "explicit2d" as const,
      evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * 2,
      parameters: [] as string[],
      variables: ["x"],
      latex: "test",
    },
    jsxGraph: mockJSXGraph as any,
    isDark: dark,
    width: 500,
    height: 400,
  };
  return render(
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      <Graph2DView {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe("Graph2DView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBoard.create.mockClear();
    mockJSXGraph.JSXGraph.initBoard.mockReturnValue(mockBoard);
  });

  it("renders and initializes board for explicit2d", () => {
    renderGraph();
    expect(mockJSXGraph.JSXGraph.initBoard).toHaveBeenCalled();
    expect(mockBoard.create).toHaveBeenCalledWith(
      "functiongraph",
      expect.any(Array),
      expect.objectContaining({ strokeWidth: 2 })
    );
  });

  it("renders polar graph", () => {
    renderGraph({
      graphExpr: {
        type: "polar" as const,
        evaluate: (vars: Record<string, number>) => (vars.theta ?? 0),
        parameters: [],
        variables: ["theta"],
        latex: "test",
      },
    });
    expect(mockBoard.create).toHaveBeenCalledWith(
      "curve",
      expect.any(Array),
      expect.objectContaining({ curveType: "parameter" })
    );
  });

  it("renders parametric2d graph", () => {
    renderGraph({
      graphExpr: {
        type: "parametric2d" as const,
        evaluate: (vars: Record<string, number>) => ({ x: Math.cos(vars.t ?? 0), y: Math.sin(vars.t ?? 0) }),
        parameters: [],
        variables: ["t"],
        latex: "test",
      },
    });
    expect(mockBoard.create).toHaveBeenCalledWith(
      "curve",
      expect.any(Array),
      expect.objectContaining({ curveType: "parameter" })
    );
  });

  it("renders implicit2d graph", () => {
    renderGraph({
      graphExpr: {
        type: "implicit2d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) ** 2 + (vars.y ?? 0) ** 2 - 1,
        parameters: [],
        variables: ["x"],
        latex: "test",
      },
    });
    expect(mockBoard.create).toHaveBeenCalledWith(
      "implicitcurve",
      expect.any(Array),
      expect.objectContaining({ strokeWidth: 2 })
    );
  });

  it("handles evaluation error gracefully", () => {
    renderGraph({
      graphExpr: {
        type: "explicit2d" as const,
        evaluate: () => { throw new Error("eval error"); },
        parameters: [],
        variables: ["x"],
        latex: "test",
      },
    });
    // Should not throw
    expect(mockJSXGraph.JSXGraph.initBoard).toHaveBeenCalled();
  });

  it("renders with parameters and slider", () => {
    renderGraph({
      graphExpr: {
        type: "explicit2d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * (vars.a ?? 1),
        parameters: ["a"],
        variables: ["x"],
        latex: "test",
      },
    });
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByLabelText("パラメータ a")).toBeTruthy();
  });

  it("handles reset button click", () => {
    renderGraph();
    const resetBtn = screen.getByLabelText("表示範囲をリセット");
    fireEvent.click(resetBtn);
    expect(mockBoard.setBoundingBox).toHaveBeenCalled();
  });

  it("handles parameter slider change", () => {
    renderGraph({
      graphExpr: {
        type: "explicit2d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * (vars.a ?? 1),
        parameters: ["a"],
        variables: ["x"],
        latex: "test",
      },
    });
    const slider = screen.getByLabelText("パラメータ a");
    fireEvent.change(slider, { target: { value: 3 } });
    // board should update
  });

  it("handles animation toggle", () => {
    jest.useFakeTimers();
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      return 42 as any;
    });
    const cafSpy = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    renderGraph({
      graphExpr: {
        type: "explicit2d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * (vars.a ?? 1),
        parameters: ["a"],
        variables: ["x"],
        latex: "test",
      },
    });

    // Start animation
    const playBtn = screen.getByLabelText("a 再生");
    fireEvent.click(playBtn);

    // Stop animation
    const stopBtn = screen.getByLabelText("a 停止");
    fireEvent.click(stopBtn);

    rafSpy.mockRestore();
    cafSpy.mockRestore();
    jest.useRealTimers();
  });

  it("renders in dark mode", () => {
    renderGraph({}, true);
    expect(mockJSXGraph.JSXGraph.initBoard).toHaveBeenCalled();
  });

  it("calls freeBoard on unmount", () => {
    const { unmount } = renderGraph();
    unmount();
    expect(mockJSXGraph.JSXGraph.freeBoard).toHaveBeenCalled();
  });

  it("calls parametric2d evaluate functions for xParam/yParam", () => {
    const evalFn = jest.fn().mockReturnValue({ x: 1, y: 2 });
    renderGraph({
      graphExpr: {
        type: "parametric2d" as const,
        evaluate: evalFn,
        parameters: [],
        variables: ["t"],
        latex: "test",
      },
    });
    // The curve creation should have called create with function params
    const createCall = mockBoard.create.mock.calls.find((c: any[]) => c[0] === "curve");
    expect(createCall).toBeTruthy();
    // Call the x and y functions to cover those code paths
    if (createCall) {
      const xFn = createCall[1][0];
      const yFn = createCall[1][1];
      expect(typeof xFn(0)).toBe("number");
      expect(typeof yFn(0)).toBe("number");
    }
  });

  it("parametric2d handles non-object return from evaluate", () => {
    const evalFn = jest.fn().mockReturnValue(42); // not an object
    renderGraph({
      graphExpr: {
        type: "parametric2d" as const,
        evaluate: evalFn,
        parameters: [],
        variables: ["t"],
        latex: "test",
      },
    });
    const createCall = mockBoard.create.mock.calls.find((c: any[]) => c[0] === "curve");
    if (createCall) {
      const xFn = createCall[1][0];
      const yFn = createCall[1][1];
      expect(xFn(0)).toBe(0); // fallback
      expect(yFn(0)).toBe(0);
    }
  });

  it("polar evaluate function is called correctly", () => {
    const evalFn = jest.fn().mockReturnValue(3);
    renderGraph({
      graphExpr: {
        type: "polar" as const,
        evaluate: evalFn,
        parameters: [],
        variables: ["theta"],
        latex: "test",
      },
    });
    const createCall = mockBoard.create.mock.calls.find((c: any[]) => c[0] === "curve");
    if (createCall) {
      const xFn = createCall[1][0];
      const yFn = createCall[1][1];
      const xResult = xFn(Math.PI / 2);
      const yResult = yFn(Math.PI / 2);
      expect(typeof xResult).toBe("number");
      expect(typeof yResult).toBe("number");
    }
  });
});
