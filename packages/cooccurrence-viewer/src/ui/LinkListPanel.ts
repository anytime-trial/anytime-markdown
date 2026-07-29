import {
  LINK_DIRECTION,
  addCooccurrenceLink,
  deleteCooccurrenceLink,
  noteBearingIndexes,
  readCooccurrenceNote,
  readLink,
  removeCooccurrenceLinkNote,
  setCooccurrenceLinkNote,
  setCooccurrenceLinkDirection,
  hasCooccurrenceTimeline,
  readCooccurrenceSliceValue,
  removeCooccurrenceLinkSliceValue,
  setCooccurrenceLinkSliceValue,
  setCooccurrenceLinkStrength,
  type CooccurrenceEditResult,
  type CooccurrenceFile,
  type LinkDirection,
} from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { directionSymbol, filterLinkRows } from './linkListModel';
import { computeVisibleWindow } from './virtualList';
import { ensureButtonBaseStyles } from './buttonBaseStyle';
import { createNoteEditor, type NoteEditorHandle } from './noteEditor';
import { createSliceValueEditor, type SliceValueEditorHandle } from './sliceValueEditor';

export interface LinkListPanelState {
  file: CooccurrenceFile;
  visibleLinkIndexes: ReadonlySet<number>;
  /** 図で選択中の語。この語を端点に持つ共起を一覧で強調する（設計書 §3.5）。 */
  selectedNodeIndex: number | null;
  t: CooccurrenceT;
}

export interface LinkListPanelOptions extends LinkListPanelState {
  onFileChange(file: CooccurrenceFile): void;
}

