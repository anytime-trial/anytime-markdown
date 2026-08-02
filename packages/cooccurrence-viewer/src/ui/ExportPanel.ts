import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import type { LayoutStatus } from '../types';
import { createPanelButton, ensureButtonBaseStyles } from './buttonBaseStyle';

/**
 * 保存タブの状態。
 *
 * Why not `capabilities` をそのまま渡すか: 「保存できるか」は capability だけでは決まらず、
 * ホストがコールバックを渡しているかにもよる。両側でそれぞれ判定すると条件が食い違い、
 * `capabilities.save` は true だが `onRequestSave` が無いホストで、押しても無言で終わる
 * ボタンが出る。判定は mount 側の 1 箇所に置き、ここへは解決済みの真偽値だけを渡す。
 */
export interface ExportPanelState {
  canSave: boolean;
  canExportPng: boolean;
  /** レイアウトの状態。反復を完了した計算だけが保存対象（仕様 §4.2）。 */
  layoutStatus: LayoutStatus;
  t: CooccurrenceT;
}

export interface ExportPanelOptions extends ExportPanelState {
  onRequestSave(): void;
  onExportPng(): void;
}

export interface ExportPanelHandle {
  readonly element: HTMLElement;
  update(state: ExportPanelState): void;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-export-panel-style';

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-export{display:flex;flex-direction:column;flex:1 1 auto;padding:12px;gap:10px}
.cooc-export__buttons{flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap}
.cooc-export__button{border:1px solid var(--cooc-divider);background:var(--cooc-surface);color:var(--cooc-text);border-radius:6px;padding:6px 10px;font:12px system-ui,sans-serif}
.cooc-export__button:hover:not(:disabled){background:var(--cooc-action-hover)}
.cooc-export__button:disabled{color:var(--cooc-text-disabled);cursor:default}
.cooc-export__note{flex:0 0 auto;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

/**
 * 保存と PNG の操作面（仕様 §3.4・§3.5）。
 *
 * ホストが提供しない機能はボタンを作らない（§6.3）。どちらも提供されないホストでは
 * このパネル自体を出さない判断を mount 側が行う。
 */
export function createExportPanel(options: ExportPanelOptions): ExportPanelHandle {
  ensureStyles();
  let state: ExportPanelState = options;

  const element = document.createElement('section');
  element.className = 'cooc-export';
  const buttons = document.createElement('div');
  buttons.className = 'cooc-export__buttons';
  const note = document.createElement('div');
  note.className = 'cooc-export__note';
  element.append(buttons, note);

  const save = createPanelButton('cooc-export__button');
  save.dataset.action = 'save';
  save.addEventListener('click', () => options.onRequestSave());

  const png = createPanelButton('cooc-export__button');
  png.dataset.action = 'export-png';
  png.addEventListener('click', () => options.onExportPng());

  function render(): void {
    const t = state.t;
    buttons.replaceChildren();
    if (state.canSave) buttons.appendChild(save);
    if (state.canExportPng) buttons.appendChild(png);

    save.textContent = t('export.save');
    png.textContent = t('export.png');

    // 中断・計算中の座標は保存対象でない（§4.2）。押しても何も起きない状態にすると、
    // 保存したつもりのまま閉じられる。押せない理由を出す。
    const ready = state.layoutStatus === 'done';
    save.disabled = !ready;
    note.textContent = state.canSave && !ready ? t('export.saveUnavailable') : '';
  }

  render();

  return {
    element,
    update(next: ExportPanelState): void {
      state = next;
      render();
    },
    destroy(): void {
      element.remove();
    },
  };
}
