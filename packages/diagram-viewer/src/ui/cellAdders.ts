/**
 * 空いた升目の真ん中に置く ＋。押すとその升目へ要素が 1 つ増える。
 *
 * 縁の ＋（`gutter.ts`）とは別物である。あちらは**行・列そのもの**を増やし、在る要素を右や下へ
 * ずらす。こちらは**要素**を増やし、他の要素を 1 つも動かさない。取り違えると図の形が大きく
 * 変わるので、置く場所（切れ目／升目の真ん中）と形（小さい丸／大きい角丸）を分ける。
 *
 * 縁の ＋ と同じく**画面に貼り付く**。図と一緒に流すと拡大縮小で ＋ まで伸び縮みし、縮めた図では
 * 押せない大きさになる。
 */

import {
  CELL_ADD_ICON_PX,
  type ChartView,
  columnCentreX,
  type DiagramSpacing,
  type GridCell,
  type GridExtent,
  rowCentreY,
  visibleCells,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el } from './dom';
import { createIcon } from './icons';
import { type BlockedBox, overlapsBox } from './overlap';

/**
 * 一度に描く ＋ の上限。
 *
 * 超えたら 1 つも描かない（`visibleCells` が空を返す）。間引くと「どの升目に ＋ が出るか」が
 * 読めなくなり、出ていない升目が「置けない升目」に見える。
 */
const MAX_CELL_ADDERS = 120;

export interface CellAdderCallbacks {
  onAddElement(cell: GridCell): void;
}

export interface CellAdderState {
  readonly editing: boolean;
  readonly saving: boolean;
  readonly spacing: DiagramSpacing;
  readonly view: ChartView;
  readonly frame: { readonly width: number; readonly height: number };
  readonly extent: GridExtent;
  /** 要素が載っている升目の鍵。ここには出さない。 */
  readonly occupied: ReadonlySet<string>;
  /**
   * 枠の中で**別のものが載っている場所**（枠へ浮かせた札。操作列・ミニマップ・選択の区画）。
   *
   * ここに掛かる升目の ＋ は**描かない**。縁の ＋／− のように脇へ逃がせないのは、この ＋ の
   * 位置が升目そのものだから — 動かすと別の升目へ要素を足すことになる。
   */
  readonly blocked?: readonly BlockedBox[];
}

export interface CellAdderView {
  readonly root: HTMLDivElement;
  update(state: CellAdderState): void;
}

export function createCellAdderView(
  doc: Document,
  t: DiagramT,
  callbacks: CellAdderCallbacks,
): CellAdderView {
  const root = el(doc, 'div', {
    className: 'anytime-diagram-celladd anytime-diagram-hidden',
    attrs: { role: 'group' },
  });
  const buttons = new Map<string, HTMLButtonElement>();

  return {
    root,
    update(state) {
      // 文言は毎回当てる（作るときに焼き込むと、locale を差し替えても前の言語のまま残る）。
      root.setAttribute('aria-label', t('addElement'));
      root.classList.toggle('anytime-diagram-hidden', !state.editing);
      if (!state.editing) {
        for (const button of buttons.values()) button.remove();
        buttons.clear();
        return;
      }
      const seen = new Set<string>();
      for (const cell of placements(state)) {
        const key = `${cell.column},${cell.row}`;
        seen.add(key);
        const button = buttons.get(key) ?? adopt(key, createButton(doc, cell, callbacks));
        // 位置と文言は毎回当てる（図を平行移動するたびに画面上の位置が変わる）。
        button.disabled = state.saving;
        const label = t('addElementAt', { column: cell.column + 1, row: cell.row + 1 });
        button.setAttribute('aria-label', label);
        button.title = label;
        button.style.left = `${screenX(state, cell)}px`;
        button.style.top = `${screenY(state, cell)}px`;
      }
      for (const [key, button] of buttons) {
        if (seen.has(key)) continue;
        button.remove();
        buttons.delete(key);
      }
    },
  };

  function adopt(key: string, button: HTMLButtonElement): HTMLButtonElement {
    buttons.set(key, button);
    root.appendChild(button);
    return button;
  }
}

const screenX = (state: CellAdderState, cell: GridCell): number =>
  state.view.x + columnCentreX(state.spacing, cell.column) * state.view.scale;

const screenY = (state: CellAdderState, cell: GridCell): number =>
  state.view.y + rowCentreY(state.spacing, cell.row) * state.view.scale;

/** 描く升目。画面に映るもののうち、見え方の操作の区画に掛からないものだけ。 */
function placements(state: CellAdderState): readonly GridCell[] {
  return visibleCells({
    spacing: state.spacing,
    extent: state.extent,
    view: state.view,
    frame: state.frame,
    occupied: state.occupied,
    limit: MAX_CELL_ADDERS,
  }).filter((cell) => !overlapsBox(screenX(state, cell), screenY(state, cell), CELL_ADD_ICON_PX / 2, state.blocked));
}

function createButton(doc: Document, cell: GridCell, callbacks: CellAdderCallbacks): HTMLButtonElement {
  const button = el(doc, 'button', { attrs: { type: 'button' } });
  // 字ではなく線画で描く（記号の文字は字形を持たない環境で豆腐になる）。
  button.appendChild(createIcon(doc, 'addElement', 18));
  button.addEventListener('click', () => callbacks.onAddElement(cell));
  return button;
}
