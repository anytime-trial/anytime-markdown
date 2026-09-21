/**
 * 群を編集するダイアログ。**家族 1 件ぶんの値の選び直しと、語彙そのものの編集を 1 か所で行う。**
 *
 * 帯（枠の左下）から移した。帯では軸 1 本につき選び口 1 つしか置けず、「その軸にどんな選択肢が
 * あるか」を直す場所が画面のどこにも無かった（ファイルの `groups` を手で書くほかない）。
 *
 * 語彙の編集と値の選び直しを**別の画面に分けない**。分けると、選び口に欲しい値が無いと気づいた
 * 人が、いま何を編集していたかを覚えたまま別の場所へ移ることになる。
 *
 * 軸の数も選択肢の数も図ごとに変わるので、行は**貸し借りする**（作るたびに数を決め打つと、
 * 軸を 1 本足した図でその軸だけ出ない）。
 */

import type { DiagramGroupAxis } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setClass } from './dom';

export interface GroupDialogCallbacks {
  /** 軸 1 本の値を選び直す。空文字はその軸を落とす。 */
  onGroupValue(axisId: string, value: string): void;
  onAddAxis(): void;
  onRenameAxis(axisId: string, label: string): void;
  onRemoveAxis(axisId: string): void;
  onAddValue(axisId: string): void;
  onRenameValue(axisId: string, value: string, label: string): void;
  onRemoveValue(axisId: string, value: string): void;
  onClose(): void;
}

export interface GroupSelection {
  /** 何の群かを示す見出し（その家族の親たち）。 */
  readonly label: string;
  readonly axes: readonly DiagramGroupAxis[];
  /** いまの値。軸 id → 値の鍵。持たない軸は「なし」。 */
  readonly values: Readonly<Record<string, string>>;
}

export interface GroupDialogState {
  readonly selection: GroupSelection | null;
  readonly saving: boolean;
}

export interface GroupDialogView {
  readonly root: HTMLElement;
  update(state: GroupDialogState): void;
}

/** 貸し出し中の選択肢 1 行。指している値は描くたびに差し替える。 */
interface ValueRow {
  readonly row: HTMLElement;
  readonly name: HTMLInputElement;
  readonly remove: HTMLButtonElement;
  value: string;
}

/** 貸し出し中の軸 1 つぶん。選択肢の行はこの中でさらに貸し借りする。 */
interface AxisRow {
  readonly root: HTMLElement;
  readonly name: HTMLInputElement;
  readonly select: HTMLSelectElement;
  readonly selectCaption: Text;
  readonly remove: HTMLButtonElement;
  readonly values: HTMLElement;
  readonly addValue: HTMLButtonElement;
  readonly rows: ValueRow[];
  /** 前回描いたときの選択肢の数。足した選択肢へ焦点を移すのに使う（-1 は「まだ描いていない」）。 */
  rendered: number;
  axisId: string;
}

