import { COOCCURRENCE_NOTE_MAX_LENGTH } from '@anytime-markdown/graph-core';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { createPanelButton, ensureButtonBaseStyles } from './buttonBaseStyle';

/**
 * メモの編集欄（設計書 §3.3）。語・共起・クラスタの 3 タブが同じ形を共有する。
 *
 * Why not 各パネルへ直接書くか: 3 箇所で別々に組むと、複数行入力・設定と削除の分離・
 * 上限の扱いのどれかが 1 箇所だけ抜けても、他の 2 箇所が正しいために気づけない。
 */
export interface NoteEditorHandle {
  element: HTMLElement;
  /** 選択中の対象のメモを流し込む。対象が無いときは undefined。 */
  setValue(note: string | undefined): void;
  /** 入力中の本文。 */
  value(): string;
  setT(t: CooccurrenceT): void;
}

export interface NoteEditorOptions {
  t: CooccurrenceT;
  onSet(text: string): void;
  onRemove(): void;
}

const STYLE_ID = 'cooccurrence-note-editor-style';

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-note-editor{flex:0 0 auto;display:flex;flex-direction:column;gap:6px}
.cooc-note-editor__input{box-sizing:border-box;min-height:56px;resize:vertical;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-note-editor__buttons{display:flex;gap:6px;flex-wrap:wrap}
.cooc-note-editor__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 8px;font:12px system-ui,sans-serif}
.cooc-note-editor__button:hover{background:var(--cooc-action-hover)}
`;
  document.head.appendChild(style);
}

export function createNoteEditor(options: NoteEditorOptions): NoteEditorHandle {
  ensureStyles();
  let t = options.t;

  const element = document.createElement('div');
  element.className = 'cooc-note-editor';

  const input = document.createElement('textarea');
  input.className = 'cooc-note-editor__input';
  input.placeholder = t('note.placeholder');
  input.setAttribute('aria-label', t('note.label'));
  // 上限を超える入力は検証で拒否されるが（§2.6）、入力の時点で止めたほうが、書いた後に
  // 全部を捨てさせるより手戻りが小さい。検証は残す（MCP 経路など UI を通らない入力があるため）。
  input.maxLength = COOCCURRENCE_NOTE_MAX_LENGTH;

  const buttons = document.createElement('div');
  buttons.className = 'cooc-note-editor__buttons';
  const setButton = createPanelButton('cooc-note-editor__button');
  setButton.textContent = t('note.set');
  const removeButton = createPanelButton('cooc-note-editor__button');
  removeButton.textContent = t('note.remove');
  buttons.append(setButton, removeButton);
  element.append(input, buttons);

  setButton.addEventListener('click', () => options.onSet(input.value));
  removeButton.addEventListener('click', () => options.onRemove());

  return {
    element,
    setValue(note): void {
      // 入力中の本文を全再描画で消さない（フォーカスがあるあいだは触らない）。
      if (document.activeElement === input) return;
      input.value = note ?? '';
    },
    value: () => input.value,
    setT(nextT): void {
      t = nextT;
      input.placeholder = t('note.placeholder');
      input.setAttribute('aria-label', t('note.label'));
      setButton.textContent = t('note.set');
      removeButton.textContent = t('note.remove');
    },
  };
}
