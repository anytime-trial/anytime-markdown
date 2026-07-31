/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile, CooccurrenceFilterOptions, CooccurrenceLinkTuple } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterPanel } from '../ui/FilterPanel';

const t = createCooccurrenceT('Cooccurrence', 'ja');

function file(links: readonly CooccurrenceLinkTuple[]): CooccurrenceFile {
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

const LINKS: readonly CooccurrenceLinkTuple[] = [
  [0, 1, 0.1],
  [1, 2, 1.2],
  [0, 2, 2.1],
];

function mount(links: readonly CooccurrenceLinkTuple[] = LINKS): {
  element: HTMLElement;
  emitted: CooccurrenceFilterOptions[];
  destroy(): void;
} {
  const emitted: CooccurrenceFilterOptions[] = [];
  const panel = createFilterPanel({
    file: file(links),
    counts: {
      visibleNodeCount: 3,
      totalNodeCount: 3,
      visibleLinkCount: links.length,
      totalLinkCount: links.length,
    },
    t,
    onFilterChange: (options) => emitted.push(options),
    onSelectedSliceLabelsChange: jest.fn(),
  });
  document.body.appendChild(panel.element);
  return { element: panel.element, emitted, destroy: () => panel.destroy() };
}

/** 並びは絞り込みの適用順（最小出現頻度 → 最小共起強度 → 上位の共起）。 */
function sliders(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type=range]')];
}

function drag(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => document.body.replaceChildren());

describe('絞り込みのスライダー', () => {
  it('最小共起強度と上位の共起がスライダーになり、可動域が実データから決まる', () => {
    const panel = mount();

    const [frequency, strength, topLinks] = sliders(panel.element);
    expect(frequency.min).toBe('1');
    expect(frequency.max).toBe('3');
    // 頻度は回数なので刻みも 1 にする（12.25 のような位置に止めない）。
    expect(frequency.step).toBe('1');
    expect(strength.min).toBe('0.1');
    expect(strength.max).toBe('2.1');
    expect(topLinks.min).toBe('1');
    expect(topLinks.max).toBe('3');

    panel.destroy();
  });

  it('初期状態は両端の「絞り込みなし」に置かれ、条件を出さない', () => {
    const panel = mount();

    const [frequency, strength, topLinks] = sliders(panel.element);
    expect(frequency.value).toBe('1');
    expect(strength.value).toBe('0.1');
    expect(topLinks.value).toBe('3');

    // 端から動かして戻すと、絞り込みの条件が消える（元に戻せることの検査）。
    // 「条件が無い」は否定形の検査なので、発火そのものが起きていない状態で素通りしないよう
    // 発火回数を先に確かめる。
    drag(frequency, '2');
    expect(panel.emitted).toHaveLength(1);
    expect(panel.emitted[0].minFrequency).toBe(2);
    drag(frequency, '1');
    expect(panel.emitted).toHaveLength(2);
    expect(Object.keys(panel.emitted[1])).not.toContain('minFrequency');

    drag(strength, '1.2');
    expect(panel.emitted).toHaveLength(3);
    expect(panel.emitted[2].minStrength).toBe(1.2);
    drag(strength, '0.1');
    expect(panel.emitted).toHaveLength(4);
    expect(Object.keys(panel.emitted[3])).not.toContain('minStrength');

    drag(topLinks, '2');
    expect(panel.emitted).toHaveLength(5);
    expect(panel.emitted[4].topLinkCount).toBe(2);
    drag(topLinks, '3');
    expect(panel.emitted).toHaveLength(6);
    expect(Object.keys(panel.emitted[5])).not.toContain('topLinkCount');

    panel.destroy();
  });

  it('現在値を併記し、絞り込みなしの端では数値でなく「全件」と出す', () => {
    const panel = mount();

    const values = [...panel.element.querySelectorAll<HTMLElement>('.cooc-filter__value')];
    expect(values.map((value) => value.textContent)).toEqual(['全件', '全件', '全件']);

    drag(sliders(panel.element)[1], '1.2');
    expect(values[1].textContent).toBe('1.2');
    drag(sliders(panel.element)[2], '2');
    expect(values[2].textContent).toBe('2');

    panel.destroy();
  });

  it('共起が 1 本も無いときは共起側のスライダーを操作できないようにする', () => {
    const panel = mount([]);

    const [frequency, strength, topLinks] = sliders(panel.element);
    // 語は残っているので頻度は動かせる。共起側だけが幅を失う。
    expect(frequency.disabled).toBe(false);
    expect(strength.disabled).toBe(true);
    expect(topLinks.disabled).toBe(true);

    panel.destroy();
  });

  it('強度が 1 種類しかないときは強度のスライダーだけ操作できない', () => {
    const panel = mount([[0, 1, 1], [1, 2, 1]]);

    const [, strength, topLinks] = sliders(panel.element);
    expect(strength.disabled).toBe(true);
    expect(topLinks.disabled).toBe(false);

    panel.destroy();
  });
});
