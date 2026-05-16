import { PanPhysics } from '../canvas/PanPhysics';

describe('PanPhysics', () => {
  describe('initial state', () => {
    it('starts idle — tick returns false', () => {
      const p = new PanPhysics();
      expect(p.tick()).toBe(false);
    });
    it('has default viewX=0 viewY=0 zoom=1', () => {
      const p = new PanPhysics();
      expect(p.viewX).toBe(0);
      expect(p.viewY).toBe(0);
      expect(p.zoom).toBe(1);
    });
    it('accepts constructor args', () => {
      const p = new PanPhysics(5, 10, 2);
      expect(p.viewX).toBe(5);
      expect(p.viewY).toBe(10);
      expect(p.zoom).toBe(2);
    });
  });

  describe('tick()', () => {
    it('applies friction: viewX moves by velocity * friction', () => {
      const p = new PanPhysics();
      p.applyImpulse(100, 0);
      p.tick();
      expect(p.viewX).toBeCloseTo(100 * 0.88, 5);
    });
    it('returns true while |velocity| >= threshold', () => {
      const p = new PanPhysics();
      p.applyImpulse(10, 0);
      expect(p.tick()).toBe(true);
    });
    it('returns false when |velocity| < 0.01', () => {
      const p = new PanPhysics();
      p.applyImpulse(0.005, 0);
      expect(p.tick()).toBe(false);
    });
    it('cumulative velocity decays to idle after many ticks', () => {
      const p = new PanPhysics();
      p.applyImpulse(1, 0);
      let steps = 0;
      while (p.tick() && steps < 200) steps++;
      expect(steps).toBeLessThan(200);
    });
  });

  describe('spring boundary', () => {
    it('pushes viewX up when below minX', () => {
      const p = new PanPhysics(-10, 0, 1);
      p.setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
      const before = p.viewX;
      p.tick();
      expect(p.viewX).toBeGreaterThan(before);
    });
    it('pushes viewX down when above maxX', () => {
      const p = new PanPhysics(110, 0, 1);
      p.setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
      const before = p.viewX;
      p.tick();
      expect(p.viewX).toBeLessThan(before);
    });
    it('does not push when inside bounds', () => {
      const p = new PanPhysics(50, 50, 1);
      p.setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
      p.tick();
      // velocity was 0, viewX stays 50
      expect(p.viewX).toBeCloseTo(50, 5);
    });
  });

  describe('applyImpulse()', () => {
    it('adds velocity that moves view on next tick', () => {
      const p = new PanPhysics();
      p.applyImpulse(5, 3);
      p.tick();
      expect(p.viewX).toBeCloseTo(5 * 0.88, 5);
      expect(p.viewY).toBeCloseTo(3 * 0.88, 5);
    });
    it('adds to existing velocity', () => {
      const p = new PanPhysics();
      p.applyImpulse(2, 0);
      p.applyImpulse(3, 0);
      p.tick();
      expect(p.viewX).toBeCloseTo(5 * 0.88, 5);
    });
  });

  describe('pan()', () => {
    it('moves viewX opposite to dx (drag right = view moves left)', () => {
      const p = new PanPhysics(0, 0, 1);
      p.pan(10, 0);
      expect(p.viewX).toBeCloseTo(-10, 5);
    });
    it('moves viewY in same direction as dy (drag down = view moves down in data)', () => {
      const p = new PanPhysics(0, 0, 1);
      p.pan(0, 10);
      expect(p.viewY).toBeCloseTo(10, 5);
    });
    it('scales by zoom', () => {
      const p = new PanPhysics(0, 0, 2);
      p.pan(10, 0);
      expect(p.viewX).toBeCloseTo(-5, 5);
    });
  });

  describe('zoomAt()', () => {
    it('changes zoom', () => {
      const p = new PanPhysics(0, 0, 1);
      p.zoomAt(2, 0, 0);
      expect(p.zoom).toBeCloseTo(2, 5);
    });
    it('keeps anchor data point at same canvas position', () => {
      const p = new PanPhysics(0, 0, 1);
      // anchor at data point (5, 0): canvasX = (5 - 0) * 1 = 5
      p.zoomAt(2, 5, 0);
      // After zoom: canvasX should still be 5
      // canvasX = (anchorDataX - viewX_new) * zoom_new = (5 - viewX_new) * 2 = 5
      // viewX_new = 5 - 5/2 = 2.5
      expect(p.viewX).toBeCloseTo(2.5, 5);
    });
  });

  describe('fitToData()', () => {
    it('positions all points inside canvas with padding', () => {
      const p = new PanPhysics();
      const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
      p.fitToData(pts, 400, 400, 40);
      const canvasX0 = (0 - p.viewX) * p.zoom;
      const canvasX1 = (10 - p.viewX) * p.zoom;
      const canvasY0 = 400 - (0 - p.viewY) * p.zoom;
      const canvasY1 = 400 - (10 - p.viewY) * p.zoom;
      expect(canvasX0).toBeGreaterThanOrEqual(39);
      expect(canvasX1).toBeLessThanOrEqual(361);
      expect(canvasY0).toBeLessThanOrEqual(361);
      expect(canvasY1).toBeGreaterThanOrEqual(39);
    });
    it('does nothing with empty points', () => {
      const p = new PanPhysics(5, 5, 2);
      p.fitToData([], 400, 400, 40);
      expect(p.viewX).toBe(5);
      expect(p.zoom).toBe(2);
    });
    it('resets velocity to zero', () => {
      const p = new PanPhysics();
      p.applyImpulse(100, 100);
      p.fitToData([{ x: 0, y: 0 }], 400, 400, 40);
      expect(p.tick()).toBe(false);
    });
  });
});
