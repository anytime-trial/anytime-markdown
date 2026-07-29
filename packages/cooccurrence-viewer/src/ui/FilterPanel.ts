import type { CooccurrenceFile, CooccurrenceFilterCounts, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterOptions, filterOptionsToInput, parseMinFrequency, parseMinStrength, parseTopLinkCount, type FilterModelInput } from './filterModel';
import { clusterColorVarName } from '../theme/readTheme';
import { ensureButtonBaseStyles } from './buttonBaseStyle';

export interface FilterPanelState {
  file: CooccurrenceFile;
  filter?: CooccurrenceFilterOptions;
  counts: CooccurrenceFilterCounts;
  t: CooccurrenceT;
  /**
   * 表示するスライスの添字（設計書 §3.6.5）。`undefined` は全表示。
   *
   * 絞り込みの他の 4 条件（`filter`）と別の入れ物にするのは、これがファイルの要素ではなく
   * レイヤーを落とす操作だからである。`CooccurrenceFilterOptions` は graph-core が
   * 語・共起の集合を決めるために受け取る型であり、そこへ混ぜると「1 枚のスライスを指す」
   * 意味の `sliceIndex` と「複数枚を選ぶ」意味の集合が同じ型に同居する。
   */
  selectedSlices?: readonly number[];
}

export interface FilterPanelOptions extends FilterPanelState {
  onFilterChange(options: CooccurrenceFilterOptions): void;
  onSelectedSlicesChange(selected: readonly number[]): void;
}

