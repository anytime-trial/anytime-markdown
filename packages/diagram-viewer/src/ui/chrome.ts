/**
 * 図の外側（題名・操作列・選択の区画・説明・確認）。
 *
 * 図そのものと分けてあるのは、**図は指の動きごとに更新され、外側はそうでない**ため。1 つに
 * 束ねると、平行移動のたびに操作列の札まで組み立て直すことになる。
 *
 * 文言は**すべて `update` で当てる**（要素を作るときに焼き込まない）。焼き込むと、locale を
 * 差し替えたときに作り直した部分だけが訳され、操作列だけ前の言語のまま残る。
 */

import {
  type DiagramDocument,
  type DiagramLayout,
  type DiagramSpacing,
  isDefaultDiagramSpacing,
  isEmptyLayout,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setClass } from './dom';

export interface ChromeCallbacks {
  onLocate(name: string): void;
  onStartEditing(): void;
  onStopEditing(): void;
  onSave(): void;
  onConfirm(kind: 'discard' | 'reset'): void;
  onClearSelection(): void;
  onResetSpacing(): void;
}

export interface ChromeState {
  readonly document: DiagramDocument;
  readonly names: readonly string[];
  readonly selected: string;
  readonly selectionCount: number;
  readonly editing: boolean;
  readonly editable: boolean;
  readonly compact: boolean;
  readonly canSave: boolean;
  readonly changed: boolean;
  readonly saving: boolean;
  readonly saveError: string;
  readonly spacing: DiagramSpacing;
  readonly draft: DiagramLayout | null;
  readonly shiftable: boolean;
}

export interface ChromeView {
  readonly title: HTMLElement;
  readonly lead: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly selectionBar: HTMLElement;
  readonly help: HTMLElement;
  readonly editHelp: HTMLElement;
  readonly blocked: HTMLElement;
  readonly error: HTMLElement;
  readonly note: HTMLElement;
  update(state: ChromeState): void;
}

export function createChromeView(doc: Document, t: DiagramT, callbacks: ChromeCallbacks): ChromeView {
  const title = el(doc, 'h2', { className: 'anytime-diagram-title' });
  const lead = el(doc, 'p', { className: 'anytime-diagram-lead' });
  const note = el(doc, 'p', { className: 'anytime-diagram-note' });

  // 拡大・縮小・全体表示・初期表示はここに置かない。図の枠の中へ浮かせてある
  // （`viewControls.ts`）。対象と操作を同じ場所へ置くため。
  const toolbar = el(doc, 'div', { className: 'anytime-diagram-toolbar', attrs: { role: 'group' } });
  const findLabel = el(doc, 'label');
  const findText = doc.createTextNode('');
  const find = el(doc, 'select');
  find.addEventListener('change', () => callbacks.onLocate(find.value));
  findLabel.append(findText, find);
  const choosePerson = el(doc, 'option', { attrs: { value: '' } });

  const startEditing = button(doc, callbacks.onStartEditing);
  const save = button(doc, callbacks.onSave);
  const stopEditing = button(doc, callbacks.onStopEditing);
  const resetLayout = button(doc, () => callbacks.onConfirm('reset'));
  toolbar.append(findLabel, startEditing, save, stopEditing, resetLayout);

  const selectionBar = el(doc, 'div', {
    className: 'anytime-diagram-selection anytime-diagram-hidden',
    attrs: { role: 'group' },
  });
  const selectionCount = el(doc, 'output', { attrs: { 'aria-live': 'polite' } });
  const clearSelection = button(doc, callbacks.onClearSelection);
  const cardSize = el(doc, 'output', { attrs: { 'aria-live': 'polite' } });
  const spacingReset = button(doc, callbacks.onResetSpacing);
  selectionBar.append(selectionCount, clearSelection, cardSize, spacingReset);

  const help = el(doc, 'p', { className: 'anytime-diagram-note' });
  const editHelp = el(doc, 'p', { className: 'anytime-diagram-note anytime-diagram-hidden' });
  const blocked = el(doc, 'p', {
    className: 'anytime-diagram-note anytime-diagram-error anytime-diagram-hidden',
    attrs: { role: 'status' },
  });
  const error = el(doc, 'p', {
    className: 'anytime-diagram-note anytime-diagram-error anytime-diagram-hidden',
    attrs: { role: 'alert' },
  });

  /** 一覧の中身を組み直した時点の鍵。**同一性ではなく中身で比べる** — 配列は毎回作り直されるので、
   * 同一性で比べると指を動かすたびに人物数ぶんの `<option>` を作り直すことになる。 */
  let renderedNames = '\u0000';

  return {
    title, lead, toolbar, selectionBar, help, editHelp, blocked, error, note,
    update(state) {
      toolbar.setAttribute('aria-label', t('controls'));
      selectionBar.setAttribute('aria-label', t('selection'));
      title.textContent = state.document.title;
      lead.textContent = state.document.lead;
      note.textContent = state.document.note;
      setClass(lead, 'anytime-diagram-hidden', state.compact || state.document.lead === '');
      setClass(note, 'anytime-diagram-hidden', state.compact || state.document.note === '');
      help.textContent = `${t('navigationHelp')} ${state.document.legend}`;
      editHelp.textContent = t('editHelp');
      blocked.textContent = t('gridLinesBlocked');

      findText.nodeValue = `${t('findPerson')} `;
      choosePerson.textContent = t('choosePerson');
      startEditing.textContent = t('editLayout');
      stopEditing.textContent = t('stopEditing');
      resetLayout.textContent = t('resetLayout');
      clearSelection.textContent = t('clearSelection');
      spacingReset.textContent = t('spacingReset');

      const key = state.names.join('\u0000');
      if (renderedNames !== key) {
        find.textContent = '';
        find.append(choosePerson);
        for (const name of state.names) {
          find.appendChild(el(doc, 'option', { text: name, attrs: { value: name } }));
        }
        renderedNames = key;
      }
      find.value = state.selected;

      setClass(startEditing, 'anytime-diagram-hidden', !(state.editable && state.canSave && !state.editing));
      for (const control of [save, stopEditing, resetLayout]) {
        setClass(control, 'anytime-diagram-hidden', !state.editing);
      }
      save.textContent = state.saving ? t('saving') : t('save');
      save.disabled = !state.changed || state.saving;
      stopEditing.disabled = state.saving;
      resetLayout.disabled = state.saving || state.draft === null || isEmptyLayout(state.draft);

      setClass(selectionBar, 'anytime-diagram-hidden', !state.editing);
      selectionCount.textContent = state.selectionCount === 0
        ? t('selectionNone')
        : t('selectionCount', { count: state.selectionCount });
      clearSelection.disabled = state.saving || state.selectionCount === 0;
      cardSize.textContent = t('cardSize', { width: state.spacing.nodeWidth, height: state.spacing.nodeHeight });
      spacingReset.disabled = state.saving || isDefaultDiagramSpacing(state.draft?.spacing);

      setClass(editHelp, 'anytime-diagram-hidden', !state.editing);
      // 縁のアイコンを出せない図では、**消える代わりに理由を出す**。操作の説明文は「上端・左端の
      // ＋ を押すと」と述べ続けるので、黙って消すと在るはずのものが見当たらない状態になる。
      setClass(blocked, 'anytime-diagram-hidden', !(state.editing && !state.shiftable));
      error.textContent = state.saveError;
      setClass(error, 'anytime-diagram-hidden', state.saveError === '');
    },
  };
}

