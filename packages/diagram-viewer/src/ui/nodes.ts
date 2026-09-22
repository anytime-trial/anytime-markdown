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
import { parentsOf } from '../model';
import type { DiagramElementAnnex, DiagramElementAnnexItem } from '../types';
import { additiveFrom, el, setAttr, setClass, setText, svg } from './dom';
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
  /**
   * 札を押した（押し終わり）。**閲覧中に関連箇所だけを見るための選択**。
   *
   * 押下（`onNodePointerDown`）と分けてある。あちらは編集中に掴んで動かす操作の始まりで、
   * 閲覧中は掴めない。押下で受けると、札の上から始めた平行移動が選択に化ける。
   */
  onSelectNode(name: string, additive: boolean): void;
  /** 宿主が添えた項目を押した。`itemId` は宿主が決めた鍵で、viewer は中身を解釈しない。 */
  onAnnexActivate(name: string, itemId: string): void;
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
  /** 群の札を押した。その行を生んだ家族の群を選び直す。 */
  onStartGroups(name: string, family: number): void;
  /** 注記の書き換えを始める。 */
  onStartAnnotate(name: string): void;
  /** 注記を確定する。空にすると注記そのものが落ちる。 */
  onCommitAnnotate(name: string, text: string): void;
  onCancelAnnotate(): void;
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
  /** 注記を書き換えている最中か。 */
  readonly annotating: boolean;
  /**
   * 札に出す群の札と注記。**作るときに焼き込まず、描くたびに当てる。**
   *
   * 焼き込むと、編集中に注記を書き換えても札は前の字のまま残る（札は作り直さないので）。
   * 家族を消して群の値が変わったときも同じ。
   */
  readonly groupBadges: readonly { readonly label: string; readonly family: number }[];
  readonly annotation: string;
  /** 接続の始点として待ち受けているか。 */
  readonly connectSource: boolean;
  /**
   * 宿主が添えた項目群。`null` は添えるものが無いこと。
   *
   * 群の札・注記と同じく**描くたびに当てる**。作るときに焼き込むと、宿主が後から
   * `update({ elementAnnex })` で差し替えても札は前の内容のまま残る。
   */
  readonly annex: DiagramElementAnnex | null;
  /** 添えた項目を押せるか（宿主が `onAnnexActivate` を渡しているか）。 */
  readonly annexActivatable: boolean;
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
  /**
   * 札の押し終わり。**閲覧中の選択**（関連箇所だけを見る）を受ける。
   *
   * 編集中の選択は押下が受け持つので、ここは重ねて選び直すだけで害が無い（呼ばれた側が
   * 閲覧中かどうかで振り分ける）。
   */
  root.addEventListener('click', (event) => {
    // 札の中の操作要素（取っ手・入力）を押したときは選び直さない。
    if (event.target instanceof Element && event.target.closest('button, input, select') !== null) return;
    callbacks.onSelectNode(name, additiveFrom(event));
  });
  /**
   * 札のダブルクリック。**押した段で行き先を振り分ける**（上＝名前・中＝群・下＝注記）。
   *
   * 段ごとの要素へ handler を付ける手は効かない。札を掴んだ瞬間にポインタが札へ捕捉され
   * （`setPointerCapture`）、以後のポインタ由来のイベントは **target が札そのものへ
   * 書き換わる**ため、子の handler は一度も走らない（実機で観測。中段・下段を押しても
   * 名札の書き換えが開いた）。jsdom は捕捉を持たないので、この破れは検査を素通りする。
   *
   * そこで target を素直に信じず、**捕捉で札へ化けていたら座標から引き直す**。
   */
  root.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const target = event.target instanceof Element && event.target !== root
      ? event.target
      : doc.elementFromPoint(event.clientX, event.clientY);
    const line = target?.closest('.anytime-diagram-group');
    if (line !== null && line !== undefined) {
      const family = Number(line.getAttribute('data-family') ?? '-1');
      if (family >= 0) callbacks.onStartGroups(name, family);
      return;
    }
    if (target?.closest('.anytime-diagram-annotation') != null) {
      callbacks.onStartAnnotate(name);
      return;
    }
    // 添えた項目の段は書き換えの行き先を持たない。振り分けから外さないと、開閉を 2 度押した
    // だけで名札の書き換えが開く（段ごとの行き先を座標から引き直す作りのため）。
    if (target?.closest('.anytime-diagram-annex') != null) return;
    callbacks.onStartRename(name);
  });

  /**
   * 群の札。**その人物に付く値を全部出す**（1 件目だけにしない）。
   *
   * 1 件目だけを出していた頃は、複数の家族に別々の値で出てくる人物の 2 件目以降が札から
   * 消え、吹き出しに触れるまで気づけなかった。件数は人物ごとに変わるので、足りなければ作り、
   * 余ったら隠す（節点や端の印と同じ貸し借り）。
   */
  const groups = el(doc, 'span', { className: 'anytime-diagram-groups' });
  const groupLines: { readonly line: HTMLElement; family: number }[] = [];
  root.appendChild(groups);

  const parents = parentsOf(document_, name);
  if (parents.length > 0) {
    root.appendChild(el(doc, 'span', {
      className: 'anytime-diagram-visually-hidden',
      text: `${t('parentLabel')}: ${parents.join('・')}`,
    }));
  }

  /**
   * 注記。**常に作り、空のときはクラスで隠す**（無ければ作らない、にしない）。
   *
   * 無いときに要素ごと作らないと、注記を書いた瞬間に札の中身が増えて版組みが跳ぶ。
   */
  const annotation = el(doc, 'small', { className: 'anytime-diagram-annotation' });
  root.appendChild(annotation);

  /**
   * 注記の書き換え口。名札の書き換え口と同じ作り（常に作り、畳んだ後の確定は捨てる）。
   *
   * 名札と 1 つの入力を使い回さない。どちらを書いているかを入力の側が持つことになり、
   * 片方の確定がもう片方へ流れる事故（名前を注記で上書きする）を型で止められない。
   */
  const annotateInput = el(doc, 'input', {
    className: 'anytime-diagram-annotate anytime-diagram-hidden',
    attrs: { type: 'text', 'aria-label': `${t('annotateElement')}: ${name}` },
  });
  let annotating = false;
  const finishAnnotate = (commit: boolean): void => {
    if (!annotating) return;
    annotating = false;
    if (commit) callbacks.onCommitAnnotate(name, annotateInput.value);
    else callbacks.onCancelAnnotate();
  };
  annotateInput.addEventListener('pointerdown', (event) => event.stopPropagation());
  annotateInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finishAnnotate(event.key === 'Enter');
  });
  annotateInput.addEventListener('blur', () => finishAnnotate(true));
  root.appendChild(annotateInput);

  /**
   * 宿主が添えた項目群。**常に作り、項目が無いときはクラスで隠す**（注記と同じ作法）。
   *
   * 無いときに要素ごと作らないと、宿主が項目を読み終えた瞬間に札の中身が増えて版組みが跳ぶ
   * （図を開いた直後と、一覧を取り終えた後とで札の高さが変わる）。
   *
   * 畳んで出すのは、項目の件数が要素ごとに大きく違うため。開いた形で出すと、項目を多く持つ
   * 要素の札だけが縦に伸びて図の升目から外れる。
   */
  const annex = el(doc, 'details', { className: 'anytime-diagram-annex anytime-diagram-hidden' });
  const annexSummary = el(doc, 'summary');
  const annexItems = el(doc, 'span', { className: 'anytime-diagram-annex-items' });
  annex.append(annexSummary, annexItems);
  /** 項目の貸し借り。件数は要素ごとに変わるので、足りなければ作り、余ったら隠す（群の札と同じ）。 */
  const annexButtons: HTMLButtonElement[] = [];
  /**
   * 直近に描いた項目。**押下の受け口は作るときに 1 度だけ張り、中身はここから引く。**
   *
   * 描くたびに張り直すと、札を作り直さない作りの中で受け口だけが積み上がり、1 回の押下が
   * 積んだ回数ぶん呼ばれる。位置だけを閉じ込め、中身は描画のたびに差し替える。
   */
  let latestAnnexItems: readonly DiagramElementAnnexItem[] = [];
  // 押下を親へ渡さない。渡すと、開閉のつもりの押下が札の移動の始まりになる（書き換え口と同じ）。
  annex.addEventListener('pointerdown', (event) => event.stopPropagation());
  /*
    押し終わりも渡さない。**開閉は開閉だけの意味を持つ。**

    札の `click` は「操作要素（`button` / `input` / `select`）でなければ選び直す」形なので、
    `summary` はその 3 つに当たらず素通りする。止めないと、項目を開いただけで宿主の
    `onSelect` が走り、図の外の表示（travel なら地図）が勝手に動く。項目の押下を止めている
    のと同じ理由で、入口の見出しも止める。
  */
  annex.addEventListener('click', (event) => event.stopPropagation());
  root.appendChild(annex);

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
   * 1 つで足りるのは、線の取り付き位置が**相手の箱の位置**で決まるため（`connectorGeometry`。
   * 直線は相手の中心の向き、折れ線とカーブは離れ方が大きいほうの軸）。どの点から引いても同じ線に
   * なるので、4 つ並べても選べる線は増えない。
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

  /**
   * 宿主が添えた項目を当てる。`update` から切り出してあるのは、あちらの認知的複雑度が
   * 既に上限を超えているため（S3776。本体をこれ以上押し上げない）。
   */
  function updateAnnex(state: NodeViewState): void {
    /*
      宿主が添えた項目。**器は常に在り、件数が 0 のときだけ隠す。**

      件数は要素ごとに変わるので、群の札と同じ貸し借りで数を合わせる（足りなければ作り、
      余ったら隠す）。押せるかどうかは宿主が受け口を渡したかで決まり、渡していないときは
      `disabled` にする — 押しても何も起きない見た目のままにすると、押せると読めてしまう。
    */
    const annexItemList = state.annex?.items ?? [];
    setClass(annex, 'anytime-diagram-hidden', annexItemList.length === 0);
    if (annexItemList.length === 0) {
      // 隠す前に畳む。開いたまま隠すと、次に項目が付いたとき開いた状態で現れる。
      annex.open = false;
    } else {
      setText(annexSummary, `${state.annex?.summary ?? ''} (${annexItemList.length})`);
    }
    while (annexButtons.length < annexItemList.length) {
      const button = el(doc, 'button', {
        className: 'anytime-diagram-annex-item',
        attrs: { type: 'button' },
      });
      const index = annexButtons.length;
      button.addEventListener('click', (event) => {
        // 札の選び直しと二重に走らせない。項目の押下は項目だけの意味を持つ。
        event.stopPropagation();
        const item = latestAnnexItems[index];
        if (item !== undefined) callbacks.onAnnexActivate(name, item.id);
      });
      annexButtons.push(button);
      annexItems.appendChild(button);
    }
    latestAnnexItems = annexItemList;
    for (const [index, button] of annexButtons.entries()) {
      const item = annexItemList[index];
      setClass(button, 'anytime-diagram-hidden', item === undefined);
      if (item === undefined) continue;
      setText(button, item.label);
      setAttr(button, 'aria-label', item.ariaLabel ?? null);
      button.disabled = !state.annexActivatable || state.saving;
    }
  }

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
      // 保存中は札の取っ手も押せない。保存は宿主への往復なので、その間に動かした札は
      // 完了時に下書きごと畳まれて消える（黙って効かないのを避け、押せないことを画面に出す）。
      for (const button of [pick, move, release]) button.disabled = state.saving;
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
      // 群の札は件数が変わる。足りなければ作り、余ったら隠す。
      while (groupLines.length < state.groupBadges.length) {
        const line = el(doc, 'span', { className: 'anytime-diagram-group' });
        const held = { line, family: -1 };
        groupLines.push(held);
        groups.appendChild(line);
      }
      for (const [index, held] of groupLines.entries()) {
        const badge = state.groupBadges[index];
        /*
          値をまだ持たない家族の行は、**編集中だけ薄い誘い文で出す**（閲覧中は隠す）。

          落としていた頃は、群を付けていない家族に押す場所が無く、軸を 1 本も持たない図では
          群の編集へ入る道が画面から消えていた（注記の枠と同じ扱いに揃えた）。
        */
        const empty = badge !== undefined && badge.label === '';
        held.line.textContent = empty ? t('groupHint') : badge?.label ?? '';
        held.family = badge?.family ?? -1;
        setAttr(held.line, 'data-family', badge === undefined ? null : String(badge.family));
        setClass(held.line, 'is-placeholder', empty);
        setClass(held.line, 'anytime-diagram-hidden', badge === undefined || (empty && !state.editing));
      }
      /*
        注記の枠。**編集中は空でも枠を残す**（閲覧中だけ空なら隠す）。

        空のときに `display: none` で消していた頃は、注記を書きたい人が押す場所そのものが
        無かった（札の下段をダブルクリックしても名札の書き換えが開く）。編集中だけ薄い
        誘い文を出せば、押す場所が見え、閲覧中の図は静かなままになる。
      */
      const empty = state.annotation === '';
      annotation.textContent = empty ? t('annotateHint') : state.annotation;
      setClass(annotation, 'is-placeholder', empty);
      setClass(annotation, 'anytime-diagram-hidden', state.annotating || (empty && !state.editing));
      setClass(annotateInput, 'anytime-diagram-hidden', !state.annotating);
      if (state.annotating && !annotating) {
        // 焦点は**書き換えに入った瞬間だけ**当てる（名札の書き換えと同じ理由）。
        annotateInput.value = state.annotation;
        annotateInput.focus();
        annotateInput.select();
      }
      annotating = state.annotating;
      updateAnnex(state);
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
