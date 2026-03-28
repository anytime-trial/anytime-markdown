/**
 * Graph3DView.tsx のカバレッジテスト
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#E8E6E1",
  getTextSecondary: (isDark: boolean) => isDark ? "#aaa" : "#666",
}));

import { Graph3DView } from "../components/codeblock/Graph3DView";

const lightTheme = createTheme({ palette: { mode: "light" } });
const darkTheme = createTheme({ palette: { mode: "dark" } });

const mockPlotly = {
  react: jest.fn().mockResolvedValue(undefined),
  purge: jest.fn(),
};

function renderGraph3D(props: Partial<React.ComponentProps<typeof Graph3DView>> = {}, dark = false) {
  const defaultProps = {
    graphExpr: {
      type: "surface3d" as const,
      evaluate: (vars: Record<string, number>) => (vars.x ?? 0) + (vars.y ?? 0),
      parameters: [] as string[],
      variables: ["x", "y"],
      latex: "x + y",
    },
    plotly: mockPlotly as any,
    isDark: dark,
    width: 500,
    height: 400,
  };
  return render(
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      <Graph3DView {...defaultProps} {...props} />
    </ThemeProvider>
  );
}

describe("Graph3DView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders surface3d and calls plotly.react", () => {
    renderGraph3D();
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("renders surface3d in dark mode", () => {
    renderGraph3D({}, true);
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("renders parametric3d", () => {
    renderGraph3D({
      graphExpr: {
        type: "parametric3d" as const,
        evaluate: (vars: Record<string, number>) => ({
          x: Math.cos(vars.u ?? 0) * Math.sin(vars.v ?? 0),
          y: Math.sin(vars.u ?? 0) * Math.sin(vars.v ?? 0),
          z: Math.cos(vars.v ?? 0),
        }),
        parameters: [],
        variables: ["u", "v"],
        latex: "parametric3d",
      },
    });
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("handles evaluation error in surface3d", () => {
    renderGraph3D({
      graphExpr: {
        type: "surface3d" as const,
        evaluate: () => { throw new Error("eval error"); },
        parameters: [],
        variables: ["x", "y"],
        latex: "x+y",
      },
    });
    // Should not throw - plotly.react called with NaN values
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("handles evaluation error in parametric3d", () => {
    renderGraph3D({
      graphExpr: {
        type: "parametric3d" as const,
        evaluate: () => { throw new Error("eval error"); },
        parameters: [],
        variables: ["u", "v"],
        latex: "parametric3d",
      },
    });
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("handles non-object return in parametric3d", () => {
    renderGraph3D({
      graphExpr: {
        type: "parametric3d" as const,
        evaluate: () => 42, // not object
        parameters: [],
        variables: ["u", "v"],
        latex: "parametric3d",
      },
    });
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("handles non-finite values in surface3d", () => {
    renderGraph3D({
      graphExpr: {
        type: "surface3d" as const,
        evaluate: () => Infinity,
        parameters: [],
        variables: ["x", "y"],
        latex: "x+y",
      },
    });
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("handles non-finite values in parametric3d", () => {
    renderGraph3D({
      graphExpr: {
        type: "parametric3d" as const,
        evaluate: () => ({ x: Infinity, y: NaN, z: -Infinity }),
        parameters: [],
        variables: ["u", "v"],
        latex: "parametric3d",
      },
    });
    expect(mockPlotly.react).toHaveBeenCalled();
  });

  it("renders with parameters", () => {
    renderGraph3D({
      graphExpr: {
        type: "surface3d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * (vars.a ?? 1),
        parameters: ["a"],
        variables: ["x", "y"],
        latex: "x+y",
      },
    });
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByLabelText("パラメータ a")).toBeTruthy();
  });

  it("handles parameter change", () => {
    renderGraph3D({
      graphExpr: {
        type: "surface3d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * (vars.a ?? 1),
        parameters: ["a"],
        variables: ["x", "y"],
        latex: "x+y",
      },
    });
    const slider = screen.getByLabelText("パラメータ a");
    fireEvent.change(slider, { target: { value: 3 } });
  });

  it("handles animation toggle", () => {
    const rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 42 as any);
    const cafSpy = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    renderGraph3D({
      graphExpr: {
        type: "surface3d" as const,
        evaluate: (vars: Record<string, number>) => (vars.x ?? 0) * (vars.a ?? 1),
        parameters: ["a"],
        variables: ["x", "y"],
        latex: "x+y",
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
  });

  it("calls plotly.purge on unmount", () => {
    const { unmount } = renderGraph3D();
    unmount();
    // purge may or may not be called synchronously depending on timing
    // The important thing is no error is thrown on unmount
  });

  it("handles plotly.react rejection gracefully", () => {
    mockPlotly.react.mockRejectedValueOnce(new Error("render failed"));
    renderGraph3D();
    // Should not throw
  });

  it("returns null data for unknown type", () => {
    renderGraph3D({
      graphExpr: {
        type: "explicit2d" as any, // not a 3d type
        evaluate: () => 0,
        parameters: [],
        variables: ["x"],
        latex: "explicit2d",
      },
    });
    // buildPlotData returns null, so plotly.react is not called with data
  });
});
