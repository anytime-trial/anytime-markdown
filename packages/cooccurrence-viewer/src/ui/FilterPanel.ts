import type { CooccurrenceFile, CooccurrenceFilterCounts, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterOptions, filterOptionsToInput, parseMinFrequency, parseMinStrength, parseTopLinkCount, type FilterModelInput } from './filterModel';

export interface FilterPanelState {
  file: CooccurrenceFile;
  filter?: CooccurrenceFilterOptions;
  counts: CooccurrenceFilterCounts;
  t: CooccurrenceT;
}

export interface FilterPanelOptions extends FilterPanelState {
  onFilterChange(options: CooccurrenceFilterOptions): void;
}

export interface FilterPanelHandle {
  element: HTMLElement;
  update(state: FilterPanelState): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-filter-panel-style';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-filter{display:flex;flex-direction:column;gap:12px;padding:12px;border-bottom:1px solid var(--cooc-divider)}
.cooc-filter__title{font:600 13px system-ui,sans-serif;color:var(--cooc-text)}
.cooc-filter__field{display:flex;flex-direction:column;gap:4px;font:12px system-ui,sans-serif;color:var(--cooc-text-secondary)}
.cooc-filter__field input{box-sizing:border-box;width:100%;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-filter__clusters{display:flex;flex-direction:column;gap:6px;max-height:120px;overflow:auto}
.cooc-filter__check{display:flex;gap:6px;align-items:center;color:var(--cooc-text);font:12px system-ui,sans-serif}
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
  const counts = document.createElement('div');
  counts.className = 'cooc-filter__counts';
  element.append(title, minFrequency.row, clusters, minStrength.row, topLinks.row, counts);

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
      const text = document.createElement('span');
      text.textContent = cluster.label;
      label.append(checkbox, text);
      clusters.appendChild(label);
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
