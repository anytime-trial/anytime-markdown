import type { C4Model } from '@anytime-markdown/trail-activity/c4';

import {
  canShowManualContextActions,
  getActivityTrendChartPlacement,
  getActivityTrendChartWidth,
} from '../utils/c4ViewerHelpers';

describe('getActivityTrendChartWidth', () => {
  it('caps the trend chart popup width when element details are hidden', () => {
    expect(getActivityTrendChartWidth(false)).toBe('min(1000px, calc(100% - 16px))');
  });

  it('caps the trend chart popup width while reserving selected element details space', () => {
    expect(getActivityTrendChartWidth(true)).toBe('min(1000px, calc(100% - 256px))');
  });

  it('places the trend chart as an inset graph popup', () => {
    expect(getActivityTrendChartPlacement()).toEqual({
      position: 'absolute',
      left: 8,
      bottom: 8,
      zIndex: 9,
    });
  });
});

describe('canShowManualContextActions', () => {
  const model: C4Model = {
    level: 'context',
    elements: [
      { id: 'manual_system', type: 'system', name: 'Manual', manual: true },
      { id: 'generated_system', type: 'system', name: 'Generated' },
    ],
    relationships: [],
  };

  it('enables context actions only for manual elements', () => {
    expect(canShowManualContextActions(model, 'manual_system')).toBe(true);
    expect(canShowManualContextActions(model, 'generated_system')).toBe(false);
    expect(canShowManualContextActions(model, 'missing')).toBe(false);
  });

  it('keeps context actions hidden without a selected C4 element', () => {
    expect(canShowManualContextActions(model, null)).toBe(false);
    expect(canShowManualContextActions(null, 'manual_system')).toBe(false);
  });
});