export interface LinkListPanelHandle {
  element: HTMLElement;
  update(state: LinkListPanelState): void;
  /** 隠れている間は viewport の高さが 0 になり可視ウィンドウが固まるため、表示へ戻す側が呼ぶ。 */
  refresh(): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-link-list-panel-style';
const ROW_HEIGHT = 36;
const OVERSCAN = 4;

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-links{display:flex;flex-direction:column;flex:1 1 auto;padding:12px;gap:10px}
.cooc-links__search{flex:0 0 auto}
.cooc-links__search,.cooc-links__edit input,.cooc-links__edit select{box-sizing:border-box;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-links__viewport{position:relative;min-height:120px;flex:1 1 0;overflow:auto;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-bg)}
.cooc-links__spacer{position:relative;width:100%}
.cooc-links__items{position:absolute;inset:0 0 auto 0}
.cooc-links__row{height:36px;display:grid;grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr) 44px 16px;gap:6px;align-items:center;padding:0 8px;border-bottom:1px solid var(--cooc-divider);color:var(--cooc-text);font:12px system-ui,sans-serif}
.cooc-links__row:hover{background:var(--cooc-action-hover)}
.cooc-links__row[aria-selected="true"]{background:var(--cooc-action-selected)}
.cooc-links__row[data-related="true"] .cooc-links__label{color:var(--cooc-primary)}
.cooc-links__row[data-hidden-by-filter="true"] .cooc-links__label{color:var(--cooc-text-disabled)}
.cooc-links__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cooc-links__arrow{text-align:center;color:var(--cooc-text-secondary)}
.cooc-links__meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cooc-text-secondary);text-align:right}
.cooc-links__edit{flex:0 0 auto;display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cooc-links__buttons{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap}
.cooc-links__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-links__button:hover{background:var(--cooc-action-hover)}
.cooc-links__note-mark{color:var(--cooc-text);text-align:center}
.cooc-links__error{flex:0 0 auto;min-height:16px;color:var(--cooc-accent);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

function resultMessage(result: CooccurrenceEditResult): string {
  return result.ok ? '' : result.errors.map((error) => error.message).join('; ');
}

function isLinkDirection(value: number): value is LinkDirection {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function createLinkListPanel(options: LinkListPanelOptions): LinkListPanelHandle {
  ensureStyles();
  let state: LinkListPanelState = options;
  let t = state.t;
  let query = '';
  /**
   * 編集対象の共起。
   *
   * Why not mount 側で持つか: 図に共起の選択を表す表現が無く（図の選択は語だけ）、持ち上げても
   * 同期先が無い。`.cooc.json` へも書かない表示状態である（設計書 §3.5）。
   */
  let selectedLinkIndex: number | null = null;

  const element = document.createElement('section');
  element.className = 'cooc-links';

  const search = document.createElement('input');
  search.className = 'cooc-links__search';
  search.type = 'search';

  const viewport = document.createElement('div');
  viewport.className = 'cooc-links__viewport';
  const spacer = document.createElement('div');
  spacer.className = 'cooc-links__spacer';
  const items = document.createElement('div');
  items.className = 'cooc-links__items';
  items.setAttribute('role', 'listbox');
  spacer.appendChild(items);
  viewport.appendChild(spacer);

  const edit = document.createElement('div');
  edit.className = 'cooc-links__edit';
  const sourceSelect = document.createElement('select');
  sourceSelect.dataset.field = 'source';
  const targetSelect = document.createElement('select');
  targetSelect.dataset.field = 'target';
  const strengthInput = document.createElement('input');
  strengthInput.type = 'number';
  strengthInput.dataset.field = 'strength';
  const directionSelect = document.createElement('select');
  directionSelect.dataset.field = 'direction';
  edit.append(sourceSelect, targetSelect, strengthInput, directionSelect);

  const sliceValues: SliceValueEditorHandle = createSliceValueEditor({
    onSet(sliceIndex, value) {
      if (selectedLinkIndex === null) return;
      applyEdit(setCooccurrenceLinkSliceValue(state.file, { link: selectedLinkIndex, slice: sliceIndex }, value));
    },
    onRemove(sliceIndex) {
      if (selectedLinkIndex === null) return;
      applyEdit(removeCooccurrenceLinkSliceValue(state.file, { link: selectedLinkIndex, slice: sliceIndex }));
    },
  });

  const buttons = document.createElement('div');
  buttons.className = 'cooc-links__buttons';
  const addButton = document.createElement('button');
  addButton.className = 'cooc-btn cooc-links__button';
  addButton.type = 'button';
  addButton.dataset.action = 'add';
  const updateButton = document.createElement('button');
  updateButton.className = 'cooc-btn cooc-links__button';
  updateButton.type = 'button';
  updateButton.dataset.action = 'update';
  const deleteButton = document.createElement('button');
  deleteButton.className = 'cooc-btn cooc-links__button';
  deleteButton.type = 'button';
  deleteButton.dataset.action = 'delete';
  buttons.append(addButton, updateButton, deleteButton);

  const error = document.createElement('div');
  error.className = 'cooc-links__error';

  const noteEditor: NoteEditorHandle = createNoteEditor({
    t,
    onSet(text) {
      if (selectedLinkIndex === null) return;
      applyEdit(setCooccurrenceLinkNote(state.file, selectedLinkIndex, text));
    },
    onRemove() {
      if (selectedLinkIndex === null) return;
      applyEdit(removeCooccurrenceLinkNote(state.file, selectedLinkIndex));
    },
  });

  element.append(search, viewport, edit, sliceValues.element, buttons, noteEditor.element, error);

  function renderEndpointOptions(select: HTMLSelectElement): void {
    const previous = select.value;
    select.replaceChildren();
    state.file.spec.nodes.forEach((node, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = node.label;
      select.appendChild(option);
    });
    select.value = previous;
  }

  function renderDirectionOptions(): void {
    const previous = directionSelect.value;
    directionSelect.replaceChildren();
    // Why not 名前と値の表を回して翻訳キーを組み立てるか: 組み立てたキーは i18n の走査（翻訳
    // 関数へ渡すリテラルの検出）から外れ、辞書側で「参照ゼロ」と判定される。リテラルで並べる。
    const entries: Array<[LinkDirection, string]> = [
      [LINK_DIRECTION.none, t('links.direction.none')],
      [LINK_DIRECTION.forward, t('links.direction.forward')],
      [LINK_DIRECTION.backward, t('links.direction.backward')],
      [LINK_DIRECTION.both, t('links.direction.both')],
    ];
    for (const [value, label] of entries) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = label;
      directionSelect.appendChild(option);
    }
    directionSelect.value = previous === '' ? String(LINK_DIRECTION.none) : previous;
  }

  function renderRows(): void {
    const noted = noteBearingIndexes(state.file.spec, 'links');
    const rows = filterLinkRows(state.file.spec.nodes, state.file.spec.links, query);
    const viewportHeight = viewport.clientHeight || 120;
    const slice = computeVisibleWindow(rows.length, ROW_HEIGHT, viewport.scrollTop, viewportHeight, OVERSCAN);
    spacer.style.height = `${slice.totalHeight}px`;
    items.style.transform = `translateY(${slice.offsetY}px)`;
    items.replaceChildren();
    rows.slice(slice.startIndex, slice.endIndex).forEach((row, offset) => {
      const element = document.createElement('button');
      element.className = 'cooc-btn cooc-btn--block cooc-links__row';
      element.type = 'button';
      element.dataset.linkIndex = String(row.linkIndex);
      element.setAttribute('role', 'option');
      element.setAttribute('aria-selected', String(selectedLinkIndex === row.linkIndex));
      element.setAttribute('aria-setsize', String(rows.length));
      element.setAttribute('aria-posinset', String(slice.startIndex + offset + 1));
      const link = readLink(state.file.spec.links[row.linkIndex]);
      const related =
        state.selectedNodeIndex !== null &&
        (link.source === state.selectedNodeIndex || link.target === state.selectedNodeIndex);
      element.dataset.related = String(related);
      const hiddenByFilter = !state.visibleLinkIndexes.has(row.linkIndex);
      element.dataset.hiddenByFilter = String(hiddenByFilter);
      if (hiddenByFilter) element.title = t('links.hiddenByFilter');

      const source = document.createElement('span');
      source.className = 'cooc-links__label';
      source.textContent = row.sourceLabel;
      const arrow = document.createElement('span');
      arrow.className = 'cooc-links__arrow';
      arrow.textContent = directionSymbol(row.direction);
      const target = document.createElement('span');
      target.className = 'cooc-links__label';
      target.textContent = row.targetLabel;
      const strength = document.createElement('span');
      strength.className = 'cooc-links__meta';
      strength.textContent = String(row.strength);
      const noteMark = document.createElement('span');
      noteMark.className = 'cooc-links__note-mark';
      noteMark.textContent = noted.has(row.linkIndex) ? '＊' : '';
      if (noted.has(row.linkIndex)) noteMark.title = t('note.marker');
      element.append(source, arrow, target, strength, noteMark);
      element.addEventListener('click', () => {
        selectedLinkIndex = selectedLinkIndex === row.linkIndex ? null : row.linkIndex;
        render();
      });
      items.appendChild(element);
    });
  }

  function syncSelectedInputs(): void {
    if (selectedLinkIndex === null) return;
    const tuple = state.file.spec.links[selectedLinkIndex];
    if (!tuple) {
      // 削除やフィルタ操作で対象が消えた直後。選択を残すと、次の更新が別の共起へ当たる。
      selectedLinkIndex = null;
      return;
    }
    const link = readLink(tuple);
    sourceSelect.value = String(link.source);
    targetSelect.value = String(link.target);
    if (document.activeElement !== strengthInput) strengthInput.value = String(link.strength);
    if (document.activeElement !== directionSelect) directionSelect.value = String(link.direction);
  }

  /**
   * スライス別の強度を流し込む。
   *
   * 全体値は合計から導出されるため（設計書 §2.2）、時間軸を持つ図では強度の入力を触れなく
   * する。押しても必ず拒否されるボタンを操作できるままにしない。
   */
  function syncSliceValues(): void {
    const layered = hasCooccurrenceTimeline(state.file.spec);
    strengthInput.disabled = layered;
    const slices = state.file.spec.timeline?.slices ?? [];
    sliceValues.update(
      slices,
      slices.map((_slice, sliceIndex) =>
        selectedLinkIndex === null
          ? undefined
          : readCooccurrenceSliceValue(state.file.spec, {
              target: 'links',
              slice: sliceIndex,
              index: selectedLinkIndex,
            }),
      ),
    );
  }

  function render(): void {
    search.placeholder = t('links.search');
    search.setAttribute('aria-label', t('links.search'));
    items.setAttribute('aria-label', t('links.listLabel'));
    noteEditor.setT(t);
    noteEditor.setValue(
      selectedLinkIndex === null ? undefined : readCooccurrenceNote(state.file.spec, 'links', selectedLinkIndex),
    );
    sourceSelect.setAttribute('aria-label', t('links.source'));
    targetSelect.setAttribute('aria-label', t('links.target'));
    strengthInput.placeholder = t('links.strength');
    strengthInput.setAttribute('aria-label', t('links.strength'));
    directionSelect.setAttribute('aria-label', t('links.direction'));
    addButton.textContent = t('links.add');
    updateButton.textContent = t('links.update');
    deleteButton.textContent = t('links.delete');
    renderEndpointOptions(sourceSelect);
    renderEndpointOptions(targetSelect);
    sliceValues.setTitle(t('links.sliceValues'));
    syncSliceValues();
    renderDirectionOptions();
    syncSelectedInputs();
    // 行を作り直すと押した行の要素自体が破棄される。フォーカスが body へ戻ると、キーボード
    // だけの操作で選択のたびに一覧の先頭へ巻き戻る。
    const activeLinkIndex =
      document.activeElement instanceof HTMLElement && element.contains(document.activeElement)
        ? document.activeElement.dataset.linkIndex
        : undefined;
    renderRows();
    if (activeLinkIndex === undefined) return;
    items.querySelector<HTMLElement>(`[data-link-index="${activeLinkIndex}"]`)?.focus();
  }

  function applyEdit(result: CooccurrenceEditResult): void {
    error.textContent = resultMessage(result);
    if (result.ok) options.onFileChange(result.file);
  }

  function selectedDirection(): LinkDirection {
    const value = Number(directionSelect.value);
    return isLinkDirection(value) ? value : LINK_DIRECTION.none;
  }

  search.addEventListener('input', () => {
    query = search.value;
    viewport.scrollTop = 0;
    renderRows();
  });
  viewport.addEventListener('scroll', renderRows);

  addButton.addEventListener('click', () => {
    const endpoints: [number, number] = [Number(sourceSelect.value), Number(targetSelect.value)];
    if (hasCooccurrenceTimeline(state.file.spec)) {
      // 全体値は合計から導出されるため 0 を置き、スライス別の値を渡す（設計書 §2.2）。
      applyEdit(
        addCooccurrenceLink(state.file, [...endpoints, 0, selectedDirection()], sliceValues.readValues()),
      );
      return;
    }
    const strength = Number(strengthInput.value);
    applyEdit(
      addCooccurrenceLink(state.file, [
        ...endpoints,
        Number.isFinite(strength) ? strength : 1,
        selectedDirection(),
      ]),
    );
  });

  updateButton.addEventListener('click', () => {
    if (selectedLinkIndex === null) return;
    // 強度と向きを別々の関数で当てる。片方が検証で落ちたらそこで止め、もう片方だけが適用
    // された中途半端な状態を残さない。
    // 時間軸を持つ図では強度は導出値であり、向きだけを当てる。
    if (hasCooccurrenceTimeline(state.file.spec)) {
      applyEdit(setCooccurrenceLinkDirection(state.file, selectedLinkIndex, selectedDirection()));
      return;
    }
    const strengthResult = setCooccurrenceLinkStrength(state.file, selectedLinkIndex, Number(strengthInput.value));
    if (!strengthResult.ok) {
      applyEdit(strengthResult);
      return;
    }
    applyEdit(setCooccurrenceLinkDirection(strengthResult.file, selectedLinkIndex, selectedDirection()));
  });

  deleteButton.addEventListener('click', () => {
    if (selectedLinkIndex === null) return;
    const result = deleteCooccurrenceLink(state.file, selectedLinkIndex);
    if (result.ok) selectedLinkIndex = null;
    applyEdit(result);
  });

  render();

  return {
    element,
    update(nextState: LinkListPanelState): void {
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