export function createGroupDialogView(
  doc: Document,
  t: DiagramT,
  callbacks: GroupDialogCallbacks,
): GroupDialogView {
  // 出す・出さないは `is-open` だけで決める（確認の覆いと同じ。既定はスタイルシート側で none）。
  const root = el(doc, 'div', {
    className: 'anytime-diagram-groupdialog',
    attrs: { role: 'dialog', 'aria-modal': 'true' },
  });
  const box = el(doc, 'div', { className: 'anytime-diagram-groupdialog-box' });
  const head = el(doc, 'div', { className: 'anytime-diagram-groupdialog-head' });
  const heading = el(doc, 'h3');
  const close = el(doc, 'button', { text: '×', attrs: { type: 'button' } });
  close.addEventListener('click', callbacks.onClose);
  head.append(heading, close);
  const axesRoot = el(doc, 'div', { className: 'anytime-diagram-groupaxes' });
  const empty = el(doc, 'p', { className: 'anytime-diagram-groupdialog-empty' });
  const foot = el(doc, 'div', { className: 'anytime-diagram-groupdialog-foot' });
  const addAxis = el(doc, 'button', { attrs: { type: 'button' } });
  addAxis.addEventListener('click', callbacks.onAddAxis);
  foot.append(addAxis);
  box.append(head, axesRoot, empty, foot);
  root.appendChild(box);
  // 覆いそのものを押したら閉じる。箱の中の押下は閉じない（字を選ぶドラッグが外へ出て終わることがある）。
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) callbacks.onClose();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    callbacks.onClose();
  });

  const axes: AxisRow[] = [];
  /** 前回描いたときの軸の数。**足した軸へ焦点を移す**のに使う（-1 は閉じていた状態）。 */
  let rendered = -1;

  const lendAxis = (index: number): AxisRow => {
    const existing = axes[index];
    if (existing !== undefined) return existing;
    const axisRoot = el(doc, 'div', { className: 'anytime-diagram-groupaxis' });
    const axisHead = el(doc, 'div', { className: 'anytime-diagram-groupaxis-head' });
    const name = el(doc, 'input', { attrs: { type: 'text' } });
    const label = el(doc, 'label', { className: 'anytime-diagram-groupaxis-pick' });
    const selectCaption = doc.createTextNode('');
    const select = el(doc, 'select');
    label.append(selectCaption, select);
    const remove = el(doc, 'button', { text: '×', attrs: { type: 'button' } });
    axisHead.append(name, label, remove);
    const values = el(doc, 'div', { className: 'anytime-diagram-groupvalues' });
    const addValue = el(doc, 'button', { className: 'anytime-diagram-groupaddvalue', attrs: { type: 'button' } });
    axisRoot.append(axisHead, values, addValue);
    const held: AxisRow = {
      root: axisRoot, name, select, selectCaption, remove, values, addValue, rows: [], rendered: -1, axisId: '',
    };
    // 書き換えは**打ち終わってから**当てる（`change` は Enter と焦点外れで飛ぶ）。1 文字ごとに
    // 図を組み直すと、打っている最中の下書きが打鍵の数だけ積もる。
    name.addEventListener('change', () => callbacks.onRenameAxis(held.axisId, name.value));
    select.addEventListener('change', () => callbacks.onGroupValue(held.axisId, select.value));
    remove.addEventListener('click', () => callbacks.onRemoveAxis(held.axisId));
    addValue.addEventListener('click', () => callbacks.onAddValue(held.axisId));
    axesRoot.appendChild(axisRoot);
    axes.push(held);
    return held;
  };

  const lendValue = (axis: AxisRow, index: number): ValueRow => {
    const existing = axis.rows[index];
    if (existing !== undefined) return existing;
    const row = el(doc, 'div', { className: 'anytime-diagram-groupvalue' });
    const name = el(doc, 'input', { attrs: { type: 'text' } });
    const remove = el(doc, 'button', { text: '×', attrs: { type: 'button' } });
    row.append(name, remove);
    const held: ValueRow = { row, name, remove, value: '' };
    name.addEventListener('change', () => callbacks.onRenameValue(axis.axisId, held.value, name.value));
    remove.addEventListener('click', () => callbacks.onRemoveValue(axis.axisId, held.value));
    axis.values.appendChild(row);
    axis.rows.push(held);
    return held;
  };

  return {
    root,
    update(state) {
      addAxis.textContent = t('addGroupAxis');
      close.setAttribute('aria-label', t('closeGroups'));
      close.title = t('closeGroups');
      empty.textContent = t('groupsEmpty');
      setClass(root, 'is-open', state.selection !== null);
      if (state.selection === null) {
        // 閉じている間は中身を組み立てない（描画は指の動きごとに走る）。次に開いたときへ
        // 「増えた」を持ち越さないよう、数えた軸と選択肢の数も畳む（持ち越すと、開いた
        // とたんに既にあった選択肢へ焦点が飛び、打鍵 1 つでその名前が消える）。
        rendered = -1;
        for (const held of axes) held.rendered = -1;
        return;
      }
      root.setAttribute('aria-label', state.selection.label);
      heading.textContent = state.selection.label;
      addAxis.disabled = state.saving;
      setClass(empty, 'anytime-diagram-hidden', state.selection.axes.length > 0);
      for (const [index, axis] of state.selection.axes.entries()) {
        applyAxis(lendAxis(index), axis, state.selection.values, state.saving);
      }
      // 余った行は消さずに隠す（軸の数が変わるたびに作り直すと、打っている最中に焦点が飛ぶ）。
      for (const held of axes.slice(state.selection.axes.length)) {
        held.axisId = '';
        setClass(held.root, 'anytime-diagram-hidden', true);
      }
      /*
        足した軸へ焦点を移す。**増えたかどうかで決める**（どの軸を足したかは伝えてもらわない）。

        群の語彙を触るのはこのダイアログだけなので、描画の間に軸が増えるのは「いま押した」
        ときに限る。名前の無い軸は作れない決まりなので、足した直後に打てないと、既定の名前の
        まま残った軸が図に積もる。
      */
      const grown = rendered >= 0 && state.selection.axes.length > rendered;
      rendered = state.selection.axes.length;
      if (grown) focusInput(axes[rendered - 1]?.name);
    },
  };

  function applyAxis(
    held: AxisRow,
    axis: DiagramGroupAxis,
    values: Readonly<Record<string, string>>,
    saving: boolean,
  ): void {
    held.axisId = axis.id;
    setClass(held.root, 'anytime-diagram-hidden', false);
    held.name.setAttribute('aria-label', t('groupAxisName'));
    held.remove.setAttribute('aria-label', t('removeGroupAxis'));
    held.remove.title = t('removeGroupAxis');
    held.addValue.textContent = t('addGroupValue');
    held.selectCaption.nodeValue = `${t('groupValueFor')} `;
    held.select.setAttribute('aria-label', `${axis.label} ${t('groupValueFor')}`);
    // 打っている最中の字は上書きしない（描画は指の動きごとに走る）。
    setValue(held.name, axis.label);
    held.name.disabled = saving;
    held.remove.disabled = saving;
    held.addValue.disabled = saving;

    // 選択肢は**宣言から作る**（値を足した日に、ここだけ古い一覧のまま残らないように）。
    // 先頭の「なし」はその軸を落とす口。無いと、一度付けた群を画面から外せない。
    const options = [['', t('groupNone')] as const, ...Object.entries(axis.values)];
    const wanted = options.map(([value]) => value).join('\u0000');
    if (held.select.dataset.options !== wanted) {
      held.select.textContent = '';
      for (const [value] of options) held.select.appendChild(el(doc, 'option', { attrs: { value } }));
      held.select.dataset.options = wanted;
    }
    for (const [index, [, text]] of options.entries()) {
      held.select.options[index]!.textContent = text;
    }
    held.select.value = values[axis.id] ?? '';
    held.select.disabled = saving;

    const entries = Object.entries(axis.values);
    for (const [index, [value, text]] of entries.entries()) {
      const row = lendValue(held, index);
      row.value = value;
      setClass(row.row, 'anytime-diagram-hidden', false);
      setValue(row.name, text);
      row.name.setAttribute('aria-label', t('groupValueName'));
      row.name.disabled = saving;
      row.remove.disabled = saving;
      row.remove.setAttribute('aria-label', t('removeGroupValue'));
      row.remove.title = t('removeGroupValue');
    }
    for (const row of held.rows.slice(entries.length)) {
      row.value = '';
      setClass(row.row, 'anytime-diagram-hidden', true);
    }
    // 初めて描いたとき（-1）は「増えた」と見なさない。見なすと、開いたとたんに最後の選択肢へ
    // 焦点が飛び、字が選ばれた状態になる（打鍵 1 つで既にあった名前が消える）。
    const grown = held.rendered >= 0 && entries.length > held.rendered;
    held.rendered = entries.length;
    if (grown) focusInput(held.rows[entries.length - 1]?.name);
  }
}

/** 打っている最中の入力は上書きしない。上書きすると、1 文字打つたびに字が戻る。 */
function setValue(input: HTMLInputElement, text: string): void {
  if (input.ownerDocument.activeElement === input) return;
  if (input.value !== text) input.value = text;
}

/** 足した行へ焦点を移し、既定の名前を選んだ状態にする（そのまま打ち替えられる）。 */
function focusInput(input: HTMLInputElement | undefined): void {
  if (input === undefined) return;
  input.focus();
  input.select();
}
