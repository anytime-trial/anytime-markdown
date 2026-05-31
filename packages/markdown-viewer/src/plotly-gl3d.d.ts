declare module "plotly.js-gl3d-dist-min" {
  interface PlotData {
    type: string;
    x?: number[] | number[][];
    y?: number[] | number[][];
    z?: number[][] | number[][][];
    colorscale?: string;
    showscale?: boolean;
    [key: string]: unknown;
  }

  interface Layout {
    width?: number;
    height?: number;
    margin?: { l?: number; r?: number; t?: number; b?: number };
    paper_bgcolor?: string;
    scene?: {
      bgcolor?: string;
      xaxis?: Record<string, unknown>;
      yaxis?: Record<string, unknown>;
      zaxis?: Record<string, unknown>;
    };
    [key: string]: unknown;
  }

  interface Config {
    displayModeBar?: boolean;
    modeBarButtonsToRemove?: string[];
    responsive?: boolean;
    [key: string]: unknown;
  }

  function newPlot(
    root: HTMLElement,
    data: Partial<PlotData>[],
    layout?: Partial<Layout>,
    config?: Partial<Config>
  ): Promise<void>;

  function purge(root: HTMLElement): void;

  function react(
    root: HTMLElement,
    data: Partial<PlotData>[],
    layout?: Partial<Layout>,
    config?: Partial<Config>
  ): Promise<void>;
}
