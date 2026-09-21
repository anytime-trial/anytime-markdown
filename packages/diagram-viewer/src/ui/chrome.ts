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
  DIAGRAM_ENDPOINTS,
  DIAGRAM_LINE_STYLES,
  type DiagramConnector,
  type DiagramDocument,
  type DiagramEndpoint,
  type DiagramLayout,
  type DiagramLineStyle,
  type DiagramSpacing,
  isDefaultDiagramSpacing,
  isEmptyLayout,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setClass } from './dom';
import { createIcon, type DiagramIcon } from './icons';

export interface ChromeCallbacks {
  onLocate(name: string): void;
  onStartEditing(): void;
  onStopEditing(): void;
  onSave(): void;
  onConfirm(kind: 'discard' | 'reset'): void;
  onClearSelection(): void;
  onResetSpacing(): void;
  /** 選んでいる 1 つの要素の名札を書き換える。 */
  onRenameSelected(): void;
  /** 選んでいる 1 つの要素を図から取り除く。 */
  onRemoveSelected(): void;
  /** 選んでいる線の見た目を変える。渡した項目だけを差し替える。 */
  onConnectorStyle(patch: Partial<Pick<DiagramConnector, 'line' | 'start' | 'end'>>): void;
  onDeleteConnector(): void;
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
  /** 図の中に出す短い知らせ（保存の失敗・できない操作の理由）。空なら何も出さない。 */
  readonly notice: string;
  readonly spacing: DiagramSpacing;
  readonly draft: DiagramLayout | null;
  readonly shiftable: boolean;
  /** 選んでいる接続線。`null` は線を選んでいない状態。 */
  readonly connector: DiagramConnector | null;
  /** 選んでいる 1 つの要素を図から取り除けるか（家族に出る人物は取り除けない）。 */
  readonly removable: boolean;
}

export interface ChromeView {
  readonly title: HTMLElement;
  readonly lead: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly selectionBar: HTMLElement;
  readonly connectorBar: HTMLElement;
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

  /*
    選択の区画は**図の枠の中**へ浮かせる（`mountDiagramViewer` が枠の中へ入れる）。対象（選んだ
    札）と、それに効く操作を同じ場所に置くため — 見え方の操作を枠の中へ移したのと同じ理由。

    枠の中は図に譲る面積が惜しいので、**操作は線画、値は字**にする。「1 人を選択中」「194 × 112px」は
    値なので絵では表せない。
  */
  const selectionBar = el(doc, 'div', {
    className: 'anytime-diagram-selection anytime-diagram-panel anytime-diagram-hidden',
    attrs: { role: 'group' },
  });
  const selectionCount = el(doc, 'output', { attrs: { 'aria-live': 'polite' } });
  const clearSelection = iconButton(doc, 'clearSelection', callbacks.onClearSelection);
  const cardSize = el(doc, 'output', { attrs: { 'aria-live': 'polite' } });
  const spacingReset = iconButton(doc, 'resetSize', callbacks.onResetSpacing);
  /*
    名札の書き換えと取り除きは**札の上ではなく帯に置く**。

    札の取っ手（右上）はすでに 3 つ並んでおり、5 つに増やすと帯が箱の幅の半分を越えて名前そのものを
    隠す（実機で「新しい要素」が「新」だけになった）。箱の幅は刻みで決まるので、字を詰めても
    解決しない。対象は選択で示し、操作は 1 か所に集める — 線の見た目を変える口と同じ置き方。
  */
  const renameSelected = iconButton(doc, 'rename', callbacks.onRenameSelected);
  const removeSelected = iconButton(doc, 'remove', callbacks.onRemoveSelected);
  selectionBar.append(selectionCount, clearSelection, renameSelected, removeSelected, cardSize, spacingReset);

