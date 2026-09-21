/**
 * 行・列を増やす ＋ と、空の行・列を詰める − を並べる層。
 *
 * **画面に貼り付く**（図と一緒には流れない）。図と一緒に流すと、幅 1 万 px の図で右の方を
 * 見ているときに上端・左端のアイコンが画面の外へ出て、そこまで戻らないと行・列を足せない。
 *
 * 描く本数は**画面に映る切れ目だけ**に絞る（`visibleGutterIndices`）。枠の外のものは
 * `overflow: hidden` で見えなくなるが**タブ順からは外れない**うえ、図の形しだいで数千個まで
 * 増えうる。
 */

import {
  type ChartView,
  columnBoundaryX,
  columnCentreX,
  columnPitch,
  type DiagramSpacing,
  type GridAxis,
  GUTTER_ICON_PX,
  rowBoundaryY,
  rowCentreY,
  rowPitch,
  visibleGutterIndices,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import type { GridLines } from '../model';
import { GUTTER_TRACK_PX } from '../theme/diagramStyles';
import { el } from './dom';
import { type BlockedBox, overlapsBox } from './overlap';

export interface GutterCallbacks {
  onEditGridLine(axis: GridAxis, index: number, kind: 'insert' | 'remove'): void;
}

export interface GutterState {
  readonly editing: boolean;
  readonly saving: boolean;
  readonly spacing: DiagramSpacing;
  readonly view: ChartView;
  readonly frame: { readonly width: number; readonly height: number };
  readonly lines: GridLines;
  /**
   * 枠の中で**別のものが載っている場所**（見え方の操作を浮かせた区画）。ここへは ＋／− を置かない。
   *
   * 重ねると、上に載っているほうが押下を取り、押したつもりの切れ目とは違う位置へ挿入される
   * （挿入は最大で全員を升目へ固定するので、取り違えの取り消しが重い）。隠れた切れ目は図を
   * 平行移動すれば操作の区画の外へ出てくる。
   */
  readonly blocked?: readonly BlockedBox[];
}

export interface GutterView {
  readonly root: HTMLDivElement;
  update(state: GutterState): void;
}

export interface Spec {
  readonly key: string;
  readonly axis: GridAxis;
  readonly kind: 'insert' | 'remove';
  readonly index: number;
  readonly left: number | null;
  readonly top: number | null;
  readonly label: string;
}

export function createGutterView(doc: Document, t: DiagramT, callbacks: GutterCallbacks): GutterView {
  const root = el(doc, 'div', {
    className: 'anytime-diagram-gutter anytime-diagram-hidden',
    attrs: { role: 'group' },
  });
  const buttons = new Map<string, HTMLButtonElement>();

  return {
    root,
    update(state) {
      // 文言は毎回当てる（作るときに焼き込むと、locale を差し替えても前の言語のまま残る）。
      root.setAttribute('aria-label', t('gridLines'));
      const visible = state.editing && state.lines.shiftable;
      root.classList.toggle('anytime-diagram-hidden', !visible);
      if (!visible) {
        for (const button of buttons.values()) button.remove();
        buttons.clear();
        return;
      }
      const seen = new Set<string>();
      for (const spec of buildSpecs(state, t).filter((spec) => !covered(spec, state.blocked))) {
        seen.add(spec.key);
        const button = buttons.get(spec.key)
          ?? adopt(spec.key, createButton(doc, spec, callbacks));
        applySpec(button, spec, state.saving);
      }
      for (const [key, button] of buttons) {
        if (seen.has(key)) continue;
        button.remove();
        buttons.delete(key);
      }
    },
  };

  /** 作ったばかりのアイコンを控えへ入れて図の縁へ置く。 */
  function adopt(key: string, button: HTMLButtonElement): HTMLButtonElement {
    buttons.set(key, button);
    root.appendChild(button);
    return button;
  }
}

function createButton(doc: Document, spec: Spec, callbacks: GutterCallbacks): HTMLButtonElement {
  const button = el(doc, 'button', {
    className: `anytime-diagram-gutter-icon is-${spec.axis} ${spec.kind === 'remove' ? 'is-remove' : 'is-insert'}`,
    text: spec.kind === 'insert' ? '＋' : '−',
    attrs: { type: 'button' },
  });
  button.addEventListener('click', () => callbacks.onEditGridLine(spec.axis, spec.index, spec.kind));
  return button;
}

/** 位置と文言は毎回当てる。図を平行移動するたびに縁のアイコンの画面上の位置が変わる。 */
function applySpec(button: HTMLButtonElement, spec: Spec, saving: boolean): void {
  button.disabled = saving;
  button.setAttribute('aria-label', spec.label);
  button.title = spec.label;
  button.style.left = spec.left === null ? '' : `${spec.left}px`;
  button.style.top = spec.top === null ? '' : `${spec.top}px`;
}

/**
 * そのアイコンが「別のものが載っている場所」に入るか。
 *
 * 列のアイコンは縦位置が、行のアイコンは横位置が、それぞれスタイルシート側で帯に固定されている
 * （`GUTTER_TRACK_PX`）。`null` の側はその固定値で測る — ここを 0 とみなすと、枠の上端に居ない
 * アイコンまで隠れた扱いになる。
 */
export function covered(spec: Spec, blocked: GutterState['blocked']): boolean {
  return overlapsBox(spec.left ?? GUTTER_TRACK_PX, spec.top ?? GUTTER_TRACK_PX, GUTTER_ICON_PX / 2, blocked);
}

function buildSpecs(state: GutterState, t: DiagramT): readonly Spec[] {
  const { spacing, view, frame, lines } = state;
  const at = (chartX: number | null, chartY: number | null) => ({
    left: chartX === null ? null : view.x + chartX * view.scale,
    top: chartY === null ? null : view.y + chartY * view.scale,
  });
  const indices = (
    count: number,
    position: (spacing: DiagramSpacing, index: number) => number,
    offset: number,
    frameSize: number,
    pitch: number,
  ) => visibleGutterIndices({
    count, at: (index) => position(spacing, index), offset, scale: view.scale, frame: frameSize, pitch,
  });

  const specs: Spec[] = [];
  for (const index of indices(lines.last.column + 1, columnBoundaryX, view.x, frame.width, columnPitch(spacing))) {
    specs.push({
      key: `ci${index}`, axis: 'column', kind: 'insert', index,
      ...at(columnBoundaryX(spacing, index), null),
      label: t('insertColumnAt', { n: index + 1 }),
    });
  }
  for (const index of indices(lines.last.row + 1, rowBoundaryY, view.y, frame.height, rowPitch(spacing))) {
    specs.push({
      key: `ri${index}`, axis: 'row', kind: 'insert', index,
      ...at(null, rowBoundaryY(spacing, index)),
      label: t('insertRowAt', { n: index + 1 }),
    });
  }
  for (const index of indices(lines.last.column, columnCentreX, view.x, frame.width, columnPitch(spacing))) {
    if (lines.columns.has(index)) continue;
    specs.push({
      key: `cr${index}`, axis: 'column', kind: 'remove', index,
      ...at(columnCentreX(spacing, index), null),
      label: t('removeColumnAt', { n: index + 1 }),
    });
  }
  for (const index of indices(lines.last.row, rowCentreY, view.y, frame.height, rowPitch(spacing))) {
    if (lines.rows.has(index)) continue;
    specs.push({
      key: `rr${index}`, axis: 'row', kind: 'remove', index,
      ...at(null, rowCentreY(spacing, index)),
      label: t('removeRowAt', { n: index + 1 }),
    });
  }
  return specs;
}
