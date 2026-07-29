import {
  addCooccurrenceNode,
  noteBearingIndexes,
  readCooccurrenceNote,
  removeCooccurrenceNodeNote,
  setCooccurrenceNodeNote,
  deleteCooccurrenceNode,
  renameCooccurrenceNode,
  setCooccurrenceNodeCluster,
  hasCooccurrenceTimeline,
  readCooccurrenceSliceValue,
  removeCooccurrenceNodeSliceValue,
  setCooccurrenceNodeFrequency,
  setCooccurrenceNodeSliceValue,
  type CooccurrenceEditResult,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { computeVisibleWindow } from './virtualList';
import { ensureButtonBaseStyles } from './buttonBaseStyle';
import { createNoteEditor, type NoteEditorHandle } from './noteEditor';
import { createSliceValueEditor, type SliceValueEditorHandle } from './sliceValueEditor';

export interface WordListPanelState {
  file: CooccurrenceFile;
  visibleNodeIndexes: ReadonlySet<number>;
  selectedNodeIndex: number | null;
  t: CooccurrenceT;
}

export interface WordListPanelOptions extends WordListPanelState {
  onSelectNode(nodeIndex: number | null): void;
  onFileChange(file: CooccurrenceFile): void;
}

export interface WordListPanelHandle {
  element: HTMLElement;
  update(state: WordListPanelState): void;
  /**
   * 行だけを作り直す。
   *
   * 隠れている間は viewport の clientHeight が 0 になり、可視ウィンドウが
   * `clientHeight || 120` のフォールバックで 120px 相当（数行）に固まる。表示へ戻しても
   * 状態は変わらないため update() は呼ばれず、列の高さに見合う行数まで増えない。
   * 表示へ戻す側が明示的に呼ぶ。
   */
  refresh(): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-word-list-panel-style';
const ROW_HEIGHT = 36;
const OVERSCAN = 4;

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-words{display:flex;flex-direction:column;flex:1 1 auto;padding:12px;gap:10px}
.cooc-words__search{flex:0 0 auto}
.cooc-words__search,.cooc-words__edit input,.cooc-words__edit select{box-sizing:border-box;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-words__viewport{position:relative;min-height:120px;flex:1 1 0;overflow:auto;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-bg)}
.cooc-words__spacer{position:relative;width:100%}
.cooc-words__items{position:absolute;inset:0 0 auto 0}
.cooc-words__row{height:36px;display:grid;grid-template-columns:minmax(0,1fr) 56px 64px 16px;gap:8px;align-items:center;padding:0 8px;border-bottom:1px solid var(--cooc-divider);color:var(--cooc-text);font:12px system-ui,sans-serif}
.cooc-words__row:hover{background:var(--cooc-action-hover)}
.cooc-words__row[aria-selected="true"]{background:var(--cooc-action-selected)}
.cooc-words__row[data-hidden-by-filter="true"] .cooc-words__label{color:var(--cooc-text-disabled)}
.cooc-words__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cooc-words__meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cooc-text-secondary);text-align:right}
.cooc-words__edit{flex:0 0 auto;display:grid;grid-template-columns:1fr 72px 88px;gap:6px}
.cooc-words__buttons{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap}
.cooc-words__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-words__button:hover{background:var(--cooc-action-hover)}
.cooc-words__note-mark{color:var(--cooc-text);text-align:center}
.cooc-words__error{flex:0 0 auto;min-height:16px;color:var(--cooc-accent);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

function clusterIndexFor(file: CooccurrenceFile, nodeIndex: number): number | undefined {
  return file.spec.clusters?.findIndex((cluster) => cluster.members.includes(nodeIndex));
}

function clusterLabelFor(file: CooccurrenceFile, nodeIndex: number): string {
  const index = clusterIndexFor(file, nodeIndex);
  return index === undefined || index < 0 ? '-' : (file.spec.clusters?.[index]?.label ?? '-');
}

function resultMessage(result: CooccurrenceEditResult): string {
  return result.ok ? '' : result.errors.map((error) => error.message).join('; ');
}

export function createWordListPanel(options: WordListPanelOptions): WordListPanelHandle {
  ensureStyles();
  let state: WordListPanelState = options;
  let t = state.t;
  let query = '';

  const element = document.createElement('section');
  element.className = 'cooc-words';

  const search = document.createElement('input');
  search.className = 'cooc-words__search';
  search.type = 'search';
  search.placeholder = t('words.search');
  search.setAttribute('aria-label', t('words.search'));

  const viewport = document.createElement('div');
  viewport.className = 'cooc-words__viewport';
  const spacer = document.createElement('div');
  spacer.className = 'cooc-words__spacer';
  const items = document.createElement('div');
  items.className = 'cooc-words__items';
  // role="option" の行は listbox の子である必要がある（行側だけでは a11y ツリーが成立しない）
  items.setAttribute('role', 'listbox');
  items.setAttribute('aria-label', t('words.listLabel'));
  spacer.appendChild(items);
  viewport.appendChild(spacer);

  const edit = document.createElement('div');
  edit.className = 'cooc-words__edit';
  const labelInput = document.createElement('input');
  labelInput.placeholder = t('words.word');
  const frequencyInput = document.createElement('input');
  frequencyInput.type = 'number';
  frequencyInput.placeholder = t('words.freq');
  const clusterSelect = document.createElement('select');
  edit.append(labelInput, frequencyInput, clusterSelect);

  const sliceValues: SliceValueEditorHandle = createSliceValueEditor({
    onSet(sliceIndex, value) {
      if (state.selectedNodeIndex === null) return;
      applyEdit(setCooccurrenceNodeSliceValue(state.file, { node: state.selectedNodeIndex, slice: sliceIndex }, value));
    },
    onRemove(sliceIndex) {
      if (state.selectedNodeIndex === null) return;
      applyEdit(removeCooccurrenceNodeSliceValue(state.file, { node: state.selectedNodeIndex, slice: sliceIndex }));
    },
  });

  const buttons = document.createElement('div');
  buttons.className = 'cooc-words__buttons';
  const addButton = document.createElement('button');
  addButton.className = 'cooc-btn cooc-words__button';
  addButton.type = 'button';
  addButton.textContent = t('words.add');
  const renameButton = document.createElement('button');
  renameButton.className = 'cooc-btn cooc-words__button';
  renameButton.type = 'button';
  renameButton.textContent = t('words.rename');
  const frequencyButton = document.createElement('button');
  frequencyButton.className = 'cooc-btn cooc-words__button';
  frequencyButton.type = 'button';
  frequencyButton.textContent = t('words.setFreq');
  const clusterButton = document.createElement('button');
  clusterButton.className = 'cooc-btn cooc-words__button';
  clusterButton.type = 'button';
  clusterButton.textContent = t('words.setCluster');
  const deleteButton = document.createElement('button');
  deleteButton.className = 'cooc-btn cooc-words__button';
  deleteButton.type = 'button';
  deleteButton.textContent = t('words.delete');
  buttons.append(addButton, renameButton, frequencyButton, clusterButton, deleteButton);

  const error = document.createElement('div');
  error.className = 'cooc-words__error';

  const noteEditor: NoteEditorHandle = createNoteEditor({
    t,
    onSet(text) {
      if (state.selectedNodeIndex === null) return;
      applyEdit(setCooccurrenceNodeNote(state.file, state.selectedNodeIndex, text));
    },
    onRemove() {
      if (state.selectedNodeIndex === null) return;
      applyEdit(removeCooccurrenceNodeNote(state.file, state.selectedNodeIndex));
    },
  });

  element.append(search, viewport, edit, sliceValues.element, buttons, noteEditor.element, error);

  // 一覧は編集面であるため、絞り込みで図から消えた語も残す。
  // Why not 図と同じ絞り込みを掛けるか: 低頻度語を絞り込んでから消す、という
  // 主要な編集手順（設計書 §3.2・§3.3）が塞がれるため。図に出ていない語は淡く示す。
  function listedIndexes(): number[] {
    const normalized = query.trim().toLocaleLowerCase();
    return state.file.spec.nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.label.toLocaleLowerCase().includes(normalized))
      .map(({ index }) => index);
  }

  function renderClusterOptions(): void {
    const previous = clusterSelect.value;
    clusterSelect.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = t('words.noCluster');
    clusterSelect.appendChild(none);
    state.file.spec.clusters?.forEach((cluster, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = cluster.label;
      clusterSelect.appendChild(option);
    });
    clusterSelect.value = previous;
  }

  function renderRows(): void {
    const noted = noteBearingIndexes(state.file.spec, 'nodes');
    const indexes = listedIndexes();
    const viewportHeight = viewport.clientHeight || 120;
    const slice = computeVisibleWindow(indexes.length, ROW_HEIGHT, viewport.scrollTop, viewportHeight, OVERSCAN);
    spacer.style.height = `${slice.totalHeight}px`;
    items.style.transform = `translateY(${slice.offsetY}px)`;
    items.replaceChildren();
    indexes.slice(slice.startIndex, slice.endIndex).forEach((nodeIndex) => {
      const node = state.file.spec.nodes[nodeIndex];
      if (!node) return;
      const row = document.createElement('button');
      row.className = 'cooc-btn cooc-btn--block cooc-words__row';
      row.type = 'button';
      row.dataset.nodeIndex = String(nodeIndex);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(state.selectedNodeIndex === nodeIndex));
      // 仮想スクロールでは DOM 上の子要素数＝可視ウィンドウ分しかないため、明示しないと
      // 支援技術が「12 件中 1 件」のように総数を誤って読み上げる。
      row.setAttribute('aria-setsize', String(indexes.length));
      row.setAttribute('aria-posinset', String(indexes.indexOf(nodeIndex) + 1));
      const hiddenByFilter = !state.visibleNodeIndexes.has(nodeIndex);
      row.dataset.hiddenByFilter = String(hiddenByFilter);
      if (hiddenByFilter) row.title = t('words.hiddenByFilter');
      const label = document.createElement('span');
      label.className = 'cooc-words__label';
      label.textContent = node.label;
      const frequency = document.createElement('span');
      frequency.className = 'cooc-words__meta';
      frequency.textContent = String(node.frequency);
      const cluster = document.createElement('span');
      cluster.className = 'cooc-words__meta';
      cluster.textContent = clusterLabelFor(state.file, nodeIndex);
      // 列幅に収まらないクラスタ名は省略表示になるため、全体はホバーで読めるようにする。
      cluster.title = cluster.textContent;
      const noteMark = document.createElement('span');
      noteMark.className = 'cooc-words__note-mark';
      // 記号で示す。色はクラスタの符号であり、印に色を与えると所属が誤って読める（設計書 §3.1）。
      noteMark.textContent = noted.has(nodeIndex) ? '＊' : '';
      if (noted.has(nodeIndex)) noteMark.title = t('note.marker');
      row.append(label, frequency, cluster, noteMark);
      row.addEventListener('click', () => options.onSelectNode(state.selectedNodeIndex === nodeIndex ? null : nodeIndex));
      items.appendChild(row);
    });
  }

  function syncSelectedInputs(): void {
    const selected = state.selectedNodeIndex === null ? undefined : state.file.spec.nodes[state.selectedNodeIndex];
    if (selected && document.activeElement !== labelInput) labelInput.value = selected.label;
    if (selected && document.activeElement !== frequencyInput) frequencyInput.value = String(selected.frequency);
    // 時間軸を持つ図では全体値は合計から導出され、直接は編集できない（設計書 §2.2）。
    // 押しても必ず拒否されるボタンを操作できるままにしない。
    const layered = hasCooccurrenceTimeline(state.file.spec);
    frequencyInput.disabled = layered;
    frequencyButton.disabled = layered;
    const slices = state.file.spec.timeline?.slices ?? [];
    sliceValues.update(
      slices,
      slices.map((_slice, sliceIndex) =>
        state.selectedNodeIndex === null
          ? undefined
          : readCooccurrenceSliceValue(state.file.spec, {
              target: 'nodes',
              slice: sliceIndex,
              index: state.selectedNodeIndex,
            }),
      ),
    );
    if (state.selectedNodeIndex !== null) {
      const clusterIndex = clusterIndexFor(state.file, state.selectedNodeIndex);
      clusterSelect.value = clusterIndex === undefined || clusterIndex < 0 ? '' : String(clusterIndex);
    }
  }

  function render(): void {
    search.placeholder = t('words.search');
    search.setAttribute('aria-label', t('words.search'));
    items.setAttribute('aria-label', t('words.listLabel'));
    labelInput.placeholder = t('words.word');
    frequencyInput.placeholder = t('words.freq');
    addButton.textContent = t('words.add');
    renameButton.textContent = t('words.rename');
    frequencyButton.textContent = t('words.setFreq');
    clusterButton.textContent = t('words.setCluster');
    deleteButton.textContent = t('words.delete');
    renderClusterOptions();
    sliceValues.setTitle(t('words.sliceValues'));
    syncSelectedInputs();
    noteEditor.setT(t);
    noteEditor.setValue(
      state.selectedNodeIndex === null
        ? undefined
        : readCooccurrenceNote(state.file.spec, 'nodes', state.selectedNodeIndex),
    );
    // renderRows() は全行を作り直すため、いま押した行の要素自体が破棄される。
    // 何もしないとフォーカスが body へ戻り、キーボードだけで操作すると選択のたびに
    // リスト先頭へ巻き戻されて実質操作できない。
    const activeNodeIndex =
      document.activeElement instanceof HTMLElement && element.contains(document.activeElement)
        ? document.activeElement.dataset.nodeIndex
        : undefined;
    renderRows();
    if (activeNodeIndex === undefined) return;
    items.querySelector<HTMLElement>(`[data-node-index="${activeNodeIndex}"]`)?.focus();
  }

  function applyEdit(result: CooccurrenceEditResult): void {
    const message = resultMessage(result);
    error.textContent = message;
    if (result.ok) options.onFileChange(result.file);
  }

  search.addEventListener('input', () => {
    query = search.value;
    viewport.scrollTop = 0;
    renderRows();
  });
  viewport.addEventListener('scroll', renderRows);
  addButton.addEventListener('click', () => {
    if (hasCooccurrenceTimeline(state.file.spec)) {
      // 時間軸を持つ図では全体値ではなくスライス別の値を渡す（設計書 §2.2）。
      applyEdit(addCooccurrenceNode(state.file, { label: labelInput.value, sliceValues: sliceValues.readValues() }));
      return;
    }
    const frequency = Number(frequencyInput.value);
    applyEdit(addCooccurrenceNode(state.file, { label: labelInput.value, frequency: Number.isFinite(frequency) ? frequency : 1 }));
  });
  renameButton.addEventListener('click', () => {
    if (state.selectedNodeIndex === null) return;
    applyEdit(renameCooccurrenceNode(state.file, state.selectedNodeIndex, labelInput.value));
  });
  frequencyButton.addEventListener('click', () => {
    if (state.selectedNodeIndex === null) return;
    applyEdit(setCooccurrenceNodeFrequency(state.file, state.selectedNodeIndex, Number(frequencyInput.value)));
  });
  clusterButton.addEventListener('click', () => {
    if (state.selectedNodeIndex === null) return;
    const clusterIndex = clusterSelect.value === '' ? undefined : Number(clusterSelect.value);
    applyEdit(setCooccurrenceNodeCluster(state.file, state.selectedNodeIndex, clusterIndex));
  });
  deleteButton.addEventListener('click', () => {
    if (state.selectedNodeIndex === null) return;
    applyEdit(deleteCooccurrenceNode(state.file, state.selectedNodeIndex));
  });

  render();

  return {
    element,
    update(nextState: WordListPanelState): void {
      state = nextState;
      t = state.t;
      render();
    },
    refresh(): void {
      renderRows();
    },
    destroy(): void {
      element.remove();
    },
  };
}
