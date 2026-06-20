import {
  RELATION_TYPES,
  DEFAULT_RELATION_TYPE,
  isRelationType,
  coerceRelationType,
  relationEdgeStyle,
  resolveRelationEdgeStyle,
} from '../relationStyle';
import { thinkingPalette } from '../palette';

describe('relation vocabulary', () => {
  it('exposes the controlled vocabulary including references default', () => {
    expect(RELATION_TYPES).toEqual([
      'references',
      'depends-on',
      'implements',
      'part-of',
      'supersedes',
      'refines',
    ]);
    expect(DEFAULT_RELATION_TYPE).toBe('references');
  });

  it('recognizes known types and rejects unknown via isRelationType', () => {
    expect(isRelationType('depends-on')).toBe(true);
    expect(isRelationType('mentions')).toBe(false);
    expect(isRelationType(undefined)).toBe(false);
    expect(isRelationType(42)).toBe(false);
  });

  it('coerces unknown types to references with a warning (no silent ignore)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(coerceRelationType('mentions')).toBe('references');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(coerceRelationType('depends-on')).toBe('depends-on');
    } finally {
      warn.mockRestore();
    }
  });

  it('does not warn when type is empty/undefined (treated as default references)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(coerceRelationType(undefined)).toBe('references');
      expect(coerceRelationType('')).toBe('references');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('relationEdgeStyle', () => {
  const dark = thinkingPalette(true);
  const light = thinkingPalette(false);

  it('renders references as a thin dashed edge (weak, default)', () => {
    const s = relationEdgeStyle('references', dark);
    expect(s.dashed).toBe(true);
    expect(s.strokeWidth).toBeLessThan(2);
    expect(s.label).toBeUndefined();
  });

  it('renders depends-on / implements as solid arrowed edges with labels', () => {
    for (const t of ['depends-on', 'implements'] as const) {
      const s = relationEdgeStyle(t, dark);
      expect(s.dashed).toBe(false);
      expect(s.endShape).toBe('arrow');
      expect(s.label).toBe(t);
    }
  });

  it('renders supersedes with the accent emphasis color', () => {
    const s = relationEdgeStyle('supersedes', dark);
    expect(s.stroke).toBe(dark.accent);
    expect(s.label).toBe('supersedes');
  });

  it('produces theme-distinct colors for dark and light', () => {
    expect(relationEdgeStyle('depends-on', dark).stroke).not.toBe(
      relationEdgeStyle('depends-on', light).stroke,
    );
  });

  it('resolveRelationEdgeStyle resolves the palette from a dark/light flag', () => {
    expect(resolveRelationEdgeStyle('depends-on', true)).toEqual(relationEdgeStyle('depends-on', dark));
    expect(resolveRelationEdgeStyle('depends-on', false)).toEqual(relationEdgeStyle('depends-on', light));
  });
});
