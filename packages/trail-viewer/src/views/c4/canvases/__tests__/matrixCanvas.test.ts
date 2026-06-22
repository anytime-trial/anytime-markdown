/**
 * Matrix canvas vanilla factories — jsdom mount/update/destroy tests.
 * No pixel assertions. Verifies DOM creation, listener wiring, cleanup.
 */
import type { CoverageMatrix, C4Model, DsmMatrix, FeatureMatrix, HeatmapMatrix } from '@anytime-markdown/trail-core/c4';
import type { FlowGraph } from '@anytime-markdown/trail-core/analyzer';

import { mountCoverageCanvas } from '../coverageCanvas';
import { mountDsmCanvas } from '../dsmCanvas';
import { mountFcMapCanvas } from '../fcMapCanvas';
import { mountFlowchartCanvas } from '../flowchartCanvas';
import { mountHeatmapCanvas } from '../heatmapCanvas';

// Stub ResizeObserver for jsdom
const ROStub = jest.fn().mockImplementation(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
global.ResizeObserver = ROStub;

// --- Fixtures ---

function makeModel(): C4Model {
  return { elements: [], relationships: [] } as unknown as C4Model;
}

function makeCoverageMatrix(): CoverageMatrix {
  return { entries: [] } as unknown as CoverageMatrix;
}

function makeDsmMatrix(): DsmMatrix {
  return { nodes: [], adjacency: [] } as unknown as DsmMatrix;
}

function makeFeatureMatrix(): FeatureMatrix {
  return { mappings: [], categories: [], features: [] } as unknown as FeatureMatrix;
}

function makeFlowGraph(): FlowGraph {
  return { nodes: [], edges: [] } as unknown as FlowGraph;
}

function makeHeatmapMatrix(): HeatmapMatrix {
  return { rows: [], columns: [], cells: [], maxValue: 0 } as unknown as HeatmapMatrix;
}

// ---------------------------------------------------------------------------
// CoverageCanvas
// ---------------------------------------------------------------------------
describe('mountCoverageCanvas', () => {
  it('creates canvas in container without throwing', () => {
    const container = document.createElement('div');
    const handle = mountCoverageCanvas(container, {
      coverageMatrix: makeCoverageMatrix(),
      model: makeModel(),
      isDark: false,
    });
    expect(container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
  });

  it('destroy removes canvas', () => {
    const container = document.createElement('div');
    const handle = mountCoverageCanvas(container, {
      coverageMatrix: makeCoverageMatrix(),
      model: makeModel(),
    });
    handle.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountCoverageCanvas(container, {
      coverageMatrix: makeCoverageMatrix(),
      model: makeModel(),
    });
    expect(() => handle.update({ coverageMatrix: makeCoverageMatrix(), model: makeModel(), isDark: true })).not.toThrow();
    handle.destroy();
  });
});

// ---------------------------------------------------------------------------
// DsmCanvas
// ---------------------------------------------------------------------------
describe('mountDsmCanvas', () => {
  it('creates canvas without throwing', () => {
    const container = document.createElement('div');
    const handle = mountDsmCanvas(container, {
      matrix: makeDsmMatrix(),
      clustered: false,
    });
    expect(container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
  });

  it('destroy removes canvas', () => {
    const container = document.createElement('div');
    const handle = mountDsmCanvas(container, { matrix: null, clustered: false });
    handle.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountDsmCanvas(container, { matrix: null, clustered: false });
    expect(() => handle.update({ matrix: makeDsmMatrix(), clustered: true })).not.toThrow();
    handle.destroy();
  });
});

// ---------------------------------------------------------------------------
// FcMapCanvas
// ---------------------------------------------------------------------------
describe('mountFcMapCanvas', () => {
  it('creates canvas without throwing', () => {
    const container = document.createElement('div');
    const handle = mountFcMapCanvas(container, {
      featureMatrix: makeFeatureMatrix(),
      model: makeModel(),
    });
    expect(container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
  });

  it('destroy removes canvas', () => {
    const container = document.createElement('div');
    const handle = mountFcMapCanvas(container, {
      featureMatrix: makeFeatureMatrix(),
      model: makeModel(),
    });
    handle.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountFcMapCanvas(container, {
      featureMatrix: makeFeatureMatrix(),
      model: makeModel(),
    });
    expect(() => handle.update({ featureMatrix: makeFeatureMatrix(), model: makeModel(), isDark: true })).not.toThrow();
    handle.destroy();
  });
});

// ---------------------------------------------------------------------------
// FlowchartCanvas
// ---------------------------------------------------------------------------
describe('mountFlowchartCanvas', () => {
  it('creates canvas without throwing', () => {
    const container = document.createElement('div');
    const handle = mountFlowchartCanvas(container, {
      graph: makeFlowGraph(),
      isDark: false,
    });
    expect(container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
  });

  it('destroy removes canvas', () => {
    const container = document.createElement('div');
    const handle = mountFlowchartCanvas(container, { graph: makeFlowGraph() });
    handle.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountFlowchartCanvas(container, { graph: makeFlowGraph() });
    expect(() => handle.update({ graph: makeFlowGraph(), isDark: true })).not.toThrow();
    handle.destroy();
  });
});

// ---------------------------------------------------------------------------
// HeatmapCanvas
// ---------------------------------------------------------------------------
describe('mountHeatmapCanvas', () => {
  it('creates canvas without throwing', () => {
    const container = document.createElement('div');
    const handle = mountHeatmapCanvas(container, {
      matrix: makeHeatmapMatrix(),
      colorScale: 'amber',
      isDark: false,
    });
    expect(container.querySelector('canvas')).not.toBeNull();
    handle.destroy();
  });

  it('destroy removes canvas', () => {
    const container = document.createElement('div');
    const handle = mountHeatmapCanvas(container, {
      matrix: makeHeatmapMatrix(),
      colorScale: 'sumi',
    });
    handle.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('click handler fires onCellClick when cell hit', () => {
    const onCellClick = jest.fn();
    const matrix: HeatmapMatrix = {
      rows: [{ id: 'r1', label: 'Row 1' }],
      columns: [{ id: 'c1', label: 'Col 1' }],
      cells: [{ rowIndex: 0, colIndex: 0, value: 5 }],
      maxValue: 5,
    } as unknown as HeatmapMatrix;
    const container = document.createElement('div');
    const handle = mountHeatmapCanvas(container, {
      matrix,
      colorScale: 'amber',
      onCellClick,
    });
    const cvs = container.querySelector('canvas')!;
    // Simulate click inside the cell area (ROW_HEADER=160, COL_HEADER=80, CELL=24)
    // Cell [0,0] is at x=160, y=80 in CSS coords
    Object.defineProperty(cvs, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 200 }),
    });
    cvs.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 165, clientY: 85 }));
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[0]);
    handle.destroy();
  });

  it('update does not throw', () => {
    const container = document.createElement('div');
    const handle = mountHeatmapCanvas(container, {
      matrix: makeHeatmapMatrix(),
      colorScale: 'amber',
    });
    expect(() => handle.update({ matrix: makeHeatmapMatrix(), colorScale: 'sumi', isDark: true })).not.toThrow();
    handle.destroy();
  });
});
