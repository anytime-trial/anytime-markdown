/**
 * 線の中点に出す取っ手。**そこから線を 1 本引ける。**
 *
 * 札の接続点（`nodes.ts`）と同じ役目を、線に対して果たす。別の部品にしてあるのは、札は図に居る
 * 人物ぶんしか無いのに対し、**線は描けている本数ぶんだけ現れては消える**ため。札の側の作り
 * （1 人 1 つを作り直さずに更新する）をそのまま当てると、線が 1 本増えた瞬間に全部の札を
 * 組み立て直すことになる。
 *
 * 取っ手は**中点の数に合わせて貸し借りする**（使わない間は隠す）。毎回作り直すと、掴んでいる
 * 取っ手そのものが入れ替わってポインタの捕捉が外れ、引きかけの線が指から離れる。
 */

import { type DiagramAnchor, sameAnchor } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import type { LineMidpoint } from '../model';
import { el, setClass } from './dom';

export interface MidpointCallbacks {
  onConnectPointerDown(event: PointerEvent, anchor: DiagramAnchor): void;
  onConnectPointerMove(event: PointerEvent): void;
  onConnectPointerUp(event: PointerEvent): void;
  /** キーボードから押した（始点として待ち受ける／待ち受け中の始点と結ぶ）。 */
  onConnectToggle(anchor: DiagramAnchor): void;
  /**
   * 字の書き換えへ入る。**取っ手そのものも受け口にする。**
   *
   * 取っ手は線の中点に載っており、**線の真ん中を狙った押下は必ずここへ来る**（実機で観測。
   * 線をダブルクリックしたつもりが、取っ手が先に受け取って線を引き始めていた）。線の上の
   * どこを叩いても同じことが起きるように、取っ手からも同じ口を呼ぶ。
   */
  onEditLabel(anchor: DiagramAnchor): void;
}

export interface MidpointState {
  readonly midpoints: readonly LineMidpoint[];
  readonly editing: boolean;
  readonly saving: boolean;
  /** いま始点として待ち受けている端。線どうしを結ぶときに光らせる。 */
  readonly connectSource: DiagramAnchor | null;
}

export interface MidpointView {
  readonly root: HTMLDivElement;
  update(state: MidpointState): void;
}

export function createMidpointView(
  doc: Document,
  t: DiagramT,
  callbacks: MidpointCallbacks,
): MidpointView {
  const root = el(doc, 'div', { className: 'anytime-diagram-midpoints' });
  /** 貸し出し中の取っ手。指している端は描画のたびに差し替える。 */
  const handles: { readonly button: HTMLButtonElement; anchor: DiagramAnchor | null }[] = [];

  const lend = (index: number) => {
    const existing = handles[index];
    if (existing !== undefined) return existing;
    const button = el(doc, 'button', {
      className: 'anytime-diagram-midpoint',
      attrs: { type: 'button' },
    });
    const held = { button, anchor: null as DiagramAnchor | null };
    button.addEventListener('pointerdown', (event) => {
      // 押下を親へ渡さない。渡すと、線を引き始めたはずの指が図を平行移動させる。
      event.stopPropagation();
      if (held.anchor !== null) callbacks.onConnectPointerDown(event, held.anchor);
    });
    button.addEventListener('pointermove', callbacks.onConnectPointerMove);
    button.addEventListener('pointerup', callbacks.onConnectPointerUp);
    button.addEventListener('pointercancel', callbacks.onConnectPointerUp);
    // キーボードからの押下だけをここで拾う（`detail === 0`）。指の押下は pointer 系で完結して
    // おり、click まで拾うと 1 回の操作で 2 度数える（札の接続点と同じ約束）。
    button.addEventListener('click', (event) => {
      if (event.detail !== 0 || held.anchor === null) return;
      callbacks.onConnectToggle(held.anchor);
    });
    button.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (held.anchor !== null) callbacks.onEditLabel(held.anchor);
    });
    root.appendChild(button);
    handles.push(held);
    return held;
  };

  return {
    root,
    update(state) {
      setClass(root, 'anytime-diagram-hidden', !state.editing);
      const shown = state.editing ? state.midpoints : [];
      for (const [index, midpoint] of shown.entries()) {
        const held = lend(index);
        held.anchor = midpoint.anchor;
        held.button.style.left = `${midpoint.x}px`;
        held.button.style.top = `${midpoint.y}px`;
        held.button.disabled = state.saving;
        held.button.setAttribute('aria-label', t('connectFromLine'));
        // 吹き出しも**毎回当てる**。作るときに焼き込むと、locale を差し替えても取っ手だけ前の言語で残る
        // （中点の取っ手は locale の差し替えで作り直さない部品なので、焼き込みが残り続ける）。
        held.button.title = t('connectFromLine');
        // 端の指し先は `data-line-anchor` で DOM へ出す。指を離した位置から相手を引くとき、
        // 座標で最寄りを探さずに済む（座標で探すと、重なった線のどちらを掴んだか決められない）。
        held.button.setAttribute('data-line-anchor', midpoint.key);
        setClass(held.button, 'anytime-diagram-hidden', false);
        setClass(held.button, 'is-connect-source',
          state.connectSource !== null && sameAnchor(state.connectSource, midpoint.anchor));
      }
      // 余った取っ手は**消さずに隠す**（数が増減するたびに作り直すと捕捉が外れる）。
      for (const held of handles.slice(shown.length)) {
        held.anchor = null;
        setClass(held.button, 'anytime-diagram-hidden', true);
      }
    },
  };
}
