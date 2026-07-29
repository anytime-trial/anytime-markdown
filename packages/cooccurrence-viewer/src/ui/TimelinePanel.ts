import {
  addCooccurrenceSlice,
  deleteCooccurrenceSlice,
  moveCooccurrenceSlice,
  renameCooccurrenceSlice,
  type CooccurrenceEditResult,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import type { TimelineViewState } from '../types';
import { ensureButtonBaseStyles } from './buttonBaseStyle';
import { isLayerAxis } from './timelineModel';

/**
 * 時間のタブ（設計書 §3.5・§3.6）。
 *
 * ここが持つのはスライスそのもの（枚数・ラベル・日付・順序）と、レイヤーの見せ方（表示の有無・
 * 向き・余白・点線）である。**ある語がどのスライスにどの頻度で存在するかは置かない**。それは
 * 語の属性であり「語」タブの編集フォームが持つ。ここへ集めると、どの語を編集しているのかが
 * 時間タブと語タブの選択状態の組で決まる（メモを専用タブにしなかったのと同じ理由）。
 *
 * 「表示するスライス」も置かない。どのレイヤーを描くかは絞り込みの面であり、絞り込みタブが持つ。
 */
export interface TimelinePanelState {
  file: CooccurrenceFile;
  view: TimelineViewState;
  t: CooccurrenceT;
}

export interface TimelinePanelOptions extends TimelinePanelState {
  onFileChange(file: CooccurrenceFile): void;
  onViewChange(view: TimelineViewState): void;
}

export interface TimelinePanelHandle {
  element: HTMLElement;
  update(state: TimelinePanelState): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-timeline-panel-style';

/** レイヤー間の余白の入力範囲（世界座標）。0 にすると隣のレイヤーの円が接して区切りが読めない。 */
const GAP_MIN = 40;
const GAP_MAX = 800;
const GAP_STEP = 20;

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-timeline{display:flex;flex-direction:column;flex:1 1 auto;padding:12px;gap:10px}
.cooc-timeline__group{display:flex;flex-direction:column;gap:6px}
.cooc-timeline__title{font:600 12px system-ui,sans-serif;color:var(--cooc-text)}
.cooc-timeline__row{display:flex;align-items:center;gap:6px;font:12px system-ui,sans-serif;color:var(--cooc-text)}
.cooc-timeline__row label{display:flex;align-items:center;gap:6px}
.cooc-timeline__field{flex:1 1 auto;min-width:0;padding:4px 6px;border:1px solid var(--cooc-divider);border-radius:4px;background:var(--cooc-bg);color:var(--cooc-text);font:12px system-ui,sans-serif}
.cooc-timeline__viewport{min-height:120px;flex:1 1 0;overflow:auto;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-bg)}
.cooc-timeline__slice{display:grid;grid-template-columns:minmax(0,1fr) 96px auto;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--cooc-divider)}
.cooc-timeline__actions{display:flex;gap:2px}
.cooc-timeline__actions button{width:26px;height:26px;border-radius:4px;color:var(--cooc-text)}
.cooc-timeline__actions button:hover:not(:disabled){background:var(--cooc-action-hover)}
.cooc-timeline__actions button:disabled{opacity:.4}
.cooc-timeline__add{display:grid;grid-template-columns:minmax(0,1fr) 96px auto;gap:6px;align-items:center}
.cooc-timeline__add button{padding:4px 10px;border:1px solid var(--cooc-divider);border-radius:4px;color:var(--cooc-text)}
.cooc-timeline__add button:hover{background:var(--cooc-action-hover)}
.cooc-timeline__empty{padding:12px;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif}
.cooc-timeline__error{flex:0 0 auto;min-height:16px;color:var(--cooc-accent);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

function labelledCheckbox(text: string): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  wrapper.append(input, document.createTextNode(text));
  return { wrapper, input };
}