  /**
   * 選んだ接続線の見た目。**図の中に浮かせず、選択の帯の隣に置く。**
   *
   * 図に重ねると、設定札が下の札と線を隠す（隠れるのはたいてい、いま見比べたい相手の線）。
   * 帯に置けば図は 1 行ぶんしか削られず、位置も毎回同じところに出る。
   */
  const connectorBar = el(doc, 'div', {
    className: 'anytime-diagram-selection anytime-diagram-panel anytime-diagram-connectorbar anytime-diagram-hidden',
    attrs: { role: 'group' },
  });
  const connectorName = el(doc, 'output', { attrs: { 'aria-live': 'polite' } });
  const lineStyle = picker<DiagramLineStyle>(doc, DIAGRAM_LINE_STYLES, (value) =>
    callbacks.onConnectorStyle({ line: value }));
  const startCap = picker<DiagramEndpoint>(doc, DIAGRAM_ENDPOINTS, (value) =>
    callbacks.onConnectorStyle({ start: value }));
  const endCap = picker<DiagramEndpoint>(doc, DIAGRAM_ENDPOINTS, (value) =>
    callbacks.onConnectorStyle({ end: value }));
  const deleteConnector = iconButton(doc, 'remove', callbacks.onDeleteConnector);
  connectorBar.append(
    connectorName, lineStyle.label, startCap.label, endCap.label, deleteConnector,
  );

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
    title, lead, toolbar, selectionBar, connectorBar, blocked, error, note,
    update(state) {
      updateConnectorBar(state);
      toolbar.setAttribute('aria-label', t('controls'));
      selectionBar.setAttribute('aria-label', t('selection'));
      title.textContent = state.document.title;
      lead.textContent = state.document.lead;
      note.textContent = state.document.note;
      setClass(lead, 'anytime-diagram-hidden', state.compact || state.document.lead === '');
      setClass(note, 'anytime-diagram-hidden', state.compact || state.document.note === '');
      blocked.textContent = t('gridLinesBlocked');

      findText.nodeValue = `${t('findPerson')} `;
      choosePerson.textContent = t('choosePerson');
      startEditing.textContent = t('editLayout');
      stopEditing.textContent = t('stopEditing');
      resetLayout.textContent = t('resetLayout');
      label(clearSelection, t('clearSelection'));
      label(spacingReset, t('spacingReset'));
      label(renameSelected, t('renameElement'));
      label(removeSelected, t('removeElement'));
      label(deleteConnector, t('deleteConnector'));

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
      // どちらも**ちょうど 1 つ選んでいるときだけ**押せる。2 つ以上へ同時に当てると、
      // どちらの名前を書き換えたのか・どちらが消えたのかが操作の後から分からない。
      renameSelected.disabled = state.saving || state.selectionCount !== 1;
      removeSelected.disabled = state.saving || state.selectionCount !== 1 || !state.removable;
      cardSize.textContent = t('cardSize', { width: state.spacing.nodeWidth, height: state.spacing.nodeHeight });
      spacingReset.disabled = state.saving || isDefaultDiagramSpacing(state.draft?.spacing);

      // 縁のアイコンを出せない図では、**消える代わりに理由を出す**。編集に入れば出るはずのものが
      // 黙って出ないと、壊れているのか仕様なのかを画面から区別できない。
      setClass(blocked, 'anytime-diagram-hidden', !(state.editing && !state.shiftable));
      error.textContent = state.notice;
      setClass(error, 'anytime-diagram-hidden', state.notice === '');
    },
  };

  function updateConnectorBar(state: ChromeState): void {
    const connector = state.connector;
    connectorBar.setAttribute('aria-label', t('connectorStyle'));
    setClass(connectorBar, 'anytime-diagram-hidden', !(state.editing && connector !== null));
    if (connector === null) return;
    connectorName.textContent = t('selectConnector', { from: connector.from, to: connector.to });
    deleteConnector.disabled = state.saving;
    lineStyle.apply(t('lineStyle'), connector.line, (value) => t(`lineStyle.${value}`), state.saving);
    startCap.apply(t('startCap'), connector.start, (value) => t(`endpoint.${value}`), state.saving);
    endCap.apply(t('endCap'), connector.end, (value) => t(`endpoint.${value}`), state.saving);
  }
}

/**
 * 値をひとつ選ぶ口（札 + `<select>`）。
 *
 * 選択肢は**列挙そのものから作る**。手で並べると、線種や端の印を足した日にここだけが古い一覧の
 * まま残り、ファイルには書けるのに画面からは選べない値ができる。
 */
function picker<T extends string>(
  doc: Document,
  values: readonly T[],
  onChange: (value: T) => void,
): {
  readonly label: HTMLLabelElement;
  apply(text: string, current: T, optionText: (value: T) => string, saving: boolean): void;
} {
  const label = el(doc, 'label');
  const caption = doc.createTextNode('');
  const select = el(doc, 'select');
  const options = values.map((value) => {
    const option = el(doc, 'option', { attrs: { value } });
    select.appendChild(option);
    return { value, option };
  });
  select.addEventListener('change', () => onChange(select.value as T));
  label.append(caption, select);
  return {
    label,
    apply(text, current, optionText, saving) {
      // 文言は毎回当てる（作るときに焼き込むと、locale を差し替えても前の言語のまま残る）。
      caption.nodeValue = `${text} `;
      for (const { value, option } of options) option.textContent = optionText(value);
      select.value = current;
      select.disabled = saving;
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
 * 絵だけのボタン。**字ではなく線画**で描く（記号の文字は字形を持たない環境で豆腐になる）。
 *
 * 文言は `update` で当てるので、ここでは形だけを決める。
 */
function iconButton(doc: Document, icon: DiagramIcon, onClick: () => void): HTMLButtonElement {
  const element = button(doc, onClick);
  element.className = 'anytime-diagram-iconbutton';
  element.appendChild(createIcon(doc, icon, 15));
  return element;
}

/** 絵だけのボタンの名前は `aria-label` と `title` の両方へ置く（読み上げと吹き出しの両方）。 */
function label(element: HTMLButtonElement, text: string): void {
  element.setAttribute('aria-label', text);
  element.title = text;
}

/**
 * 「自動配置に戻す」の戻し先。配置も刻みも持たない下書き。
 *
 * 刻みを残すと、「自動配置に戻した」のに列の間隔だけ戻らない状態になる（既定と同じ刻みは
 * そもそも持たない決まりなので、鍵ごと落とすのが既定へ戻すことと同じ）。
 */
export const RESET_LAYOUT: DiagramLayout = { placements: {} };
