import type { NotePopupState } from '../types';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { placeNotePopup } from './notePopupModel';

/**
 * ホバーのポップアップ（設計書 §3.1）。語・共起・クラスタで 1 枚を共有する。
 *
 * Why not canvas へ描くか: メモは自由記述で長さも改行位置も事前に決まらず、canvas には
 * 折り返しが無い。加えてクラスタは図の中に図形を持たず、発火点がパネル側（canvas の外）に
 * なる。同じ情報に 2 通りの見た目を作らないため、3 種類とも DOM の 1 枚に寄せる。
 */
export interface NotePopupHandle {
  element: HTMLElement;
  /**
   * 表示する。`anchor` は `container` の左上を原点とする座標。
   *
   * 同じ対象を続けて渡したときは中身を作り直さない（ポインタの移動のたびに DOM を捨てると、
   * メモの本文を選択している最中に選択が外れる）。
   */
  show(state: NotePopupState, anchor: { x: number; y: number }): void;
  hide(): void;
  /** 観測点。出ていなければ null（設計書 §6.4）。 */
  getState(): NotePopupState | null;
  setT(t: CooccurrenceT): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-note-popup-style';

/** 対象からの逃がし幅。カーソルの直下に出すと、ポインタ自身が本文の先頭を覆う。 */
const ANCHOR_OFFSET = 14;
/** 表示領域の縁との最小の間隔。 */
const EDGE_MARGIN = 8;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-note-popup{position:absolute;z-index:3;max-width:280px;box-sizing:border-box;padding:8px 10px;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-tooltip-bg,var(--cooc-surface));color:var(--cooc-text);font:12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.28)}
.cooc-note-popup[hidden]{display:none}
.cooc-note-popup__title{font-weight:600;overflow-wrap:anywhere}
.cooc-note-popup__detail{color:var(--cooc-text-secondary)}
.cooc-note-popup__note{margin-top:6px;padding-top:6px;border-top:1px solid var(--cooc-divider);white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}
`;
  document.head.appendChild(style);
}

function sameTarget(a: NotePopupState | null, b: NotePopupState): boolean {
  return a !== null && a.kind === b.kind && a.index === b.index && a.note === b.note && a.title === b.title;
}

export interface NotePopupOptions {
  /** ポップアップを載せる要素。位置はこの要素の左上を原点とする。 */
  container: HTMLElement;
  t: CooccurrenceT;
}

export function createNotePopup(options: NotePopupOptions): NotePopupHandle {
  ensureStyles();
  let t = options.t;
  let state: NotePopupState | null = null;

  const element = document.createElement('div');
  element.className = 'cooc-note-popup';
  element.hidden = true;
  // ポインタを乗せられると、その瞬間に対象から外れて自分自身が消える（消えるとまた対象へ
  // 戻り、点滅する）。本文の選択はポインタを乗せずに行えないため、選択より点滅の回避を採る。
  element.style.pointerEvents = 'none';
  element.setAttribute('role', 'tooltip');
  element.setAttribute('aria-label', t('note.popupLabel'));
  options.container.appendChild(element);

  function renderContent(next: NotePopupState): void {
    element.replaceChildren();
    const title = document.createElement('div');
    title.className = 'cooc-note-popup__title';
    title.textContent = next.title;
    element.appendChild(title);
    for (const detail of next.details) {
      const line = document.createElement('div');
      line.className = 'cooc-note-popup__detail';
      line.textContent = detail;
      element.appendChild(line);
    }
    if (next.note === undefined) return;
    const note = document.createElement('div');
    note.className = 'cooc-note-popup__note';
    // 改行を保つのは CSS（white-space:pre-wrap）。textContent へそのまま入れる。
    note.textContent = next.note;
    element.appendChild(note);
  }

  function place(anchor: { x: number; y: number }): void {
    const bounds = options.container.getBoundingClientRect();
    const { left, top } = placeNotePopup({
      anchor,
      size: { width: element.offsetWidth, height: element.offsetHeight },
      bounds: { width: bounds.width, height: bounds.height },
      offset: ANCHOR_OFFSET,
      margin: EDGE_MARGIN,
    });
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  return {
    element,
    show(next, anchor): void {
      if (!sameTarget(state, next)) renderContent(next);
      state = next;
      element.hidden = false;
      place(anchor);
    },
    hide(): void {
      if (state === null) return;
      state = null;
      element.hidden = true;
    },
    getState: () => state,
    setT(nextT): void {
      t = nextT;
      element.setAttribute('aria-label', t('note.popupLabel'));
    },
    destroy(): void {
      element.remove();
    },
  };
}
