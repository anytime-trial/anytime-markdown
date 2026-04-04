import { hitTestFrameCollapse, FRAME_COLLAPSE_HIT_SIZE } from '../engine/hitTest';
import { FRAME_ICON_RIGHT_MARGIN } from '../engine/constants';
import type { GraphNode } from '../types';

function makeFrame(overrides?: Partial<GraphNode>): GraphNode {
  return {
    id: 'frame1',
    type: 'frame',
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    text: 'Group',
    style: { fill: 'transparent', stroke: '#000', strokeWidth: 1, fontSize: 14, fontFamily: 'sans-serif' },
    ...overrides,
  };
}

describe('hitTestFrameCollapse', () => {
  it('should return true when clicking inside collapse icon area', () => {
    const frame = makeFrame();
    const iconCenterX = frame.x + frame.width - FRAME_ICON_RIGHT_MARGIN - FRAME_COLLAPSE_HIT_SIZE / 2;
    const iconCenterY = frame.y + 14;
    expect(hitTestFrameCollapse(frame, iconCenterX, iconCenterY)).toBe(true);
  });

  it('should return false when clicking outside icon area', () => {
    const frame = makeFrame();
    expect(hitTestFrameCollapse(frame, frame.x + 200, frame.y + 150)).toBe(false);
  });

  it('should return false for non-frame nodes', () => {
    const rect = makeFrame({ type: 'rect' });
    expect(hitTestFrameCollapse(rect, rect.x + rect.width - 15, rect.y + 14)).toBe(false);
  });

  it('should return true when frame is collapsed', () => {
    const frame = makeFrame({ collapsed: true, height: 28 });
    const iconCenterX = frame.x + frame.width - FRAME_ICON_RIGHT_MARGIN - FRAME_COLLAPSE_HIT_SIZE / 2;
    const iconCenterY = frame.y + 14;
    expect(hitTestFrameCollapse(frame, iconCenterX, iconCenterY)).toBe(true);
  });
});
