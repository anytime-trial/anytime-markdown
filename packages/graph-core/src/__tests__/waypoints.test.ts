import { hitTestEdgeSegment, hitTestWaypointHandle } from '../engine/hitTest';
import type { GraphEdge } from '../types';

function makeEdge(overrides?: Partial<GraphEdge>): GraphEdge {
  return {
    id: 'e1',
    type: 'connector',
    from: { nodeId: 'n1', x: 100, y: 100 },
    to: { nodeId: 'n2', x: 400, y: 300 },
    style: { stroke: '#000', strokeWidth: 2, startShape: 'none', endShape: 'arrow' },
    ...overrides,
  };
}

describe('hitTestEdgeSegment with segmentIndex', () => {
  it('should return segmentIndex for middle segments', () => {
    const edge = makeEdge({
      waypoints: [
        { x: 100, y: 100 },
        { x: 100, y: 150 },
        { x: 250, y: 150 },  // segment 1→2: horizontal
        { x: 250, y: 300 },  // segment 2→3: vertical
        { x: 400, y: 300 },
      ],
    });
    // Hit on horizontal segment (index 1→2)
    const hit1 = hitTestEdgeSegment(edge, 175, 150, 1);
    expect(hit1).not.toBeNull();
    expect(hit1!.segmentDirection).toBe('horizontal');
    expect(hit1!.segmentIndex).toBe(1);

    // Hit on vertical segment (index 2→3)
    const hit2 = hitTestEdgeSegment(edge, 250, 225, 1);
    expect(hit2).not.toBeNull();
    expect(hit2!.segmentDirection).toBe('vertical');
    expect(hit2!.segmentIndex).toBe(2);
  });

  it('should skip first and last segments', () => {
    const edge = makeEdge({
      waypoints: [
        { x: 100, y: 100 },  // segment 0→1: first (skipped)
        { x: 100, y: 200 },
        { x: 400, y: 200 },
        { x: 400, y: 300 },  // segment 2→3: last (skipped)
      ],
    });
    // Hit first segment → should return null
    expect(hitTestEdgeSegment(edge, 100, 150, 1)).toBeNull();
    // Hit last segment → should return null
    expect(hitTestEdgeSegment(edge, 400, 250, 1)).toBeNull();
    // Hit middle segment → should return index 1
    const hit = hitTestEdgeSegment(edge, 250, 200, 1);
    expect(hit).not.toBeNull();
    expect(hit!.segmentIndex).toBe(1);
  });

  it('should return null for edges with fewer than 4 waypoints', () => {
    const edge = makeEdge({ waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }] });
    expect(hitTestEdgeSegment(edge, 50, 50, 1)).toBeNull();
  });
});

describe('hitTestWaypointHandle', () => {
  it('should return index when clicking on a manual waypoint', () => {
    const edge = makeEdge({
      manualWaypoints: [
        { x: 200, y: 150 },
        { x: 300, y: 250 },
      ],
    });
    expect(hitTestWaypointHandle(edge, 200, 150, 1)).toBe(0);
    expect(hitTestWaypointHandle(edge, 300, 250, 1)).toBe(1);
  });

  it('should return null when clicking away from waypoints', () => {
    const edge = makeEdge({
      manualWaypoints: [{ x: 200, y: 150 }],
    });
    expect(hitTestWaypointHandle(edge, 100, 100, 1)).toBeNull();
  });

  it('should return null when no manualWaypoints', () => {
    const edge = makeEdge();
    expect(hitTestWaypointHandle(edge, 200, 150, 1)).toBeNull();
  });

  it('should respect scale for hit radius', () => {
    const edge = makeEdge({
      manualWaypoints: [{ x: 200, y: 150 }],
    });
    // At scale 0.5, radius is larger in world coordinates
    expect(hitTestWaypointHandle(edge, 212, 150, 0.5)).toBe(0);
    // At scale 2, radius is smaller
    expect(hitTestWaypointHandle(edge, 212, 150, 2)).toBeNull();
  });
});
