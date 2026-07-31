import type { CooccurrenceFile, CooccurrenceFilterCounts, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import {
  createFilterOptions,
  filterOptionsToInput,
  parseMinFrequency,
  parseMinStrength,
  parseTopLinkCount,
  roundSliderValue,
  sliderPositionFromText,
  sliderTextFromPosition,
  strengthSliderRange,
  topLinkSliderRange,
  type FilterModelInput,
  type SliderNoFilterEdge,
  type SliderRange,
} from './filterModel';
import { clusterColorVarName } from '../theme/readTheme';
import { ensureButtonBaseStyles } from './buttonBaseStyle';

export interface FilterPanelState {
  file: CooccurrenceFile;
  filter?: CooccurrenceFilterOptions;
  counts: CooccurrenceFilterCounts;
  t: CooccurrenceT;
  /**
   * 表示するスライスのラベル（設計書 §3.6.5）。`undefined` は全表示。
   *
   * 絞り込みの他の 4 条件（`filter`）と別の入れ物にするのは、これがファイルの要素ではなく
   * レイヤーを落とす操作だからである。`CooccurrenceFilterOptions` は graph-core が
   * 語・共起の集合を決めるために受け取る型であり、そこへ混ぜると「1 枚のスライスを指す」
   * 意味の `sliceIndex` と「複数枚を選ぶ」意味の集合が同じ型に同居する。
   */
  selectedSliceLabels?: readonly string[];
}

export interface FilterPanelOptions extends FilterPanelState {
  onFilterChange(options: CooccurrenceFilterOptions): void;
  onSelectedSliceLabelsChange(selected: readonly string[]): void;
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
.cooc-filter__field input[type=range]{border:none;background:transparent;padding:0;accent-color:var(--cooc-accent,#E8A012);cursor:pointer}
.cooc-filter__field input[type=range]:disabled{cursor:default;opacity:0.5}
.cooc-filter__head{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.cooc-filter__value{flex:0 0 auto;color:var(--cooc-text);font:12px system-ui,sans-serif;font-variant-numeric:tabular-nums}
.cooc-filter__bounds{display:flex;justify-content:space-between;color:var(--cooc-text-secondary);font:11px system-ui,sans-serif;font-variant-numeric:tabular-nums}
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

interface FieldRow {
  row: HTMLElement;
  input: HTMLInputElement;
  label: HTMLElement;
}

function inputRow(label: string, value: string): FieldRow {
  const row = document.createElement('label');
  row.className = 'cooc-filter__field';
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  row.append(text, input);
  return { row, input, label: text };
}

interface SliderFieldRow extends FieldRow {
  /** 現在値の表示。可動域だけでは今どこにいるかが読めないため、数値も併記する。 */
  value: HTMLElement;
  /** 可動域の両端の表示。「どこまで動かせるか」＝データの分布の要約（設計書 §3.2）。 */
  lowerBound: HTMLElement;
  upperBound: HTMLElement;
}

function sliderRow(label: string): SliderFieldRow {
  const row = document.createElement('label');
  row.className = 'cooc-filter__field';
  const head = document.createElement('span');
  head.className = 'cooc-filter__head';
  const text = document.createElement('span');
  text.textContent = label;
  const value = document.createElement('span');
  value.className = 'cooc-filter__value';
  head.append(text, value);
  const input = document.createElement('input');
  input.type = 'range';
  const bounds = document.createElement('span');
  bounds.className = 'cooc-filter__bounds';
  const lowerBound = document.createElement('span');
  const upperBound = document.createElement('span');
  bounds.append(lowerBound, upperBound);
  row.append(head, input, bounds);
  return { row, input, label: text, value, lowerBound, upperBound };
}

/** 表示用の数値。刻みで生じた端数を落とし、整数は小数点を付けずに出す。 */
function formatSliderNumber(value: number): string {
  return String(roundSliderValue(value));
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
  const minStrength = sliderRow(t('filter.minStrength'));
  const topLinks = sliderRow(t('filter.topLinks'));
  let strengthRange: SliderRange = strengthSliderRange(state.file);
  let topLinkRange: SliderRange = topLinkSliderRange(state.file);
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

  /**
   * つまみの位置を絞り込みの入力へ写す。位置が絞り込みなしの端にあるときは条件を持たない状態
   * （空文字）へ落とす。端に戻せば元に戻ることを保つのが、既定値を絞り込みなしに置く
   * 設計書 §3.2 のスライダー版である。
   */
  function bindSlider(
    field: SliderFieldRow,
    key: 'minStrengthText' | 'topLinkCountText',
    range: () => SliderRange,
    edge: SliderNoFilterEdge,
  ): void {
    field.input.addEventListener('input', () => {
      inputState = { ...inputState, [key]: sliderTextFromPosition(Number(field.input.value), range(), edge) };
      renderSliderValue(field, key, range(), edge);
      emit();
    });
  }

  bindTextInput(minFrequency.input, 'minFrequencyText');
  bindSlider(minStrength, 'minStrengthText', () => strengthRange, 'min');
  bindSlider(topLinks, 'topLinkCountText', () => topLinkRange, 'max');

  function renderSliderValue(
    field: SliderFieldRow,
    key: 'minStrengthText' | 'topLinkCountText',
    range: SliderRange,
    edge: SliderNoFilterEdge,
  ): void {
    // 動かせる幅が無いとき（共起が無い・強度が 1 種類）は、動かせない値を現在値として出さない。
    if (!range.enabled) {
      field.value.textContent = edge === 'max' ? t('filter.noFilter') : '—';
      return;
    }
    // 絞り込みなしの端では数値でなく「全件」と出す。上位の共起で総数（例: 42）と出すと、共起が
    // 43 本に増えたときに、何もしていないのに絞り込みが始まったように見える。
    if (inputState[key] === '') {
      field.value.textContent = t('filter.noFilter');
      return;
    }
    field.value.textContent = formatSliderNumber(sliderPositionFromText(inputState[key], range, edge));
  }

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
   * まま線を引かないためで、`buildRenderGraph` が**スライスの添字**の隣接で結ぶことで満たす
   * （描画レイヤーの番号は落とした分を詰めるため、番号の隣接で判定すると跨いでしまう）。
   */
  function renderSlices(): void {
    const sliceSpecs = state.file.spec.timeline?.slices ?? [];
    const hidden = sliceSpecs.length === 0;
    slicesTitle.hidden = hidden;
    slices.hidden = hidden;
    slicesTitle.textContent = t('filter.slices');
    slices.replaceChildren();
    if (hidden) return;

    const selected = state.selectedSliceLabels;
    sliceSpecs.forEach((slice) => {
      const label = document.createElement('label');
      label.className = 'cooc-filter__check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected === undefined || selected.includes(slice.label);
      checkbox.addEventListener('change', () => {
        const current = new Set(selected ?? sliceSpecs.map((entry) => entry.label));
        if (checkbox.checked) {
          current.add(slice.label);
        } else {
          current.delete(slice.label);
        }
        // 並びは時間順（spec のスライスの順）で作り直す。集合の反復順に依存させない。
        options.onSelectedSliceLabelsChange(
          sliceSpecs.map((entry) => entry.label).filter((entry) => current.has(entry)),
        );
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

  function syncSlider(
    field: SliderFieldRow,
    key: 'minStrengthText' | 'topLinkCountText',
    range: SliderRange,
    edge: SliderNoFilterEdge,
  ): void {
    field.input.min = String(range.min);
    field.input.max = String(range.max);
    field.input.step = String(range.step);
    field.input.disabled = !range.enabled;
    if (document.activeElement !== field.input) {
      field.input.value = String(sliderPositionFromText(inputState[key], range, edge));
    }
    field.lowerBound.textContent = range.enabled ? formatSliderNumber(range.min) : '';
    field.upperBound.textContent = range.enabled ? formatSliderNumber(range.max) : '';
    renderSliderValue(field, key, range, edge);
  }

  function syncInputs(): void {
    if (document.activeElement !== minFrequency.input) minFrequency.input.value = inputState.minFrequencyText;
    strengthRange = strengthSliderRange(state.file);
    topLinkRange = topLinkSliderRange(state.file);
    syncSlider(minStrength, 'minStrengthText', strengthRange, 'min');
    syncSlider(topLinks, 'topLinkCountText', topLinkRange, 'max');
  }

  function render(): void {
    title.textContent = t('filter.title');
    minFrequency.label.textContent = t('filter.minFrequency');
    minStrength.label.textContent = t('filter.minStrength');
    topLinks.label.textContent = t('filter.topLinks');
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
        // スライダーの `value` はつまみ位置であって絞り込みの値ではない（端＝空文字）。操作中は
        // 位置ではなく、直前の `input` で書いた入力の側を残す。
        minStrengthText: active === minStrength.input ? inputState.minStrengthText : nextInputState.minStrengthText,
        topLinkCountText: active === topLinks.input ? inputState.topLinkCountText : nextInputState.topLinkCountText,
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
