/**
 * 人物の箱。図に居る人物 1 人につき 1 つ作り、**作り直さずに更新する**。
 *
 * ドラッグは指を動かすたびに走る。毎フレーム作り直すと、掴んでいる要素そのものが入れ替わって
 * ポインタの捕捉（`setPointerCapture`）が外れ、指が箱から離れる。
 */

import {
  type ChartNode,
  DIAGRAM_SPACING_RANGE,
  type DiagramDocument,
  type DiagramShape,
  type DiagramSpacing,
  shapeOutline,
  shapeTextInset,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { groupLabelsOf, parentsOf } from '../model';
import { el, setAttr, setClass, svg } from './dom';
import { createIcon } from './icons';

/** どの辺を掴んだか。取っ手ごとに固定なので、毎回作り直さず 1 つを配る。 */
export const WIDTH_AXES = Object.freeze({ width: true, height: false });
export const HEIGHT_AXES = Object.freeze({ width: false, height: true });
export const BOTH_AXES = Object.freeze({ width: true, height: true });

export type ResizeAxes = typeof WIDTH_AXES | typeof HEIGHT_AXES | typeof BOTH_AXES;

export interface NodeCallbacks {
  onNodePointerDown(event: PointerEvent, name: string): void;
  onNodePointerMove(event: PointerEvent): void;
  onNodePointerUp(event: PointerEvent): void;
  onTogglePick(name: string): void;
  onNudge(name: string, columns: number, rows: number): void;
  onRelease(name: string): void;
  /** 接続点を掴んだ。相手の札の上で離すと線が 1 本できる。 */
  onConnectPointerDown(event: PointerEvent, name: string): void;
  onConnectPointerMove(event: PointerEvent): void;
  onConnectPointerUp(event: PointerEvent): void;
  /** キーボードから接続点を押した（始点として待ち受ける／待ち受け中の始点と結ぶ）。 */
  onConnectToggle(name: string): void;
  /**
   * その札の手前へ空きを 1 つ割り込ませる。`'row'` なら上（同じ列が下へ）、`'column'` なら
   * 左（同じ行が右へ）。軸の読み方は行・列の増減（`GridAxis`）と揃える。
   */
  onInsertGap(name: string, axis: 'row' | 'column'): void;
  /** 名札の書き換えを始める。 */
  onStartRename(name: string): void;
  /** 書き換えを確定する。空や重複は呼ばれた側が断る。 */
  onCommitRename(from: string, to: string): void;
  onCancelRename(): void;
  onSizePointerDown(event: PointerEvent, name: string, axes: ResizeAxes): void;
  onSizePointerMove(event: PointerEvent): void;
  onSizePointerUp(event: PointerEvent): void;
  onResizeKey(event: KeyboardEvent, axes: ResizeAxes): void;
}

export interface NodeViewState {
  readonly node: ChartNode;
  readonly spacing: DiagramSpacing;
  /** 札の形。四角なら輪郭の層は作らない（既存の図の描き方をそのまま保つ）。 */
  readonly shape: DiagramShape;
  readonly editing: boolean;
  readonly picked: boolean;
  readonly dimmed: boolean;
  readonly moved: boolean;
  readonly isAnchor: boolean;
  readonly saving: boolean;
  /** 名札を書き換えている最中か。 */
  readonly renaming: boolean;
  /** 接続の始点として待ち受けているか。 */
  readonly connectSource: boolean;
}

export interface NodeView {
  readonly root: HTMLDivElement;
  update(state: NodeViewState): void;
}

/** キーボードで 1 回動かす升目の数。Shift を添えると粗く動く。 */
const NUDGE_CELLS = 1;
const COARSE_NUDGE_CELLS = 5;

export function createNodeView(
  doc: Document,
  document_: DiagramDocument,
  name: string,
  t: DiagramT,
  callbacks: NodeCallbacks,
): NodeView {
  const root = el(doc, 'div', { className: 'anytime-diagram-node', attrs: { 'data-person': name } });

  /**
   * 四角以外の輪郭を描く層。**中身より先に入れて後ろへ敷く**（DOM 順が重ね順になる）。
   *
   * 層は常に作り、使わない形のときはクラスで隠す。形を変えるたびに作り直すと、掴んでいる札の
   * 子が入れ替わってポインタの捕捉が外れる（札そのものを作り直さないのと同じ理由）。
   */
  const shapeLayer = svg(doc, 'svg', { class: 'anytime-diagram-shape', 'aria-hidden': 'true' });
  const shapeOutlinePath = svg(doc, 'path', { class: 'shape-outline' });
  const shapeDetailPath = svg(doc, 'path', { class: 'shape-detail' });
  shapeLayer.append(shapeOutlinePath, shapeDetailPath);
  root.appendChild(shapeLayer);

  const label = el(doc, 'strong', { text: name });
  root.appendChild(label);

  /**
   * 名札の書き換え口。**常に作り、使わない間はクラスで隠す。**
   *
   * 書き換えのたびに作ると、作った瞬間は焦点を持たない要素なので、入力を始める前に 1 度
   * 焦点が図の外へ落ちる。
   */
  const rename = el(doc, 'input', {
    className: 'anytime-diagram-rename anytime-diagram-hidden',
    attrs: { type: 'text', 'aria-label': `${t('renameElement')}: ${name}` },
  });
  /** 前回の描画で書き換え中だったか。焦点を当て直す瞬間と、二重の確定を 1 度に絞るために覚える。 */
  let renaming = false;

  /**
   * 書き換えを畳む。**畳んだ後の呼び出しは捨てる。**
   *
   * 確定すると札そのものが作り直されて DOM から外れ、外れる瞬間に `blur` が飛ぶ。捨てないと
   * その `blur` が 2 度目の確定を起こし、もう存在しない名前を新しい名前へ付け替えようとして
   * 「すでに図に在ります」と断られる（実機で観測）。
   */
  const finishRename = (commit: boolean): void => {
    if (!renaming) return;
    renaming = false;
    if (commit) callbacks.onCommitRename(name, rename.value);
    else callbacks.onCancelRename();
  };

  // 押下を親へ渡さない。渡すと、字を選ぼうとしたドラッグが札の移動になる。
  rename.addEventListener('pointerdown', (event) => event.stopPropagation());
  rename.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finishRename(event.key === 'Enter');
  });
  // 焦点を失ったときも確定する。取り消し扱いにすると、打ち終えて図の外を押した人の入力が消える。
  rename.addEventListener('blur', () => finishRename(true));
  root.appendChild(rename);
  root.addEventListener('dblclick', (event) => {
    event.preventDefault();
    callbacks.onStartRename(name);
  });

  const labels = groupLabelsOf(document_, name);
  const group = el(doc, 'span', { text: labels[0] ?? '' });
  if (labels.length > 0) group.title = labels.join(' / ');
  root.appendChild(group);

  const parents = parentsOf(document_, name);
  if (parents.length > 0) {
    root.appendChild(el(doc, 'span', {
      className: 'anytime-diagram-visually-hidden',
      text: `${t('parentLabel')}: ${parents.join('・')}`,
    }));
  }

  const annotation = document_.annotations[name];
  if (annotation !== undefined) root.appendChild(el(doc, 'small', { text: annotation }));

  // 取っ手は常に作り、編集していない間はクラスで隠す。作り直すと、押している最中に
  // 要素が入れ替わってキーボードの焦点が図の外へ飛ぶ。
  const handle = el(doc, 'span', { className: 'anytime-diagram-handle anytime-diagram-hidden' });
  const pick = el(doc, 'button', {
    className: 'anytime-diagram-pick',
    text: '☐',
    attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `${t('pickPerson')}: ${name}` },
  });
  pick.addEventListener('click', () => callbacks.onTogglePick(name));
  const move = el(doc, 'button', {
    text: '⤧',
    attrs: { type: 'button', 'aria-label': `${t('movePerson')}: ${name}` },
  });
  move.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? COARSE_NUDGE_CELLS : NUDGE_CELLS;
    const by: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const delta = by[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    callbacks.onNudge(name, delta[0], delta[1]);
  });
  const release = el(doc, 'button', {
    className: 'anytime-diagram-hidden',
    text: '⟲',
    attrs: { type: 'button', 'aria-label': `${t('releasePerson')}: ${name}` },
  });
  release.addEventListener('click', () => callbacks.onRelease(name));
  handle.append(pick, move, release);
  root.appendChild(handle);

  /**
   * 接続点。箱の**左辺の中央、枠の内側**に 1 つだけ置く。
   *
   * 4 辺に置かない。編集中の箱は `overflow: hidden` なので（名前が箱をはみ出さないように、かつ
   * 取っ手が内容と一緒に流れないように）、**辺をまたぐ位置に置いた取っ手は切り取られ、見えも
   * 押せもしない**。内側へ収めるほかなく、上辺の中央は操作の取っ手の帯（右上から 120px ほど）と、
   * 右辺と下辺は箱の大きさの取っ手と場所を奪い合う。どの箱でも空いているのは左辺だけである。
   *
   * 1 つで足りるのは、線の取り付き位置が**相手の箱の向き**で決まるため（`connectorGeometry`）。
   * どの点から引いても同じ線になるので、4 つ並べても選べる線は増えない。
   *
   * 押下は親へ渡さない — 渡すと、線を引き始めたはずの指が札を動かす。
   */
  const connectPoint = el(doc, 'button', {
    className: 'anytime-diagram-connect anytime-diagram-hidden',
    attrs: { type: 'button', 'aria-label': `${t('connectFrom')}: ${name}`, title: t('connectFrom') },
  });
  connectPoint.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    callbacks.onConnectPointerDown(event, name);
  });
  connectPoint.addEventListener('pointermove', callbacks.onConnectPointerMove);
  connectPoint.addEventListener('pointerup', callbacks.onConnectPointerUp);
  connectPoint.addEventListener('pointercancel', callbacks.onConnectPointerUp);
  // キーボードからの押下だけをここで拾う（`detail === 0`）。指の押下は上の pointer 系で
  // 完結しており、click まで拾うと 1 回の操作で 2 度数える。
  connectPoint.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    callbacks.onConnectToggle(name);
  });
  root.appendChild(connectPoint);

  /**
   * 上・左へ空きを割り込ませる取っ手。**箱の内側の左上に 2 つ並べる。**
   *
   * 「上の取っ手は上辺、左の取っ手は左辺」と置き場所で意味を示せない。編集中の箱は
   * `overflow: hidden` で外へはみ出せず、箱の高さの下限（72px）では左辺に**接続点と並べる
   * 余地が無い**（9px の点が縦中央、下端は大きさの取っ手の当たり判定）。位置で示そうとすると、
   * 小さい箱でだけ取っ手が重なって押せなくなる。向きは矢印の絵で示す。
   */
  const insertHandles = ([
    ['row', 'insertAbove', t('insertAbove')],
    ['column', 'insertLeft', t('insertLeft')],
  ] as const).map(([axis, icon, text]) => {
    const button = el(doc, 'button', {
      className: `anytime-diagram-insert is-${axis} anytime-diagram-hidden`,
      attrs: { type: 'button', 'aria-label': `${text}: ${name}`, title: text },
    });
    button.appendChild(createIcon(doc, icon, 12));
    button.addEventListener('click', () => callbacks.onInsertGap(name, axis));
    root.appendChild(button);
    return button;
  });

  const sizeHandles = ([
    ['is-width', WIDTH_AXES, t('resizeWidth'), 'nodeWidth'],
    ['is-height', HEIGHT_AXES, t('resizeHeight'), 'nodeHeight'],
    ['is-both', BOTH_AXES, t('resizeBoth'), null],
  ] as const).map(([variant, axes, label, sliderKey]) => {
    const button = el(doc, 'button', {
      className: `anytime-diagram-size ${variant} anytime-diagram-hidden`,
      attrs: { type: 'button', 'aria-label': label, title: label },
    });
    // 1 軸の取っ手は role="slider" で値ごと伝える。名前だけのボタンにすると、目で画面を
    // 追えない利用者には操作が効いているかどうかも届かない。右下（2 軸）は slider に
    // 当てはまらないので、値は選択の区画の output が知らせる。
    if (sliderKey !== null) {
      button.setAttribute('role', 'slider');
      button.setAttribute('aria-valuemin', String(DIAGRAM_SPACING_RANGE[sliderKey].min));
      button.setAttribute('aria-valuemax', String(DIAGRAM_SPACING_RANGE[sliderKey].max));
    }
    button.addEventListener('pointerdown', (event) => callbacks.onSizePointerDown(event, name, axes));
    button.addEventListener('pointermove', callbacks.onSizePointerMove);
    button.addEventListener('pointerup', callbacks.onSizePointerUp);
    button.addEventListener('pointercancel', callbacks.onSizePointerUp);
    button.addEventListener('keydown', (event) => callbacks.onResizeKey(event, axes));
    root.appendChild(button);
    return { button, sliderKey };
  });

  root.addEventListener('pointerdown', (event) => callbacks.onNodePointerDown(event, name));
  root.addEventListener('pointermove', callbacks.onNodePointerMove);
  root.addEventListener('pointerup', callbacks.onNodePointerUp);
  root.addEventListener('pointercancel', callbacks.onNodePointerUp);

  return {
    root,
    update(state) {
      const { node, spacing } = state;
      root.style.left = `${node.x}px`;
      root.style.top = `${node.y}px`;
      root.style.width = `${spacing.nodeWidth}px`;
      root.style.height = `${spacing.nodeHeight}px`;
      root.setAttribute('data-shape', state.shape);
      // 輪郭は**札の大きさが変わるたびに引き直す**。SVG を伸縮させると、線の太さまで一緒に
      // 伸びて縦横で違う太さになる（`preserveAspectRatio` を外した拡大の副作用）。
      // 文字の余白も札の大きさから引き直す（CSS の百分率は親の幅を基準にしてしまう）。
      const inset = shapeTextInset(state.shape, spacing.nodeWidth, spacing.nodeHeight);
      root.style.padding = `${inset.y}px ${inset.x}px`;
      const outline = shapeOutline(state.shape, spacing.nodeWidth, spacing.nodeHeight);
      setClass(shapeLayer, 'anytime-diagram-hidden', outline === null);
      if (outline !== null) {
        setAttr(shapeOutlinePath, 'd', outline.outline);
        setAttr(shapeDetailPath, 'd', outline.detail);
      }
      setClass(root, 'is-selected', state.picked);
      setClass(root, 'is-node-dimmed', state.dimmed);
      setClass(root, 'is-moved', state.moved);
      setClass(root, 'is-connect-source', state.connectSource);
      setClass(handle, 'anytime-diagram-hidden', !state.editing);
      pick.setAttribute('aria-pressed', String(state.picked));
      pick.textContent = state.picked ? '☑' : '☐';
      setClass(release, 'anytime-diagram-hidden', !state.moved);
      for (const button of [connectPoint, ...insertHandles]) {
        setClass(button, 'anytime-diagram-hidden', !state.editing);
        button.disabled = state.saving;
      }
      // 名札と書き換え口は**どちらか一方だけ**を出す。両方出すと、同じ名前が 2 つ並ぶ。
      setClass(label, 'anytime-diagram-hidden', state.renaming);
      setClass(rename, 'anytime-diagram-hidden', !state.renaming);
      if (state.renaming && !renaming) {
        // 焦点は**書き換えに入った瞬間だけ**当てる。毎回当てると、図を平行移動するたびに
        // 打ちかけの字が選び直され、次の 1 文字で消える。
        rename.value = name;
        rename.focus();
        rename.select();
      }
      renaming = state.renaming;
      for (const { button, sliderKey } of sizeHandles) {
        setClass(button, 'anytime-diagram-hidden', !(state.editing && state.isAnchor));
        button.disabled = state.saving;
        if (sliderKey !== null) {
          button.setAttribute('aria-valuenow', String(spacing[sliderKey]));
          setAttr(button, 'aria-valuetext', t('cardSize', { width: spacing.nodeWidth, height: spacing.nodeHeight }));
        }
      }
    },
  };
}