export interface FilterPanelHandle {
  element: HTMLElement;
  update(state: FilterPanelState): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-filter-panel-style';

function ensureStyles(): void {
  // 現状このパネルに button は無いが、3 パネルで呼び出しを揃えておく。
  // 例外を作ると、後からボタンを足す人が土台の注入に気づけない。
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-filter{display:flex;flex-direction:column;flex:0 0 auto;gap:12px;padding:12px;border-bottom:1px solid var(--cooc-divider)}
.cooc-filter__title{font:600 13px system-ui,sans-serif;color:var(--cooc-text)}
.cooc-filter__field{display:flex;flex-direction:column;gap:4px;font:12px system-ui,sans-serif;color:var(--cooc-text-secondary)}
.cooc-filter__field input{box-sizing:border-box;width:100%;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-filter__clusters{display:flex;flex-direction:column;gap:6px;max-height:120px;overflow:auto}
.cooc-filter__slices{display:flex;flex-direction:column;gap:6px;max-height:120px;overflow:auto}
.cooc-filter__slices[hidden]{display:none}
.cooc-filter__subtitle{font:600 12px system-ui,sans-serif;color:var(--cooc-text)}
.cooc-filter__subtitle[hidden]{display:none}
.cooc-filter__check{display:flex;gap:6px;align-items:center;color:var(--cooc-text);font:12px system-ui,sans-serif}
.cooc-filter__swatch{flex:0 0 auto;width:10px;height:10px;border-radius:50%;border:1px solid var(--cooc-divider)}
.cooc-filter__counts{display:flex;flex-direction:column;gap:2px;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

function inputRow(label: string, value: string): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'cooc-filter__field';
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  row.append(text, input);
  return { row, input };
}

export function createFilterPanel(options: FilterPanelOptions): FilterPanelHandle {
  ensureStyles();
  let state: FilterPanelState = options;
  let inputState: FilterModelInput = filterOptionsToInput(state.file, state.filter);
  let t = state.t;

  const element = document.createElement('section');
  element.className = 'cooc-filter';

  const title = document.createElement('div');
  title.className = 'cooc-filter__title';
  title.textContent = t('filter.title');

  const minFrequency = inputRow(t('filter.minFrequency'), inputState.minFrequencyText);
  const minStrength = inputRow(t('filter.minStrength'), inputState.minStrengthText);
  const topLinks = inputRow(t('filter.topLinks'), inputState.topLinkCountText);
  const clusters = document.createElement('div');
  clusters.className = 'cooc-filter__clusters';
  const slicesTitle = document.createElement('div');
  slicesTitle.className = 'cooc-filter__subtitle';
  const slices = document.createElement('div');
  slices.className = 'cooc-filter__slices';
  const counts = document.createElement('div');
  counts.className = 'cooc-filter__counts';
  element.append(
    title,
    minFrequency.row,
    clusters,
    minStrength.row,
    topLinks.row,
    slicesTitle,
    slices,
    counts,
  );

  function emit(): void {
    if ((state.file.spec.clusters?.length ?? 0) === 0) {
      const minFrequency = parseMinFrequency(inputState.minFrequencyText);
      const minStrength = parseMinStrength(inputState.minStrengthText);
      const topLinkCount = parseTopLinkCount(inputState.topLinkCountText);
      options.onFilterChange({
        ...(minFrequency === undefined ? {} : { minFrequency }),
        ...(minStrength === undefined ? {} : { minStrength }),
        ...(topLinkCount === undefined ? {} : { topLinkCount }),
      });
      return;
    }
    options.onFilterChange(createFilterOptions(inputState));
  }

  function bindTextInput(input: HTMLInputElement, key: 'minFrequencyText' | 'minStrengthText' | 'topLinkCountText'): void {
    input.addEventListener('input', () => {
      inputState = { ...inputState, [key]: input.value };
      emit();
    });
  }

  bindTextInput(minFrequency.input, 'minFrequencyText');
  bindTextInput(minStrength.input, 'minStrengthText');
  bindTextInput(topLinks.input, 'topLinkCountText');

  function renderClusters(): void {
    clusters.replaceChildren();
    const clusterSpecs = state.file.spec.clusters ?? [];
    if (clusterSpecs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cooc-filter__check';
      empty.textContent = t('filter.noClusters');
      clusters.appendChild(empty);
      return;
    }
    clusterSpecs.forEach((cluster, index) => {
      const label = document.createElement('label');
      label.className = 'cooc-filter__check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = inputState.selectedClusterIndexes.has(index);
      checkbox.addEventListener('change', () => {
        const next = new Set(inputState.selectedClusterIndexes);
        if (checkbox.checked) {
          next.add(index);
        } else {
          next.delete(index);
        }
        inputState = { ...inputState, selectedClusterIndexes: next };
        emit();
      });
      // グラフ上の円と同じ色を示す見本。色は装飾で、情報の正はクラスタ名のテキスト側にある。
      const swatch = document.createElement('span');
      swatch.className = 'cooc-filter__swatch';
      swatch.style.background = `var(${clusterColorVarName(index)})`;
      swatch.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = cluster.label;
      label.append(checkbox, swatch, text);
      clusters.appendChild(label);
    });
  }

  /**
   * 表示するスライスの選択（設計書 §3.6.5）。
   *
   * 落としたスライスを挟む 2 つのレイヤーは点線で直接は結ばない。間に何があったか分からない
   * まま線を引かないためで、`buildRenderGraph` が「隣り合うレイヤー」だけを結ぶことで満たす。
   */
  function renderSlices(): void {
    const sliceSpecs = state.file.spec.timeline?.slices ?? [];
    const hidden = sliceSpecs.length === 0;
    slicesTitle.hidden = hidden;
    slices.hidden = hidden;
    slicesTitle.textContent = t('filter.slices');
    slices.replaceChildren();
    if (hidden) return;

    const selected = state.selectedSlices;
    sliceSpecs.forEach((slice, index) => {
      const label = document.createElement('label');
      label.className = 'cooc-filter__check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected === undefined || selected.includes(index);
      checkbox.addEventListener('change', () => {
        const current = new Set(selected ?? sliceSpecs.map((_slice, i) => i));
        if (checkbox.checked) {
          current.add(index);
        } else {
          current.delete(index);
        }
        options.onSelectedSlicesChange([...current].sort((a, b) => a - b));
      });
      const text = document.createElement('span');
      text.textContent = slice.at === undefined ? slice.label : `${slice.label}（${slice.at}）`;
      label.append(checkbox, text);
      slices.appendChild(label);
    });
  }

  function renderCounts(): void {
    counts.replaceChildren();
    const nodes = document.createElement('div');
    nodes.textContent = t('filter.wordsCount', {
      visible: state.counts.visibleNodeCount,
      total: state.counts.totalNodeCount,
    });
    const links = document.createElement('div');
    links.textContent = t('filter.cooccurrencesCount', {
      visible: state.counts.visibleLinkCount,
      total: state.counts.totalLinkCount,
    });
    counts.append(nodes, links);
  }

  function syncInputs(): void {
    if (document.activeElement !== minFrequency.input) minFrequency.input.value = inputState.minFrequencyText;
    if (document.activeElement !== minStrength.input) minStrength.input.value = inputState.minStrengthText;
    if (document.activeElement !== topLinks.input) topLinks.input.value = inputState.topLinkCountText;
  }

  function render(): void {
    title.textContent = t('filter.title');
    minFrequency.row.querySelector('span')!.textContent = t('filter.minFrequency');
    minStrength.row.querySelector('span')!.textContent = t('filter.minStrength');
    topLinks.row.querySelector('span')!.textContent = t('filter.topLinks');
    syncInputs();
    renderClusters();
    renderSlices();
    renderCounts();
  }

  render();

  return {
    element,
    update(nextState: FilterPanelState): void {
      const active = document.activeElement;
      state = nextState;
      t = state.t;
      const nextInputState = filterOptionsToInput(state.file, state.filter);
      inputState = {
        minFrequencyText: active === minFrequency.input ? minFrequency.input.value : nextInputState.minFrequencyText,
        minStrengthText: active === minStrength.input ? minStrength.input.value : nextInputState.minStrengthText,
        topLinkCountText: active === topLinks.input ? topLinks.input.value : nextInputState.topLinkCountText,
        selectedClusterIndexes: nextInputState.selectedClusterIndexes,
      };
      render();
      if (active instanceof HTMLElement && element.contains(active)) active.focus();
    },
    destroy(): void {
      element.remove();
    },
  };
}
