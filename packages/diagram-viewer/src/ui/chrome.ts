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
  DIAGRAM_LINE_COLORS,
  DIAGRAM_LINE_ROUTES,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_SHAPES,
  type DiagramDocument,
  type DiagramEndpoint,
  type DiagramLayout,
  type DiagramLineColor,
  type DiagramLineLook,
  type DiagramLineRoute,
  type DiagramLineStyle,
  type DiagramShape,
  type DiagramSpacing,
  isDefaultDiagramSpacing,
  isEmptyLayout,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setClass, setText } from './dom';
import { createIcon, type DiagramIcon } from './icons';

export interface ChromeCallbacks {
  onLocate(name: string): void;
  onSave(): void;
  onConfirm(kind: 'discard' | 'reset'): void;
  onClearSelection(): void;
  onResetSpacing(): void;
  /** 編集と閲覧を切り替える。いまどちらかは呼ばれた側が知っている。 */
  onToggleEditing(): void;
  /** 選んでいる 1 つの要素の名札を書き換える。 */
  onRenameSelected(): void;
  /** 選んでいる 1 つの要素の注記を書き換える。 */
  onAnnotateSelected(): void;
  /** 選んでいる 1 つの要素を図から取り除く。 */
  onRemoveSelected(): void;
  /** 選んでいる 1 つの要素の形を変える。 */
  onElementShape(shape: DiagramShape): void;
  /** 選んでいる線の見た目を変える。渡した項目だけを差し替える（手で引いた線・家族の線の両方）。 */
  onLineLook(patch: Partial<DiagramLineLook>): void;
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
  /**
   * ちょうど 1 つ選んでいるときの、その要素の形。
   *
   * 選んでいないとき・2 つ以上のときも**既定（四角）を渡す**。空を渡せる形にすると、選び口が
   * 値の無い状態を持つことになり、押せない間に何が出ているのかを区画の側で決められない。
   */
  readonly elementShape: DiagramShape;
  /** 選んでいる線。`null` は線を選んでいない状態。手で引いた線と家族の線の両方が来る。 */
  readonly lineSelection: LineSelection | null;
}

/**
 * 設定の区画へ出す「選んでいる線」。
 *
 * 手で引いた線と家族の線を**同じ形**にして渡す。区画の側で出どころを場合分けすると、片方へ
 * 項目を足した日にもう片方が取り残される。違うのは消せるかどうかだけ — 家族の線を消すことは
 * 家族そのものを消すことなので、ここからは行わせない。
 */
export interface LineSelection {
  readonly label: string;
  readonly look: DiagramLineLook;
  readonly deletable: boolean;
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

  /*
    操作列そのものも**図の枠の中**へ浮かせる（`mountDiagramViewer` が枠の中へ入れる。ユーザー指示）。
    対象（図）と操作を同じ場所へ置くため — 見え方の操作・選択の区画を中へ移したのと同じ理由。

    見た目は選択の区画と同じ札にする（`anytime-diagram-panel` を併せて付ける）。枠の中の浮きものが
    札と操作列で別の寸法・別の縁を持つと、同じ層に載っている 2 つが別の階層に見える。

    拡大・縮小・全体表示・初期表示はここに置かない。ミニマップの中にある（`viewControls.ts`）。
  */
  const toolbar = el(doc, 'div', {
    className: 'anytime-diagram-toolbar anytime-diagram-panel',
    attrs: { role: 'group' },
  });
  /*
    要素へ移動する選び口。**見出しの字は置かない**（操作列を短くするためのユーザー指示）。

    字を消しても名前は残す。`aria-label` を付けずに字だけ消すと、読み上げでは名前の無い
    選び口になり、何を選ぶ場所なのか画面を見ない利用者には届かない。
  */
  const find = el(doc, 'select');
  find.addEventListener('change', () => callbacks.onLocate(find.value));
  const choosePerson = el(doc, 'option', { attrs: { value: '' } });

