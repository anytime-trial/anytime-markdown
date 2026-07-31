import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { CanvasSize, CooccurrenceSkin, ViewportState } from '../types';
import { worldToScreen } from '../viewport/viewport';

export interface AddHandleVisibility {
  readonly editMode: boolean;
  readonly skin: CooccurrenceSkin;
  readonly selectedNodeIndex: number | null;
  /** 選択中の語の座標が確定しているか（レイアウトの計算前は false）。 */
  readonly hasPosition: boolean;
}

/**
 * 図の上に追加アイコンを出すか。
 *
 * Why not 呼び出し側で条件を並べるか: 表示の条件は選択・スキン切替・レイアウト完了・拡大縮小の
 * 4 か所から参照される。分散させるとどれか 1 つで条件を落とし、「3D なのにアイコンが出る」
 * 「位置が決まる前に語の脇でない場所へ出る」といった食い違いが生じる。
 */
export function shouldShowAddHandle(state: AddHandleVisibility): boolean {
  return (
    state.editMode && state.skin === 'standard' && state.selectedNodeIndex !== null && state.hasPosition
  );
}

export interface AddHandlePlacementInput {
  /** 選択中の語のワールド座標と半径。 */
  readonly node: { readonly x: number; readonly y: number; readonly radius: number };
  readonly viewport: ViewportState;
  readonly canvas: CanvasSize;
  /** アイコンの一辺（px）。図の拡大率に依らず一定。 */
  readonly handleSize: number;
  /** 語の縁とアイコンの間の余白（px）。 */
  readonly gap: number;
}

/**
 * アイコンの左上（キャンバス左上を原点とする px）を返す。
 *
 * 語の右上へ置き、キャンバスの外へ出る分は内側へ寄せる。寄せないと、図の端の語を選んだときに
 * アイコンが画面の外に出て押せない。アイコンの寸法は px 固定で、図と一緒に拡縮しない
 * （縮小表示で数 px になると押せなくなる）。
 */
export function addHandlePlacement(input: AddHandlePlacementInput): { x: number; y: number } {
  const center = worldToScreen({ x: input.node.x, y: input.node.y }, input.viewport);
  const radius = input.node.radius * input.viewport.scale;
  const x = center.x + radius + input.gap;
  const y = center.y - radius - input.gap - input.handleSize;
  return {
    x: Math.max(0, Math.min(x, input.canvas.width - input.handleSize)),
    y: Math.max(0, Math.min(y, input.canvas.height - input.handleSize)),
  };
}

export interface AddElementFormValues {
  readonly label: string;
  /** 時間軸を持たないファイルで使う全体値。 */
  readonly frequency?: string;
  readonly strength?: string;
  /** 時間軸を持つファイルで使うスライス別の値。スライスと同じ順序・同じ長さ。 */
  readonly sliceFrequencies?: ReadonlyArray<string>;
  readonly sliceStrengths?: ReadonlyArray<string>;
}

export type AddElementFormError =
  | 'empty-label'
  | 'duplicate-label'
  | 'invalid-frequency'
  | 'invalid-strength';

function invalidNumber(text: string | undefined): boolean {
  if (text === undefined) return true;
  if (text.trim() === '') return true;
  const value = Number(text);
  return !Number.isFinite(value) || value < 0;
}

function invalidSliceValues(values: ReadonlyArray<string> | undefined): boolean {
  if (values === undefined) return true;
  // 空欄は「その期には無い」を表す（スライス別入力の既存の扱い）。数値として壊れている欄だけ弾く。
  return values.some((value) => value.trim() !== '' && invalidNumber(value));
}

/**
 * 入力を検証する。null なら登録してよい。
 *
 * 空の語名と重複した語名をここで弾くのは、ファイルの検証（graph-core）が空の語名を受理する
 * ためである。通すと、名前の無い語が図に現れて見分けも取り消しもできなくなる。
 */
export function validateAddElementForm(
  file: CooccurrenceFile,
  values: AddElementFormValues,
): AddElementFormError | null {
  const label = values.label.trim();
  if (label === '') return 'empty-label';
  if (file.spec.nodes.some((node) => node.label.trim() === label)) return 'duplicate-label';

  const layered = values.sliceFrequencies !== undefined || values.sliceStrengths !== undefined;
  if (layered) {
    if (invalidSliceValues(values.sliceFrequencies)) return 'invalid-frequency';
    if (invalidSliceValues(values.sliceStrengths)) return 'invalid-strength';
    return null;
  }
  if (invalidNumber(values.frequency)) return 'invalid-frequency';
  if (invalidNumber(values.strength)) return 'invalid-strength';
  return null;
}
