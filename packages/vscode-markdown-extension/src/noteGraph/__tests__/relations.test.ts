import {
  RELATION_TYPES,
  DEFAULT_RELATION_TYPE,
  coerceRelationType,
  isRelationType,
} from '../relations';
import { RELATION_TYPES as CORE_RELATION_TYPES } from '@anytime-markdown/graph-core';

describe('relations (host mirror)', () => {
  it('stays in sync with the graph-core vocabulary (single source)', () => {
    // ホストのローカルミラーが graph-core と乖離すると、未知型が無言で references へ
    // ダウングレードされる。語彙の一致を CI で固定する。
    expect([...RELATION_TYPES]).toEqual([...CORE_RELATION_TYPES]);
    expect(DEFAULT_RELATION_TYPE).toBe('references');
  });

  it('coerces known/unknown types (unknown → references with warning)', () => {
    const warn = jest.fn();
    expect(coerceRelationType('depends-on', warn)).toBe('depends-on');
    expect(coerceRelationType('mentions', warn)).toBe('references');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(coerceRelationType(undefined, warn)).toBe('references');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('isRelationType guards the vocabulary', () => {
    expect(isRelationType('supersedes')).toBe(true);
    expect(isRelationType('nope')).toBe(false);
  });
});