  /*
    編集と閲覧の切り替え。**2 つのボタンではなく 1 つの絵**にする（ユーザー指示）。

    出す・出さないで切り替えていた頃は、同じ場所に別の字が現れるので押す前にどちらの状態か
    読み取る必要があった。1 つにすると位置が動かず、絵が行き先を示す。
  */
  const modeToggle = iconButton(doc, 'editMode', callbacks.onToggleEditing);
  const save = button(doc, callbacks.onSave);
  const resetLayout = button(doc, () => callbacks.onConfirm('reset'));
  toolbar.append(find, modeToggle, save, resetLayout);

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
  const annotateSelected = iconButton(doc, 'annotate', callbacks.onAnnotateSelected);
  const removeSelected = iconButton(doc, 'remove', callbacks.onRemoveSelected);
  /*
    形の選び口。線の見た目と同じ `picker()` を使い、**選択肢は列挙そのものから作る**。手で並べると、
    形を足した日にここだけが古い一覧のまま残り、ファイルには書けるのに画面からは選べない形ができる。
  */
  const elementShape = picker<DiagramShape>(doc, DIAGRAM_SHAPES, callbacks.onElementShape);
  selectionBar.append(
    selectionCount, clearSelection, renameSelected, annotateSelected, removeSelected,
    elementShape.label, cardSize, spacingReset,
  );

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
    callbacks.onLineLook({ line: value }));
  const lineColor = picker<DiagramLineColor>(doc, DIAGRAM_LINE_COLORS, (value) =>
    callbacks.onLineLook({ color: value }));
  const lineRoute = picker<DiagramLineRoute>(doc, DIAGRAM_LINE_ROUTES, (value) =>
    callbacks.onLineLook({ route: value }));
  const startCap = picker<DiagramEndpoint>(doc, DIAGRAM_ENDPOINTS, (value) =>
    callbacks.onLineLook({ start: value }));
  const endCap = picker<DiagramEndpoint>(doc, DIAGRAM_ENDPOINTS, (value) =>
    callbacks.onLineLook({ end: value }));
  const deleteConnector = iconButton(doc, 'remove', callbacks.onDeleteConnector);
  connectorBar.append(
    connectorName, lineStyle.label, lineColor.label, lineRoute.label,
    startCap.label, endCap.label, deleteConnector,
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
      setText(blocked, t('gridLinesBlocked'));

      find.setAttribute('aria-label', t('findPerson'));
      choosePerson.textContent = t('choosePerson');
      resetLayout.textContent = t('resetLayout');
      // 絵は**行き先**を描く（編集中なら閲覧へ戻る目、閲覧中なら編集へ入る鉛筆）。
      setIcon(modeToggle, state.editing ? 'viewMode' : 'editMode');
      label(modeToggle, state.editing ? t('stopEditing') : t('editLayout'));
      label(clearSelection, t('clearSelection'));
      label(spacingReset, t('spacingReset'));
      label(renameSelected, t('renameElement'));
      label(annotateSelected, t('annotateElement'));
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

      setClass(modeToggle, 'anytime-diagram-hidden', !(state.editable && state.canSave));
      modeToggle.disabled = state.saving;
      for (const control of [save, resetLayout]) {
        setClass(control, 'anytime-diagram-hidden', !state.editing);
      }
      save.textContent = state.saving ? t('saving') : t('save');
      save.disabled = !state.changed || state.saving;
      resetLayout.disabled = state.saving || state.draft === null || isEmptyLayout(state.draft);

      setClass(selectionBar, 'anytime-diagram-hidden', !state.editing);
      setText(selectionCount, state.selectionCount === 0
        ? t('selectionNone')
        : t('selectionCount', { count: state.selectionCount }));
      clearSelection.disabled = state.saving || state.selectionCount === 0;
      // どちらも**ちょうど 1 つ選んでいるときだけ**押せる。2 つ以上へ同時に当てると、
      // どちらの名前を書き換えたのか・どちらが消えたのかが操作の後から分からない。
      renameSelected.disabled = state.saving || state.selectionCount !== 1;
      removeSelected.disabled = state.saving || state.selectionCount !== 1;
      annotateSelected.disabled = state.saving || state.selectionCount !== 1;
      // 形も**ちょうど 1 つ選んでいるときだけ**。2 つ以上へ同時に当てると、どちらを変えたのかが
      // 操作の後から分からない（名札の書き換え・取り除きと同じ理由）。
      elementShape.apply(
        t('elementShape'),
        state.elementShape,
        (value) => t(`shape.${value}`),
        state.saving || state.selectionCount !== 1,
      );
      setText(cardSize, t('cardSize', { width: state.spacing.nodeWidth, height: state.spacing.nodeHeight }));
      spacingReset.disabled = state.saving || isDefaultDiagramSpacing(state.draft?.spacing);

      // 縁のアイコンを出せない図では、**消える代わりに理由を出す**。編集に入れば出るはずのものが
      // 黙って出ないと、壊れているのか仕様なのかを画面から区別できない。
      setClass(blocked, 'anytime-diagram-hidden', !(state.editing && !state.shiftable));
      setText(error, state.notice);
      setClass(error, 'anytime-diagram-hidden', state.notice === '');
    },
  };

  function updateConnectorBar(state: ChromeState): void {
    const line = state.lineSelection;
    connectorBar.setAttribute('aria-label', t('connectorStyle'));
    setClass(connectorBar, 'anytime-diagram-hidden', !(state.editing && line !== null));
    if (line === null) return;
    const { look } = line;
    setText(connectorName, line.label);
    // 消す口は手で引いた線にだけ出す。家族の線を消すことは家族そのものを消すことなので、
    // 見た目を変える区画からは行わせない（要素の取り除きが受け持つ）。
    setClass(deleteConnector, 'anytime-diagram-hidden', !line.deletable);
    deleteConnector.disabled = state.saving;
    lineStyle.apply(t('lineStyle'), look.line, (value) => t(`lineStyle.${value}`), state.saving);
    lineColor.apply(t('lineColor'), look.color, (value) => t(`lineColor.${value}`), state.saving);
    lineRoute.apply(t('lineRoute'), look.route, (value) => t(`lineRoute.${value}`), state.saving);
    startCap.apply(t('startCap'), look.start, (value) => t(`endpoint.${value}`), state.saving);
    endCap.apply(t('endCap'), look.end, (value) => t(`endpoint.${value}`), state.saving);
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
  /** 開く前に焦点を持っていた要素。閉じたら戻す（`aria-modal` を名乗る以上、外へ置き去りにしない）。 */
  let opener: HTMLElement | null = null;
  function hide(): void {
    current = null;
    root.classList.remove('is-open');
    // 焦点を戻してから控えを捨てる。戻さないと、閉じた後の Tab が図の先頭からやり直しになる。
    opener?.focus();
    opener = null;
  }
  /*
    Escape で閉じる。覆いの中のボタンで閉じられても、**キーボードの出口は 1 つ足りなかった**
    （`aria-modal="true"` は「外は読まなくてよい」と宣言する属性なので、出口が無いと宣言と実際が
    食い違う）。押下は外へ渡さない — 渡すと図の側の Delete / 矢印まで巻き込む。
  */
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    hide();
  });

  return {
    root,
    show(kind) {
      const active = doc.activeElement;
      opener = active instanceof HTMLElement ? active : null;
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

/** 絵を差し替える。**ボタンそのものは作り直さない**（押している最中に焦点が図の外へ飛ぶ）。 */
function setIcon(element: HTMLButtonElement, icon: DiagramIcon): void {
  if (element.dataset.icon === icon) return;
  element.dataset.icon = icon;
  element.textContent = '';
  element.appendChild(createIcon(element.ownerDocument, icon, 15));
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