export interface ConfirmView {
  readonly root: HTMLElement;
  show(kind: 'discard' | 'reset'): void;
  hide(): void;
}

/**
 * 確認（破棄・全解除）。宿主のダイアログを借りず、図の中だけで完結させる。
 *
 * `window.confirm` を使わないのは、VS Code の webview では**出せないことがある**ため
 * （出せないと false が返り、押していない「やめる」が選ばれたことになる）。
 */
export function createConfirmView(
  doc: Document,
  t: DiagramT,
  onConfirm: (kind: 'discard' | 'reset') => void,
): ConfirmView {
  // 出す・出さないは `is-open` だけで決める（スタイルシート側の既定は none）。
  const root = el(doc, 'div', {
    className: 'anytime-diagram-confirm',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const box = el(doc, 'div', { className: 'anytime-diagram-confirm-box' });
  const heading = el(doc, 'h3');
  const body = el(doc, 'p');
  const actions = el(doc, 'div');
  const cancel = button(doc, () => hide());
  const confirm = button(doc, () => {
    const kind = current;
    hide();
    if (kind !== null) onConfirm(kind);
  });
  actions.append(cancel, confirm);
  box.append(heading, body, actions);
  root.appendChild(box);

  let current: 'discard' | 'reset' | null = null;
  function hide(): void {
    current = null;
    root.classList.remove('is-open');
  }

  return {
    root,
    show(kind) {
      current = kind;
      heading.textContent = kind === 'discard' ? t('discardTitle') : t('resetTitle');
      body.textContent = kind === 'discard' ? t('discardNote') : t('resetNote');
      confirm.textContent = kind === 'discard' ? t('discardConfirm') : t('resetConfirm');
      cancel.textContent = t('cancel');
      root.setAttribute('aria-label', heading.textContent);
      root.classList.add('is-open');
      confirm.focus();
    },
    hide,
  };
}

function button(doc: Document, onClick: () => void): HTMLButtonElement {
  const element = el(doc, 'button', { attrs: { type: 'button' } });
  element.addEventListener('click', onClick);
  return element;
}

/**
 * 「自動配置に戻す」の戻し先。配置も刻みも持たない下書き。
 *
 * 刻みを残すと、「自動配置に戻した」のに列の間隔だけ戻らない状態になる（既定と同じ刻みは
 * そもそも持たない決まりなので、鍵ごと落とすのが既定へ戻すことと同じ）。
 */
export const RESET_LAYOUT: DiagramLayout = { placements: {} };
