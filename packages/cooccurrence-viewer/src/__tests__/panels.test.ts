/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterPanel } from '../ui/FilterPanel';
import { createWordListPanel } from '../ui/WordListPanel';

const t = createCooccurrenceT('Cooccurrence', 'en');

function file(count = 3): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: Array.from({ length: count }, (_, index) => ({
        label: index === 1 ? 'Needle' : `Word ${index}`,
        frequency: index + 1,
      })),
      links: count > 1 ? [[0, 1, 2]] : [],
      clusters: [
        { label: 'One', members: Array.from({ length: count }, (_, index) => index).filter((index) => index % 2 === 0) },
        { label: 'Two', members: Array.from({ length: count }, (_, index) => index).filter((index) => index % 2 === 1) },
      ],
    },
  };
}

describe('FilterPanel', () => {
  it('renders counts from the supplied counts object', () => {
    const panel = createFilterPanel({
      file: file(),
      counts: { visibleNodeCount: 2, totalNodeCount: 3, visibleLinkCount: 1, totalLinkCount: 4 },
      t,
      onFilterChange: jest.fn(),
    });
    document.body.appendChild(panel.element);
    expect(panel.element.textContent).toContain('2 / 3 words');
    expect(panel.element.textContent).toContain('1 / 4 cooccurrences');
    panel.destroy();
  });

  it('preserves focused input value across update', () => {
    const panel = createFilterPanel({
      file: file(),
      counts: { visibleNodeCount: 3, totalNodeCount: 3, visibleLinkCount: 1, totalLinkCount: 1 },
      t,
      onFilterChange: jest.fn(),
    });
    document.body.appendChild(panel.element);
    const input = panel.element.querySelector('input[type="number"]') as HTMLInputElement;
    input.focus();
    input.value = '123';
    panel.update({
      file: file(),
      counts: { visibleNodeCount: 1, totalNodeCount: 3, visibleLinkCount: 0, totalLinkCount: 1 },
      t,
    });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('123');
    panel.destroy();
  });
});

describe('WordListPanel', () => {
  it('filters visible rows by search text without changing the file', () => {
    const onFileChange = jest.fn();
    const panel = createWordListPanel({
      file: file(),
      visibleNodeIndexes: new Set([0, 1, 2]),
      selectedNodeIndex: null,
      t,
      onSelectNode: jest.fn(),
      onFileChange,
    });
    document.body.appendChild(panel.element);
    const search = panel.element.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'needle';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = [...panel.element.querySelectorAll('.cooc-words__row')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Needle');
    expect(onFileChange).not.toHaveBeenCalled();
    panel.destroy();
  });

  it('renders fewer than 100 row elements for 1000 words', () => {
    const panel = createWordListPanel({
      file: file(1000),
      visibleNodeIndexes: new Set(Array.from({ length: 1000 }, (_, index) => index)),
      selectedNodeIndex: null,
      t,
      onSelectNode: jest.fn(),
      onFileChange: jest.fn(),
    });
    document.body.appendChild(panel.element);
    expect(panel.element.querySelectorAll('.cooc-words__row').length).toBeLessThan(100);
    panel.destroy();
  });

  it('lists words hidden by the filter so they stay editable, marked as hidden', () => {
    const panel = createWordListPanel({
      file: file(3),
      // 図では語 0 だけが表示されている状態
      visibleNodeIndexes: new Set([0]),
      selectedNodeIndex: null,
      t,
      onSelectNode: jest.fn(),
      onFileChange: jest.fn(),
    });
    document.body.appendChild(panel.element);
    const rows = [...panel.element.querySelectorAll('.cooc-words__row')] as HTMLElement[];
    // 一覧は編集面なので 3 語すべてを出す（図と同じ絞り込みを掛けない）
    expect(rows).toHaveLength(3);
    const hidden = rows.filter((row) => row.dataset.hiddenByFilter === 'true');
    expect(hidden).toHaveLength(2);
    expect(rows[0]?.dataset.hiddenByFilter).toBe('false');
    panel.destroy();
  });

  it('does not call onFileChange and displays the reason when an edit fails', () => {
    const onFileChange = jest.fn();
    const panel = createWordListPanel({
      file: file(),
      visibleNodeIndexes: new Set([0, 1, 2]),
      selectedNodeIndex: 0,
      t,
      onSelectNode: jest.fn(),
      onFileChange,
    });
    document.body.appendChild(panel.element);
    const frequencyInput = [...panel.element.querySelectorAll('input[type="number"]')][0] as HTMLInputElement;
    frequencyInput.value = '-1';
    const setFrequency = [...panel.element.querySelectorAll('button')].find((button) => button.textContent === 'Set freq');
    setFrequency?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFileChange).not.toHaveBeenCalled();
    expect(panel.element.textContent).toContain('node frequency must not be negative');
    panel.destroy();
  });
});
