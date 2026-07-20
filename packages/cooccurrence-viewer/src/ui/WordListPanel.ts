import {
  addCooccurrenceNode,
  deleteCooccurrenceNode,
  renameCooccurrenceNode,
  setCooccurrenceNodeCluster,
  setCooccurrenceNodeFrequency,
  type CooccurrenceEditResult,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { computeVisibleWindow } from './virtualList';

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
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-word-list-panel-style';
const ROW_HEIGHT = 36;
const OVERSCAN = 4;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-words{display:flex;flex-direction:column;min-height:0;flex:1;padding:12px;gap:10px}
.cooc-words__search,.cooc-words__edit input,.cooc-words__edit select{box-sizing:border-box;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-words__viewport{position:relative;min-height:120px;flex:1;overflow:auto;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-bg)}
.cooc-words__spacer{position:relative;width:100%}
.cooc-words__items{position:absolute;inset:0 0 auto 0}
.cooc-words__row{box-sizing:border-box;height:36px;display:grid;grid-template-columns:minmax(0,1fr) 56px 64px;gap:8px;align-items:center;padding:0 8px;border-bottom:1px solid var(--cooc-divider);color:var(--cooc-text);font:12px system-ui,sans-serif;cursor:pointer}
.cooc-words__row:hover{background:var(--cooc-action-hover)}
.cooc-words__row[aria-selected="true"]{background:var(--cooc-action-selected)}
.cooc-words__row[data-hidden-by-filter="true"] .cooc-words__label{color:var(--cooc-text-disabled)}
.cooc-words__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cooc-words__meta{color:var(--cooc-text-secondary);text-align:right}
.cooc-words__edit{display:grid;grid-template-columns:1fr 72px 88px;gap:6px}
.cooc-words__buttons{display:flex;gap:6px;flex-wrap:wrap}
.cooc-words__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-words__button:hover{background:var(--cooc-action-hover)}
.cooc-words__error{min-height:16px;color:var(--cooc-accent);font:12px system-ui,sans-serif}
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

  const buttons = document.createElement('div');
  buttons.className = 'cooc-words__buttons';
  const addButton = document.createElement('button');
  addButton.className = 'cooc-words__button';
  addButton.type = 'button';
  addButton.textContent = t('words.add');
  const renameButton = document.createElement('button');
  renameButton.className = 'cooc-words__button';
  renameButton.type = 'button';
  renameButton.textContent = t('words.rename');
  const frequencyButton = document.createElement('button');
  frequencyButton.className = 'cooc-words__button';
  frequencyButton.type = 'button';
  frequencyButton.textContent = t('words.setFreq');
  const clusterButton = document.createElement('button');
  clusterButton.className = 'cooc-words__button';
  clusterButton.type = 'button';
  clusterButton.textContent = t('words.setCluster');
  const deleteButton = document.createElement('button');
  deleteButton.className = 'cooc-words__button';
  deleteButton.type = 'button';
  deleteButton.textContent = t('words.delete');
  buttons.append(addButton, renameButton, frequencyButton, clusterButton, deleteButton);

  const error = document.createElement('div');
  error.className = 'cooc-words__error';
  element.append(search, viewport, edit, buttons, error);

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
      row.className = 'cooc-words__row';
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
      row.append(label, frequency, cluster);
      row.addEventListener('click', () => options.onSelectNode(state.selectedNodeIndex === nodeIndex ? null : nodeIndex));
      items.appendChild(row);
    });
  }

  function syncSelectedInputs(): void {
    const selected = state.selectedNodeIndex === null ? undefined : state.file.spec.nodes[state.selectedNodeIndex];
    if (selected && document.activeElement !== labelInput) labelInput.value = selected.label;
    if (selected && document.activeElement !== frequencyInput) frequencyInput.value = String(selected.frequency);
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
    syncSelectedInputs();
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
    destroy(): void {
      element.remove();
    },
  };
}
