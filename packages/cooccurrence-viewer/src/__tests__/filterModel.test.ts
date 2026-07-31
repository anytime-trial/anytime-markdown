import { filterCooccurrenceFile, type CooccurrenceFile, type CooccurrenceLinkTuple } from '@anytime-markdown/graph-core';
import {
  createFilterOptions,
  parseMinFrequency,
  parseMinStrength,
  parseTopLinkCount,
  sliderPositionFromText,
  sliderTextFromPosition,
  strengthSliderRange,
  topLinkSliderRange,
} from '../ui/filterModel';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
      clusters: [
        { label: 'A', members: [0] },
        { label: 'B', members: [1] },
      ],
    },
  };
}

describe('filterModel', () => {
  it('parses empty and non-numeric strings as undefined', () => {
    expect(parseMinFrequency('')).toBeUndefined();
    expect(parseMinStrength('not a number')).toBeUndefined();
    expect(parseTopLinkCount('')).toBeUndefined();
  });

  it('clamps lower bounds', () => {
    expect(parseMinFrequency('-2')).toBe(1);
    expect(parseMinStrength('-2')).toBe(0);
    expect(parseTopLinkCount('0')).toBeUndefined();
  });

  it('keeps an empty cluster selection as an empty filter that hides all words', () => {
    const options = createFilterOptions({
      minFrequencyText: '',
      minStrengthText: '',
      topLinkCountText: '',
      selectedClusterIndexes: new Set(),
    });
    const result = filterCooccurrenceFile(file(), options);
    expect(options.selectedClusterIndexes).toEqual([]);
    expect(result.counts.visibleNodeCount).toBe(0);
    expect(result.counts.visibleLinkCount).toBe(0);
  });
});

function fileWithLinks(links: readonly CooccurrenceLinkTuple[]): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
        { label: 'Gamma', frequency: 1 },
      ],
      links: [...links],
    },
  };
}

describe('filterModel スライダーの可動域', () => {
  it('強度の可動域を実際の強度の最小・最大から導く', () => {
    const range = strengthSliderRange(fileWithLinks([[0, 1, 0.1], [1, 2, 2.4], [0, 2, 1]]));
    expect(range).toEqual({ min: 0.1, max: 2.4, step: 0.023, enabled: true });
  });

  it('強度が 1 種類しかないときは可動域を持たないものとして無効にする', () => {
    const range = strengthSliderRange(fileWithLinks([[0, 1, 1], [1, 2, 1]]));
    expect(range.enabled).toBe(false);
    expect(range.min).toBe(1);
    expect(range.max).toBe(1);
    expect(range.step).toBeGreaterThan(0);
  });

  it('共起が 1 本も無いときは両方の可動域を無効にする', () => {
    expect(strengthSliderRange(fileWithLinks([])).enabled).toBe(false);
    expect(topLinkSliderRange(fileWithLinks([])).enabled).toBe(false);
  });

  it('上位の共起の可動域は 1 本から共起の総数までとする', () => {
    expect(topLinkSliderRange(fileWithLinks([[0, 1, 1], [1, 2, 2]]))).toEqual({
      min: 1,
      max: 2,
      step: 1,
      enabled: true,
    });
  });
});

describe('filterModel つまみ位置と絞り込み値の変換', () => {
  const strength = { min: 0.1, max: 2.4, step: 0.023, enabled: true };
  const topLinks = { min: 1, max: 42, step: 1, enabled: true };

  it('絞り込みなしの端では空文字を出す（条件を残さない）', () => {
    expect(sliderTextFromPosition(0.1, strength, 'min')).toBe('');
    expect(sliderTextFromPosition(42, topLinks, 'max')).toBe('');
  });

  it('端の内側では丸めた値を出す', () => {
    expect(sliderTextFromPosition(0.5000000000000001, strength, 'min')).toBe('0.5');
    expect(sliderTextFromPosition(18, topLinks, 'max')).toBe('18');
  });

  it('空文字のときはつまみを絞り込みなしの端へ置く', () => {
    expect(sliderPositionFromText('', strength, 'min')).toBe(0.1);
    expect(sliderPositionFromText('', topLinks, 'max')).toBe(42);
    expect(sliderPositionFromText('not a number', strength, 'min')).toBe(0.1);
  });

  it('可動域の外に保存された値はつまみを可動域内へ寄せる', () => {
    expect(sliderPositionFromText('99', strength, 'min')).toBe(2.4);
    expect(sliderPositionFromText('0', strength, 'min')).toBe(0.1);
    expect(sliderPositionFromText('0', topLinks, 'max')).toBe(1);
  });
});
