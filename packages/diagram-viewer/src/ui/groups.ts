/**
 * 群の値を選び直す帯。**家族 1 件ぶんの軸を並べる。**
 *
 * 軸の数は図ごとに違う（`groups` の宣言しだい）ので、選び口は貸し借りする。作るときに数を
 * 決め打つと、軸を 1 本足した図でその軸だけ選べない。
 *
 * 線の見た目の帯と同じ場所（枠の左下）へ置く。対象（押した札の中段）と、それに効く操作を
 * 同じ場所に集めるため。
 */

import type { DiagramGroupAxis } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setClass } from './dom';

export interface GroupCallbacks {
  /** 軸 1 本の値を選び直す。空文字はその軸を落とす。 */
  onGroupValue(axisId: string, value: string): void;
  onCloseGroups(): void;
}

export interface GroupSelection {
  /** 何の群かを示す見出し（その家族の親たち）。 */
  readonly label: string;
  readonly axes: readonly DiagramGroupAxis[];
  /** いまの値。軸 id → 値の鍵。持たない軸は「なし」。 */
  readonly values: Readonly<Record<string, string>>;
}

export interface GroupState {
  readonly selection: GroupSelection | null;
  readonly saving: boolean;
}

export interface GroupView {
  readonly root: HTMLElement;
  update(state: GroupState): void;
}

export function createGroupView(doc: Document, t: DiagramT, callbacks: GroupCallbacks): GroupView {
  const root = el(doc, 'div', {
    className: 'anytime-diagram-selection anytime-diagram-panel anytime-diagram-groupbar anytime-diagram-hidden',
    attrs: { role: 'group' },
  });
  const heading = el(doc, 'output', { attrs: { 'aria-live': 'polite' } });
  root.appendChild(heading);
  const close = el(doc, 'button', { text: '×', attrs: { type: 'button' } });
  close.addEventListener('click', callbacks.onCloseGroups);
  // 閉じるは**最後に置く**。軸の選び口はこの手前へ差し込むので、基準として先に入れておく。
  root.appendChild(close);

  /** 貸し出し中の選び口。軸の並びは図ごとに変わるので、指している軸は描くたびに差し替える。 */
  const lent: { readonly label: HTMLLabelElement; readonly caption: Text; readonly select: HTMLSelectElement; axisId: string }[] = [];

  const lend = (index: number) => {
    const existing = lent[index];
    if (existing !== undefined) return existing;
    const label = el(doc, 'label');
    const caption = doc.createTextNode('');
    const select = el(doc, 'select');
    label.append(caption, select);
    const held = { label, caption, select, axisId: '' };
    select.addEventListener('change', () => callbacks.onGroupValue(held.axisId, select.value));
    root.insertBefore(label, close);
    lent.push(held);
    return held;
  };

  return {
    root,
    update(state) {
      root.setAttribute('aria-label', t('groupValues'));
      close.setAttribute('aria-label', t('closeGroups'));
      close.title = t('closeGroups');
      setClass(root, 'anytime-diagram-hidden', state.selection === null);
      if (state.selection === null) return;
      heading.textContent = state.selection.label;
      for (const [index, axis] of state.selection.axes.entries()) {
        const held = lend(index);
        held.axisId = axis.id;
        held.caption.nodeValue = `${axis.label} `;
        // 選択肢は**宣言から作る**（軸の値を足した日に、ここだけ古い一覧のまま残らないように）。
        // 先頭の「なし」はその軸を落とす口。無いと、一度付けた群を画面から外せない。
        const options = [['', t('groupNone')] as const, ...Object.entries(axis.values)];
        const wanted = options.map(([value]) => value).join('\u0000');
        if (held.select.dataset.options !== wanted) {
          held.select.textContent = '';
          for (const [value] of options) held.select.appendChild(el(doc, 'option', { attrs: { value } }));
          held.select.dataset.options = wanted;
        }
        for (const [index_, [, text]] of options.entries()) {
          held.select.options[index_]!.textContent = text;
        }
        held.select.value = state.selection.values[axis.id] ?? '';
        held.select.disabled = state.saving;
        setClass(held.label, 'anytime-diagram-hidden', false);
      }
      // 余った選び口は消さずに隠す（軸の数が変わるたびに作り直すと焦点が飛ぶ）。
      for (const held of lent.slice(state.selection.axes.length)) {
        held.axisId = '';
        setClass(held.label, 'anytime-diagram-hidden', true);
      }
    },
  };
}
