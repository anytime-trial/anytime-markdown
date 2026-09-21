/**
 * 図の見え方の操作（拡大・縮小・全体表示・初期表示）。**図の枠の中**に浮かせる。
 *
 * 操作列（枠の外）から移したのは、対象と操作を同じ場所へ置くため。枠の外に並べると、幅 1 万 px の
 * 図を見ながら視線と指が上の帯へ往復する。地図と同じく、動かす対象の上に操作を重ねる。
 *
 * 札は字ではなく線画にする（`icons.ts`）。倍率だけは**値**なので字のまま残す — 「いまどれだけ
 * 縮んでいるか」は絵で表せない。
 */

import type { DiagramT } from '../i18n';
import { el, setText } from './dom';
import { createIcon, type DiagramIcon } from './icons';

export interface ViewControlsCallbacks {
  onZoom(factor: number): void;
  onFit(): void;
  onResetView(): void;
}

export interface ViewControlsState {
  readonly scale: number;
  readonly minScale: number;
  readonly maxScale: number;
}

export interface ViewControlsView {
  readonly root: HTMLElement;
  update(state: ViewControlsState): void;
}

export function createViewControls(
  doc: Document,
  t: DiagramT,
  callbacks: ViewControlsCallbacks,
): ViewControlsView {
  const root = el(doc, 'div', {
    className: 'anytime-diagram-viewcontrols',
    attrs: { role: 'group' },
  });

  const zoomOut = iconButton(doc, 'zoomOut', () => callbacks.onZoom(1 / 1.25));
  const level = el(doc, 'output', { className: 'anytime-diagram-zoomlevel', attrs: { 'aria-live': 'polite' } });
  const zoomIn = iconButton(doc, 'zoomIn', () => callbacks.onZoom(1.25));
  const fit = iconButton(doc, 'fit', callbacks.onFit);
  const reset = iconButton(doc, 'reset', callbacks.onResetView);
  root.append(zoomOut, level, zoomIn, fit, reset);

  return {
    root,
    update(state) {
      // 文言は毎回当てる（作るときに焼き込むと、locale を差し替えても前の言語のまま残る）。
      root.setAttribute('aria-label', t('controls'));
      label(zoomOut, t('zoomOut'));
      label(zoomIn, t('zoomIn'));
      label(fit, t('fit'));
      label(reset, t('reset'));
      setText(level, `${Math.round(state.scale * 100)}%`);
      zoomOut.disabled = state.scale <= state.minScale;
      zoomIn.disabled = state.scale >= state.maxScale;
    },
  };
}

/** 絵だけのボタンは、名前を `aria-label` と `title` の両方へ置く（読み上げと吹き出しの両方）。 */
function label(button: HTMLButtonElement, text: string): void {
  button.setAttribute('aria-label', text);
  button.title = text;
}

function iconButton(doc: Document, name: DiagramIcon, onClick: () => void): HTMLButtonElement {
  const button = el(doc, 'button', { attrs: { type: 'button' } });
  button.appendChild(createIcon(doc, name));
  button.addEventListener('click', onClick);
  return button;
}
