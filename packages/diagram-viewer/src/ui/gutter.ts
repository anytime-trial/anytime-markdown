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
   * 枠の中で**別のものが載っている場所**（枠へ浮かせた札）。ここへ重なる ＋／− は**脇へ逃がす**。
   *
   * 重ねたままにすると、上に載っているほうが押下を取り、押したつもりの切れ目とは違う位置へ
   * 挿入される（挿入は最大で全員を升目へ固定するので、取り違えの取り消しが重い）。
   *
   * 逃がし先は**固定されている側**だけ（列の操作なら下、行の操作なら右）。もう一方は切れ目の
   * 位置そのものなので動かせない。かつては描かずに消していたが、操作列を枠の中へ移してからは
   * 隠れる切れ目が増え、「＋ が無い」と読まれるようになった（ユーザー指摘）。
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
      for (const spec of placed(buildSpecs(state, t), state)) {
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

/** 逃がしたアイコンと札の間に空ける隙間（px）。触れ合って 1 つの部品に見えないだけの幅。 */
const ESCAPE_GAP_PX = 6;

/** 逃がし先を数え直す上限。札の数より 1 回多く回せば、札から札へ玉突きしても必ず収束する。 */
const ESCAPE_TRIES = 8;

/** 描くアイコンを、載っている札を避けた位置で返す（避けきれないものは落とす）。 */
function placed(specs: readonly Spec[], state: GutterState): readonly Spec[] {
  const out: Spec[] = [];
  for (const spec of specs) {
    const moved = avoiding(spec, state.blocked, state.frame);
    if (moved !== null) out.push(moved);
  }
  return out;
}

/**
 * アイコンを「別のものが載っている場所」の外へ逃がす。掛かっていなければそのまま返す。
 *
 * 列のアイコンは縦位置が、行のアイコンは横位置が、それぞれスタイルシート側で帯に固定されている
 * （`GUTTER_TRACK_PX`）。`null` の側はその固定値で測る — ここを 0 とみなすと、枠の上端に居ない
 * アイコンまで掛かった扱いになる。
 *
 * **動かすのは固定されている側だけ**。列のアイコンなら札の下へ、行のアイコンなら札の右へ出す。
 * もう一方は切れ目そのものの位置で、動かすと押した先が変わってしまう。
 *
 * 逃げた先が枠の外になるなら `null`（描かない）。枠いっぱいの札に対してまで場所を探すと、
 * 見えない場所にタブ順だけが残る。
 */
export function avoiding(
  spec: Spec,
  blocked: GutterState['blocked'],
  frame: GutterState['frame'],
): Spec | null {
  if (blocked === undefined || blocked.length === 0) return spec;
  const half = GUTTER_ICON_PX / 2;
  /** 縦が固定されている（＝縦へ逃がせる）のは列のアイコン。行のアイコンはその逆。 */
  const down = spec.top === null;
  const start = (down ? spec.top : spec.left) ?? GUTTER_TRACK_PX;
  const limit = down ? frame.height : frame.width;
  /** 逃がす側の値で当たりを見る。切れ目そのものの位置（もう一方）は動かさない。 */
  const hit = (at: number): BlockedBox | undefined => {
    const x = down ? spec.left ?? GUTTER_TRACK_PX : at;
    const y = down ? at : spec.top ?? GUTTER_TRACK_PX;
    return blocked.find((box) => overlapsBox(x, y, half, [box]));
  };

  let value = start;
  for (let tries = 0; tries < ESCAPE_TRIES; tries += 1) {
    const box = hit(value);
    if (box === undefined) {
      if (value === start) return spec;
      return down ? { ...spec, top: value } : { ...spec, left: value };
    }
    value = (down ? box.bottom : box.right) + half + ESCAPE_GAP_PX;
    if (value + half > limit) return null;
  }
  // 札から札への玉突きが収束しないほど詰まっている。描かずに落とす（見えない場所へは置かない）。
  return null;
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
