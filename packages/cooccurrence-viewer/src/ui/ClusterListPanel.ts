import {
  noteBearingIndexes,
  readCooccurrenceNote,
  removeCooccurrenceClusterNote,
  setCooccurrenceClusterNote,
  type CooccurrenceEditResult,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { clusterColorVarName } from '../theme/readTheme';
import { createPanelButton, ensureButtonBaseStyles } from './buttonBaseStyle';
import { createNoteEditor, type NoteEditorHandle } from './noteEditor';

/**
 * クラスタのタブ（設計書 §3.5）。
 *
 * クラスタは図の中に自分の図形を持たず（色でしか表現されない）、ホバーの発火点がここにしか
 * 無い。編集できるのはメモだけである。クラスタ名の変更やメンバーの付け替えは現状どの経路でも
 * 提供しておらず、メモのために編集の範囲を広げると、この変更の検証範囲がクラスタ編集の一式まで
 * 広がる。
 */
export interface ClusterListPanelState {
  file: CooccurrenceFile;
  selectedClusterIndex: number | null;
  t: CooccurrenceT;
}

export interface ClusterListPanelOptions extends ClusterListPanelState {
  onSelectCluster(clusterIndex: number | null): void;
  onFileChange(file: CooccurrenceFile): void;
  /** 行のホバー。ポップアップの発火点（設計書 §3.1）。外れたときは null を渡す。 */
  onHoverCluster(clusterIndex: number | null, anchor: { x: number; y: number } | null): void;
}

export interface ClusterListPanelHandle {
  element: HTMLElement;
  update(state: ClusterListPanelState): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-cluster-list-panel-style';

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-clusters{display:flex;flex-direction:column;flex:1 1 auto;padding:12px;gap:10px}
.cooc-clusters__viewport{min-height:120px;flex:1 1 0;overflow:auto;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-bg)}
.cooc-clusters__row{width:100%;display:grid;grid-template-columns:14px minmax(0,1fr) 56px 16px;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--cooc-divider);color:var(--cooc-text);font:12px system-ui,sans-serif}
.cooc-clusters__row:hover{background:var(--cooc-action-hover)}
.cooc-clusters__row[aria-selected="true"]{background:var(--cooc-action-selected)}
.cooc-clusters__swatch{width:12px;height:12px;border-radius:3px}
.cooc-clusters__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cooc-clusters__meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cooc-text-secondary);text-align:right}
.cooc-clusters__note-mark{color:var(--cooc-text);text-align:center}
.cooc-clusters__empty{padding:12px;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif}
.cooc-clusters__error{flex:0 0 auto;min-height:16px;color:var(--cooc-accent);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

function resultMessage(result: CooccurrenceEditResult): string {
  return result.ok ? '' : result.errors.map((error) => error.message).join('; ');
}

export function createClusterListPanel(options: ClusterListPanelOptions): ClusterListPanelHandle {
  ensureStyles();
  let state: ClusterListPanelState = options;
  let t = state.t;

  const element = document.createElement('section');
  element.className = 'cooc-clusters';

  const viewport = document.createElement('div');
  viewport.className = 'cooc-clusters__viewport';
  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('clusters.listLabel'));
  viewport.appendChild(list);

  const error = document.createElement('div');
  error.className = 'cooc-clusters__error';

  const noteEditor: NoteEditorHandle = createNoteEditor({
    t,
    onSet(text) {
      if (state.selectedClusterIndex === null) return;
      applyEdit(setCooccurrenceClusterNote(state.file, state.selectedClusterIndex, text));
    },
    onRemove() {
      if (state.selectedClusterIndex === null) return;
      applyEdit(removeCooccurrenceClusterNote(state.file, state.selectedClusterIndex));
    },
  });

  element.append(viewport, noteEditor.element, error);

  function applyEdit(result: CooccurrenceEditResult): void {
    error.textContent = resultMessage(result);
    if (result.ok) options.onFileChange(result.file);
  }

  function anchorOf(row: HTMLElement): { x: number; y: number } {
    // 行の左端ではなく中央から出す。行は幅いっぱいに伸びるため、左端に固定すると
    // ポインタから遠い位置に出て、どの行のメモなのかが読み取りにくい。
    const rect = row.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.bottom };
  }

  function renderRows(): void {
    const clusters = state.file.spec.clusters ?? [];
    list.replaceChildren();
    if (clusters.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cooc-clusters__empty';
      empty.textContent = t('clusters.empty');
      list.appendChild(empty);
      return;
    }
    const noted = noteBearingIndexes(state.file.spec, 'clusters');
    clusters.forEach((cluster, index) => {
      const row = createPanelButton('cooc-btn--block cooc-clusters__row');
      row.dataset.clusterIndex = String(index);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(state.selectedClusterIndex === index));

      const swatch = document.createElement('span');
      swatch.className = 'cooc-clusters__swatch';
      swatch.style.background = `var(${clusterColorVarName(index)})`;
      const label = document.createElement('span');
      label.className = 'cooc-clusters__label';
      label.textContent = cluster.label;
      const members = document.createElement('span');
      members.className = 'cooc-clusters__meta';
      members.textContent = String(cluster.members.length);
      const mark = document.createElement('span');
      mark.className = 'cooc-clusters__note-mark';
      // 色ではなく記号で示す。色はクラスタそのものの符号として同じ行の中で使われている。
      mark.textContent = noted.has(index) ? '＊' : '';
      if (noted.has(index)) mark.title = t('note.marker');

      row.append(swatch, label, members, mark);
      row.addEventListener('click', () =>
        options.onSelectCluster(state.selectedClusterIndex === index ? null : index),
      );
      row.addEventListener('pointerenter', () => options.onHoverCluster(index, anchorOf(row)));
      row.addEventListener('pointerleave', () => options.onHoverCluster(null, null));
      list.appendChild(row);
    });
  }

  function render(): void {
    list.setAttribute('aria-label', t('clusters.listLabel'));
    noteEditor.setT(t);
    noteEditor.setValue(
      state.selectedClusterIndex === null
        ? undefined
        : readCooccurrenceNote(state.file.spec, 'clusters', state.selectedClusterIndex),
    );
    renderRows();
  }

  render();

  return {
    element,
    update(nextState): void {
      state = nextState;
      t = state.t;
      render();
    },
    destroy(): void {
      element.remove();
    },
  };
}