export function createTimelinePanel(options: TimelinePanelOptions): TimelinePanelHandle {
  ensureStyles();
  let state: TimelinePanelState = { file: options.file, view: options.view, t: options.t };

  const element = document.createElement('div');
  element.className = 'cooc-timeline';

  const title = document.createElement('div');
  title.className = 'cooc-timeline__title';

  const displayGroup = document.createElement('div');
  displayGroup.className = 'cooc-timeline__group';

  const layeredRow = document.createElement('div');
  layeredRow.className = 'cooc-timeline__row';
  const layered = labelledCheckbox('');
  layeredRow.appendChild(layered.wrapper);

  const axisRow = document.createElement('div');
  axisRow.className = 'cooc-timeline__row';
  const axisLabel = document.createElement('label');
  const axisLabelText = document.createTextNode('');
  axisLabel.appendChild(axisLabelText);
  const axisSelect = document.createElement('select');
  axisSelect.className = 'cooc-timeline__field';
  const axisHorizontal = document.createElement('option');
  axisHorizontal.value = 'horizontal';
  const axisVertical = document.createElement('option');
  axisVertical.value = 'vertical';
  axisSelect.append(axisHorizontal, axisVertical);
  axisLabel.appendChild(axisSelect);
  axisRow.appendChild(axisLabel);

  const gapRow = document.createElement('div');
  gapRow.className = 'cooc-timeline__row';
  const gapLabel = document.createElement('label');
  const gapLabelText = document.createTextNode('');
  gapLabel.appendChild(gapLabelText);
  const gapInput = document.createElement('input');
  gapInput.type = 'number';
  gapInput.className = 'cooc-timeline__field';
  gapInput.min = String(GAP_MIN);
  gapInput.max = String(GAP_MAX);
  gapInput.step = String(GAP_STEP);
  gapLabel.appendChild(gapInput);
  gapRow.appendChild(gapLabel);

  const timeLinksRow = document.createElement('div');
  timeLinksRow.className = 'cooc-timeline__row';
  const timeLinks = labelledCheckbox('');
  timeLinksRow.appendChild(timeLinks.wrapper);

  displayGroup.append(layeredRow, axisRow, gapRow, timeLinksRow);

  const listTitle = document.createElement('div');
  listTitle.className = 'cooc-timeline__title';

  const viewport = document.createElement('div');
  viewport.className = 'cooc-timeline__viewport';

  const addRow = document.createElement('div');
  addRow.className = 'cooc-timeline__add';
  const addLabel = document.createElement('input');
  addLabel.type = 'text';
  addLabel.className = 'cooc-timeline__field';
  const addAt = document.createElement('input');
  addAt.type = 'text';
  addAt.className = 'cooc-timeline__field';
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addRow.append(addLabel, addAt, addButton);

  const errorEl = document.createElement('div');
  errorEl.className = 'cooc-timeline__error';
  errorEl.setAttribute('role', 'status');

  element.append(title, displayGroup, listTitle, viewport, addRow, errorEl);

  function showResult(result: CooccurrenceEditResult): void {
    if (result.ok) {
      errorEl.textContent = '';
      options.onFileChange(result.file);
      return;
    }
    // 失敗したら結果を捨てて理由だけを出す。部分的に書き込んだ状態を残さない（設計書 §2.6）。
    errorEl.textContent = result.errors.map((error) => error.message).join(' / ');
  }

  function patchView(partial: Partial<TimelineViewState>): void {
    options.onViewChange({ ...state.view, ...partial });
  }

  layered.input.addEventListener('change', () => {
    patchView({ layered: layered.input.checked });
  });
  timeLinks.input.addEventListener('change', () => {
    patchView({ showTimeLinks: timeLinks.input.checked });
  });
  axisSelect.addEventListener('change', () => {
    const value: unknown = axisSelect.value;
    if (isLayerAxis(value)) patchView({ axis: value });
  });
  gapInput.addEventListener('change', () => {
    const value = Number(gapInput.value);
    if (!Number.isFinite(value)) return;
    patchView({ gap: Math.min(GAP_MAX, Math.max(GAP_MIN, value)) });
  });

  addButton.addEventListener('click', () => {
    const label = addLabel.value.trim();
    const at = addAt.value.trim();
    showResult(addCooccurrenceSlice(state.file, at === '' ? { label } : { label, at }));
    addLabel.value = '';
    addAt.value = '';
  });

  function renderSlices(): void {
    const { file, t } = state;
    const slices = file.spec.timeline?.slices ?? [];
    viewport.replaceChildren();
    if (slices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cooc-timeline__empty';
      empty.textContent = t('timeline.empty');
      viewport.appendChild(empty);
      return;
    }

    slices.forEach((slice, index) => {
      const row = document.createElement('div');
      row.className = 'cooc-timeline__slice';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'cooc-timeline__field';
      labelInput.value = slice.label;
      labelInput.setAttribute('aria-label', t('timeline.sliceLabel'));

      const atInput = document.createElement('input');
      atInput.type = 'text';
      atInput.className = 'cooc-timeline__field';
      atInput.value = slice.at ?? '';
      atInput.setAttribute('aria-label', t('timeline.sliceDate'));

      function commit(): void {
        const label = labelInput.value.trim();
        const at = atInput.value.trim();
        showResult(renameCooccurrenceSlice(state.file, index, at === '' ? { label } : { label, at }));
      }
      labelInput.addEventListener('change', commit);
      atInput.addEventListener('change', commit);

      const actions = document.createElement('div');
      actions.className = 'cooc-timeline__actions';
      const up = document.createElement('button');
      up.type = 'button';
      up.textContent = '↑';
      up.disabled = index === 0;
      up.setAttribute('aria-label', t('timeline.moveEarlier'));
      up.addEventListener('click', () => showResult(moveCooccurrenceSlice(state.file, index, index - 1)));
      const down = document.createElement('button');
      down.type = 'button';
      down.textContent = '↓';
      down.disabled = index === slices.length - 1;
      down.setAttribute('aria-label', t('timeline.moveLater'));
      down.addEventListener('click', () => showResult(moveCooccurrenceSlice(state.file, index, index + 1)));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', t('timeline.removeSlice'));
      remove.addEventListener('click', () => showResult(deleteCooccurrenceSlice(state.file, index)));
      actions.append(up, down, remove);

      row.append(labelInput, atInput, actions);
      viewport.appendChild(row);
    });
  }

  function render(): void {
    const { t, view, file } = state;
    const hasSlices = (file.spec.timeline?.slices.length ?? 0) > 0;
    title.textContent = t('timeline.displayTitle');
    listTitle.textContent = t('timeline.slicesTitle');

    layered.wrapper.lastChild!.textContent = t('timeline.layered');
    layered.input.checked = view.layered;
    // スライスが無い図では、レイヤー表示という状態そのものが存在しない。
    layered.input.disabled = !hasSlices;

    axisLabelText.textContent = t('timeline.axis');
    axisHorizontal.textContent = t('timeline.axisHorizontal');
    axisVertical.textContent = t('timeline.axisVertical');
    axisSelect.value = view.axis;
    axisSelect.disabled = !hasSlices || !view.layered;

    gapLabelText.textContent = t('timeline.gap');
    gapInput.value = String(view.gap);
    gapInput.disabled = !hasSlices || !view.layered;

    timeLinks.wrapper.lastChild!.textContent = t('timeline.showTimeLinks');
    timeLinks.input.checked = view.showTimeLinks;
    timeLinks.input.disabled = !hasSlices || !view.layered;

    addLabel.placeholder = t('timeline.sliceLabel');
    addLabel.setAttribute('aria-label', t('timeline.sliceLabel'));
    addAt.placeholder = t('timeline.sliceDate');
    addAt.setAttribute('aria-label', t('timeline.sliceDate'));
    addButton.textContent = t('timeline.addSlice');

    renderSlices();
  }

  render();

  return {
    element,
    update(next: TimelinePanelState): void {
      state = next;
      render();
    },
    destroy(): void {
      element.remove();
    },
  };
}
