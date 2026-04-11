import { drawEdge } from '../../engine/edgeRenderer';
import { GraphEdge, DEFAULT_EDGE_STYLE } from '../../types';
import type { CanvasColors } from '../../theme';

/** CanvasRenderingContext2D の最小モック */
function createMockCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    // state
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',

    // methods
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    closePath: jest.fn(),
    arc: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn().mockReturnValue({ width: 40 }),
    setLineDash: jest.fn(),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const colors: CanvasColors = {
  canvasBg: '#0D1117',
  canvasGrid: '#1a1a2e',
  canvasSelection: '#90CAF9',
  canvasSelectionFill: 'rgba(144,202,249,0.08)',
  canvasSnap: '#90CAF9',
  canvasSnapInner: '#0D1117',
  canvasSmartGuide: '#90CAF9',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0BEC5',
  textOnLight: '#263238',
  lockIcon: '#90CAF9',
  tooltipBg: '#1E1E2E',
  tooltipBorder: 'rgba(255,255,255,0.12)',
  tooltipText: '#FFFFFF',
  invalidTarget: '#F44336',
  handleFill: '#FFFFFF',
  edgeLabelBg: '#1E1E2E',
  docFill: '#1a1a2e',
  docStroke: 'rgba(255,255,255,0.24)',
  docIconColor: '#90CAF9',
  frameFill: '#1a1a2e',
  frameStroke: 'rgba(255,255,255,0.12)',
  frameTitleBg: '#1a1a2e',
  panelBg: '#1E1E2E',
  panelBorder: 'rgba(255,255,255,0.12)',
  modalBg: '#1E1E2E',
  accentColor: '#90CAF9',
  hoverBg: 'rgba(255,255,255,0.08)',
};

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'e1',
    type: 'line',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 100 },
    style: { ...DEFAULT_EDGE_STYLE },
    ...overrides,
  };
}

describe('drawEdge', () => {
  describe('bezierPath mode', () => {
    it('should call bezierCurveTo when bezierPath has 4 points', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        bezierPath: [
          { x: 0, y: 0 },
          { x: 30, y: 0 },
          { x: 70, y: 100 },
          { x: 100, y: 100 },
        ],
      });
      drawEdge(ctx, edge, false, colors);
      expect(ctx.bezierCurveTo).toHaveBeenCalledWith(30, 0, 70, 100, 100, 100);
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('waypoints mode', () => {
    it('should call lineTo for each waypoint when waypoints >= 2', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        waypoints: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 100 },
          { x: 100, y: 100 },
        ],
      });
      drawEdge(ctx, edge, false, colors);
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(ctx.lineTo).toHaveBeenCalledWith(50, 0);
      expect(ctx.lineTo).toHaveBeenCalledWith(50, 100);
      expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
      expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
    });
  });

  describe('straight line mode', () => {
    it('should draw straight line when no bezierPath or waypoints', () => {
      const ctx = createMockCtx();
      const edge = makeEdge();
      drawEdge(ctx, edge, false, colors);
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
      expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
    });

    it('should fall back to straight line when waypoints has only 1 point', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        waypoints: [{ x: 50, y: 50 }],
      });
      drawEdge(ctx, edge, false, colors);
      // 1 waypoint は条件を満たさないため straight line になる
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
    });
  });

  describe('label rendering', () => {
    it('should call fillText when edge has a label (straight line)', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({ label: 'test label' });
      drawEdge(ctx, edge, false, colors);
      expect(ctx.fillText).toHaveBeenCalledWith('test label', 50, 50);
    });

    it('should call fillText when edge has a label (bezierPath)', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        label: 'bezier label',
        bezierPath: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 60, y: 100 },
          { x: 100, y: 100 },
        ],
      });
      drawEdge(ctx, edge, false, colors);
      expect(ctx.fillText).toHaveBeenCalledWith('bezier label', expect.any(Number), expect.any(Number));
    });

    it('should call fillText when edge has a label (waypoints)', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        label: 'wp label',
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
      });
      drawEdge(ctx, edge, false, colors);
      expect(ctx.fillText).toHaveBeenCalledWith('wp label', expect.any(Number), expect.any(Number));
    });

    it('should not call fillText when edge has no label', () => {
      const ctx = createMockCtx();
      const edge = makeEdge();
      drawEdge(ctx, edge, false, colors);
      expect(ctx.fillText).not.toHaveBeenCalled();
    });
  });

  describe('selected state', () => {
    it('should use canvasSelection color when selected', () => {
      const ctx = createMockCtx();
      const edge = makeEdge();
      drawEdge(ctx, edge, true, colors);
      // strokeStyle は selected 時に canvasSelection に設定される
      expect(ctx.strokeStyle).toBe(colors.canvasSelection);
    });

    it('should use edge style stroke when not selected', () => {
      const ctx = createMockCtx();
      const stroke = '#ff0000';
      const edge = makeEdge({ style: { ...DEFAULT_EDGE_STYLE, stroke } });
      drawEdge(ctx, edge, false, colors);
      expect(ctx.strokeStyle).toBe(stroke);
    });

    it('should increase lineWidth by 1 when selected', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({ style: { ...DEFAULT_EDGE_STYLE, strokeWidth: 2 } });
      drawEdge(ctx, edge, true, colors);
      expect(ctx.lineWidth).toBe(3);
    });
  });

  describe('manualWaypoints handles', () => {
    it('should draw waypoint handles when selected and manualWaypoints exist', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        manualWaypoints: [{ x: 50, y: 50 }],
      });
      drawEdge(ctx, edge, true, colors);
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it('should not draw waypoint handles when not selected', () => {
      const ctx = createMockCtx();
      const edge = makeEdge({
        manualWaypoints: [{ x: 50, y: 50 }],
      });
      drawEdge(ctx, edge, false, colors);
      // fillRect は呼ばれない（ラベルなしの straight line では fillRect 不使用）
      expect(ctx.fillRect).not.toHaveBeenCalled();
    });
  });
});
