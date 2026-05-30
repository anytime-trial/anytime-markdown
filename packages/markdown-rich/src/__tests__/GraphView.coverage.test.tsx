/**
 * GraphView / Graph2DView / Graph3DView / useGraphRender のカバレッジテスト
 */
import React from "react";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Mock useGraphRender
const mockUseGraphRender = jest.fn();
jest.mock("../hooks/useGraphRender", () => ({
  useGraphRender: (...args: unknown[]) => mockUseGraphRender(...args),
}));

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.callback = cb; }
  observe(el: Element) {
    // Trigger immediately with a size
    this.callback([{ contentRect: { width: 600, height: 400 } } as ResizeObserverEntry], this as any);
  }
  disconnect() {}
  unobserve() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

import { GraphView } from "../components/codeblock/GraphView";

const darkTheme = createTheme({ palette: { mode: "dark" } });
const lightTheme = createTheme({ palette: { mode: "light" } });

function renderWithTheme(ui: React.ReactElement, dark = false) {
  return render(
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      {ui}
    </ThemeProvider>
  );
}

describe("GraphView", () => {
  beforeEach(() => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: null,
      loading: false,
      error: "",
      jsxGraph: null,
      plotly: null,
    });
  });

  it("returns null when not enabled", () => {
    const { container } = renderWithTheme(
      <GraphView code="y=x" enabled={false} isDark={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows loading spinner", () => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: null,
      loading: true,
      error: "",
      jsxGraph: null,
      plotly: null,
    });
    renderWithTheme(<GraphView code="y=x" enabled={true} isDark={false} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("shows error alert", () => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: null,
      loading: false,
      error: "Parse error",
      jsxGraph: null,
      plotly: null,
    });
    renderWithTheme(<GraphView code="y=x" enabled={true} isDark={false} />);
    expect(screen.getByText("Parse error")).toBeTruthy();
  });

  it("returns null when no graphExpr", () => {
    const { container } = renderWithTheme(
      <GraphView code="y=x" enabled={true} isDark={false} />
    );
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("renders Graph2DView for explicit2d", () => {
    const mockJSXGraph = {
      JSXGraph: {
        initBoard: jest.fn().mockReturnValue({
          create: jest.fn(),
          update: jest.fn(),
          setBoundingBox: jest.fn(),
        }),
        freeBoard: jest.fn(),
      },
    };
    mockUseGraphRender.mockReturnValue({
      graphExpr: {
        type: "explicit2d",
        evaluate: (vars: Record<string, number>) => vars.x * 2,
        parameters: [],
        variables: ["x"],
        latex: "test",
      },
      loading: false,
      error: "",
      jsxGraph: mockJSXGraph,
      plotly: null,
    });
    const { container } = renderWithTheme(
      <GraphView code="y=2x" enabled={true} isDark={false} width={500} height={400} />
    );
    // Should render a graph container
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders Graph3DView for surface3d", () => {
    const mockPlotly = {
      react: jest.fn().mockResolvedValue(undefined),
      purge: jest.fn(),
    };
    mockUseGraphRender.mockReturnValue({
      graphExpr: {
        type: "surface3d",
        evaluate: (vars: Record<string, number>) => vars.x + vars.y,
        parameters: [],
        variables: ["x", "y"],
        latex: "test",
      },
      loading: false,
      error: "",
      jsxGraph: null,
      plotly: mockPlotly,
    });
    const { container } = renderWithTheme(
      <GraphView code="z=x+y" enabled={true} isDark={true} width={500} height={400} />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders in fill mode with loading", () => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: null,
      loading: true,
      error: "",
      jsxGraph: null,
      plotly: null,
    });
    renderWithTheme(
      <GraphView code="y=x" enabled={true} isDark={false} fill={true} />
    );
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("renders in fill mode with error", () => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: null,
      loading: false,
      error: "Error msg",
      jsxGraph: null,
      plotly: null,
    });
    renderWithTheme(
      <GraphView code="y=x" enabled={true} isDark={false} fill={true} />
    );
    expect(screen.getByText("Error msg")).toBeTruthy();
  });

  it("renders in fill mode with 2D graph expr", () => {
    const mockJSXGraph = {
      JSXGraph: {
        initBoard: jest.fn().mockReturnValue({
          create: jest.fn(),
          update: jest.fn(),
          setBoundingBox: jest.fn(),
        }),
        freeBoard: jest.fn(),
      },
    };
    mockUseGraphRender.mockReturnValue({
      graphExpr: {
        type: "explicit2d",
        evaluate: (vars: Record<string, number>) => vars.x,
        parameters: [],
        variables: ["x"],
        latex: "test",
      },
      loading: false,
      error: "",
      jsxGraph: mockJSXGraph,
      plotly: null,
    });
    const { container } = renderWithTheme(
      <GraphView code="y=x" enabled={true} isDark={false} fill={true} />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders in fill mode with 3D graph and plotly", () => {
    const mockPlotly = {
      react: jest.fn().mockResolvedValue(undefined),
      purge: jest.fn(),
    };
    mockUseGraphRender.mockReturnValue({
      graphExpr: {
        type: "parametric3d",
        evaluate: (vars: Record<string, number>) => ({ x: vars.u, y: vars.v, z: 0 }),
        parameters: [],
        variables: ["u", "v"],
        latex: "test",
      },
      loading: false,
      error: "",
      jsxGraph: null,
      plotly: mockPlotly,
    });
    const { container } = renderWithTheme(
      <GraphView code="parametric3d" enabled={true} isDark={true} fill={true} />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("returns null in non-fill mode for 3d without plotly", () => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: {
        type: "surface3d",
        evaluate: () => 0,
        parameters: [],
        variables: ["x", "y"],
        latex: "test",
      },
      loading: false,
      error: "",
      jsxGraph: null,
      plotly: null,
    });
    const { container } = renderWithTheme(
      <GraphView code="z=x" enabled={true} isDark={false} />
    );
    // No progressbar, no error text
    expect(container.textContent).toBe("");
  });

  it("returns null in non-fill mode for 2d without jsxGraph", () => {
    mockUseGraphRender.mockReturnValue({
      graphExpr: {
        type: "explicit2d",
        evaluate: () => 0,
        parameters: [],
        variables: ["x"],
        latex: "test",
      },
      loading: false,
      error: "",
      jsxGraph: null,
      plotly: null,
    });
    const { container } = renderWithTheme(
      <GraphView code="y=x" enabled={true} isDark={false} />
    );
    expect(container.textContent).toBe("");
  });
});
