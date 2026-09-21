/**
 * 線に添える字の層。**閲覧中も出す**（字は図の中身であって、編集の道具ではない）。
 *
 * 字は線の**中点**に出す。中点は取っ手（`midpoints.ts`）と同じ点で、経路の引き回しに依らず
 * 両端の真ん中に決まる（`midpointOf`）。位置をここで別に導くと、引き回しを選び直した図で
 * 字と取っ手が離れる。
 *
 * 書き換え口は**1 つだけ**持ち、打っている線の中点へ移して使う。線 1 本ごとに入力を持たせると、
 * 線の数ぶんの入力が図に隠れたまま並び、読み上げの巡回にも出る。
 *
 * 図の面（`surface`）へ載せるので、平行移動や拡大では図と一緒に動く（枠に貼ると離れる）。
 */

import { type DiagramAnchor, sameAnchor } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import type { LineMidpoint } from '../model';
import { el, setClass } from './dom';

export interface LineLabelCallbacks {
  /** 字の書き換えを始める（線の上か、出ている字を叩いた）。 */
  onStartLabel(anchor: DiagramAnchor): void;
  /** 確定する。空にすると字そのものが落ちる。 */
  onCommitLabel(anchor: DiagramAnchor, text: string): void;
  onCancelLabel(): void;
}

export interface LineLabelState {
  readonly midpoints: readonly LineMidpoint[];
  readonly editing: boolean;
  readonly saving: boolean;
  /** いま字を打っている線。`null` なら打っていない。 */
  readonly labelling: DiagramAnchor | null;
  /**
   * 濃く出す線の端の鍵（`anchorKey`）。`null` は**絞っていない**（全部濃い）。
   *
   * 空の集合と `null` を分ける。閲覧中に要素を選んで関わる線が 0 本だったときは空の集合が来て
   * すべての字が薄くなる — それが正しい。`null` に畳むと「絞ったのに全部濃い」になる。
   */
  readonly focusKeys: ReadonlySet<string> | null;
}

export interface LineLabelView {
  readonly root: HTMLDivElement;
  update(state: LineLabelState): void;
}

export function createLineLabelView(
  doc: Document,
  t: DiagramT,
  callbacks: LineLabelCallbacks,
): LineLabelView {
  const root = el(doc, 'div', { className: 'anytime-diagram-linelabels' });

  /** 貸し出し中の札。指している線は描くたびに差し替える。 */
  const chips: { readonly chip: HTMLElement; anchor: DiagramAnchor | null }[] = [];

  const lend = (index: number) => {
    const existing = chips[index];
    if (existing !== undefined) return existing;
    const chip = el(doc, 'span', { className: 'anytime-diagram-linelabel' });
    const held = { chip, anchor: null as DiagramAnchor | null };
    chip.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (held.anchor !== null) callbacks.onStartLabel(held.anchor);
    });
    // 押下を親へ渡さない。渡すと、字を叩いたつもりの指が図を平行移動させる。
    chip.addEventListener('pointerdown', (event) => event.stopPropagation());
    root.appendChild(chip);
    chips.push(held);
    return held;
  };

  /**
   * 書き換え口。**常に作り、使わない間は隠す**（名札・注記と同じ理由 — 作った瞬間は焦点を
   * 持たない要素なので、打ち始める前に 1 度焦点が図の外へ落ちる）。
   */
  const input = el(doc, 'input', {
    className: 'anytime-diagram-linelabel-input anytime-diagram-hidden',
    attrs: { type: 'text' },
  });
  /** いま打っている線。`null` なら打っていない。二重の確定を 1 度に絞るために覚える。 */
  let editing: DiagramAnchor | null = null;

  /**
   * 書き換えを畳む。**畳んだ後の呼び出しは捨てる。**
   *
   * 確定すると図が組み直され、入力が隠れる瞬間に `blur` が飛ぶ。捨てないと、その `blur` が
   * 2 度目の確定を起こす（名札の書き換えで実機に出た破れと同じ形）。
   */
  const finish = (commit: boolean): void => {
    const anchor = editing;
    if (anchor === null) return;
    editing = null;
    if (commit) callbacks.onCommitLabel(anchor, input.value);
    else callbacks.onCancelLabel();
  };

  input.addEventListener('pointerdown', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finish(event.key === 'Enter');
  });
  // 焦点を失ったときも確定する（取り消し扱いにすると、打ち終えて図の外を押した人の入力が消える）。
  input.addEventListener('blur', () => finish(true));
  root.appendChild(input);

  return {
    root,
    update(state) {
      const shown = state.midpoints.filter((midpoint) =>
        midpoint.label !== '' && !isLabelling(state, midpoint));
      for (const [index, midpoint] of shown.entries()) {
        const held = lend(index);
        held.anchor = midpoint.anchor;
        held.chip.textContent = midpoint.label;
        held.chip.style.left = `${midpoint.x}px`;
        held.chip.style.top = `${midpoint.y}px`;
        held.chip.title = state.editing ? t('lineLabelEdit') : midpoint.label;
        // 字も線と一緒に薄くする（線が消えかけているのに字だけ濃いと、どの線のものか読めない）。
        setClass(held.chip, 'is-line-dimmed', state.focusKeys !== null && !state.focusKeys.has(midpoint.key));
        // 叩いて書き換えられるのは編集中だけ。閲覧中は素通りさせる（下の線を押せるように）。
        setClass(held.chip, 'is-editable', state.editing && !state.saving);
        setClass(held.chip, 'anytime-diagram-hidden', false);
      }
      // 余った札は消さずに隠す（線の増減のたびに作り直すと、打っている最中に焦点が飛ぶ）。
      for (const held of chips.slice(shown.length)) {
        held.anchor = null;
        setClass(held.chip, 'anytime-diagram-hidden', true);
      }

      const at = state.labelling === null
        ? undefined
        : state.midpoints.find((midpoint) => isLabelling(state, midpoint));
      setClass(input, 'anytime-diagram-hidden', at === undefined);
      if (at === undefined) {
        // 図の側から畳まれた（別の線を選んだ・編集を抜けた）。控えも畳んでおかないと、
        // 次に開いた入力の `blur` が前の線を書き換える。
        editing = null;
        return;
      }
      input.style.left = `${at.x}px`;
      input.style.top = `${at.y}px`;
      input.disabled = state.saving;
      input.setAttribute('aria-label', t('lineLabelEdit'));
      if (editing === null || !sameAnchor(editing, at.anchor)) {
        editing = at.anchor;
        input.value = at.label;
        input.focus();
        input.select();
      }
    },
  };
}

/** その中点が、いま字を打っている線のものか。 */
function isLabelling(state: LineLabelState, midpoint: LineMidpoint): boolean {
  return state.labelling !== null && sameAnchor(state.labelling, midpoint.anchor);
}
