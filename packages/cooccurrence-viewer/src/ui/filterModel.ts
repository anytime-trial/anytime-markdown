import { readLink, type CooccurrenceFile, type CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';

export interface FilterModelInput {
  minFrequencyText: string;
  minStrengthText: string;
  topLinkCountText: string;
  selectedClusterIndexes: ReadonlySet<number>;
}

export function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMinFrequency(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : Math.max(1, parsed);
}

export function parseMinStrength(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : Math.max(0, parsed);
}

export function parseTopLinkCount(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined || parsed < 1) return undefined;
  return Math.floor(parsed);
}

/**
 * スライダーの可動域（設計書 §3.2）。
 *
 * 可動域は固定値ではなくファイルの実測から導く。強度は `.cooc.json` が自由に決める値で上限が
 * 決まっておらず、0〜1 のような固定域にすると「動かしても何も変わらない帯」か「全部消える帯」の
 * どちらかが可動域の大半を占める。可動域そのものが分布の要約になることが、数値入力をやめる理由である。
 */
export interface SliderRange {
  min: number;
  max: number;
  step: number;
  /**
   * 可動域が幅を持つか。幅 0 のスライダーは操作できるように見せない
   * （動かしても結果が変わらない面を作らないため）。
   */
  enabled: boolean;
}

/**
 * スライダーの刻みで生じる浮動小数の端数を落とす。表示値と保存値を一致させる。
 *
 * SHORTCUT: 丸めを 4 桁固定にしている. ceiling: 可動域の幅が 0.0001 未満だと表示上は同じ値に
 * 見える（つまみは動く）. upgrade: 強度がその桁で意味を持つファイルが現れたら、刻みに応じた
 * 有効桁へ切り替える.
 */
export function roundSliderValue(value: number): number {
  return Number(value.toFixed(4));
}

const SLIDER_STEP_COUNT = 100;

function rangeFrom(min: number, max: number, step: number): SliderRange {
  const enabled = max > min;
  return { min, max, step: enabled ? step : 1, enabled };
}

/** 最小共起強度のスライダーの可動域。左端＝絞り込みなし・右端＝最強の 1 本だけ残る。 */
export function strengthSliderRange(file: CooccurrenceFile): SliderRange {
  const strengths = file.spec.links
    .map((link) => readLink(link).strength)
    .filter((strength) => Number.isFinite(strength));
  if (strengths.length === 0) return rangeFrom(0, 0, 1);
  const min = Math.min(...strengths);
  const max = Math.max(...strengths);
  // 刻みは端数を落とした値を使うが、可動域が狭いと 4 桁の丸めで 0 になる（例: 幅 0.00001）。
  // `step="0"` は不正値で、ブラウザは実装依存の既定（多くは 1）へ落ちるため、可動域より粗い
  // 刻みしか選べない＝実質操作できないスライダーになる。丸めで消えるときは生の刻みを使う。
  const rawStep = (max - min) / SLIDER_STEP_COUNT;
  return rangeFrom(min, max, roundSliderValue(rawStep) || rawStep);
}

/** 上位の共起のスライダーの可動域。右端＝共起の総数＝制限なし。 */
export function topLinkSliderRange(file: CooccurrenceFile): SliderRange {
  return rangeFrom(1, file.spec.links.length, 1);
}

/**
 * 「絞り込みなし」がどちらの端か。強度は左端（下限が最小値）、上位の共起は右端（総数＝制限なし）。
 */
export type SliderNoFilterEdge = 'min' | 'max';

/** つまみ位置 → 絞り込みの入力文字列。絞り込みなしの端では空文字（条件を持たない状態）を出す。 */
export function sliderTextFromPosition(position: number, range: SliderRange, edge: SliderNoFilterEdge): string {
  if (edge === 'min' ? position <= range.min : position >= range.max) return '';
  return String(roundSliderValue(position));
}

/** 絞り込みの入力文字列 → つまみ位置。空・非数値は絞り込みなしの端へ、範囲外は可動域内へ寄せる。 */
export function sliderPositionFromText(value: string, range: SliderRange, edge: SliderNoFilterEdge): number {
  const parsed = parseOptionalNumber(value);
  if (parsed === undefined) return edge === 'min' ? range.min : range.max;
  return Math.min(range.max, Math.max(range.min, parsed));
}

export function allClusterIndexes(file: CooccurrenceFile): Set<number> {
  return new Set(file.spec.clusters?.map((_, index) => index) ?? []);
}

export function selectedClustersFromOptions(
  file: CooccurrenceFile,
  options: CooccurrenceFilterOptions | undefined,
): Set<number> {
  if (options?.selectedClusterIndexes !== undefined) return new Set(options.selectedClusterIndexes);
  return allClusterIndexes(file);
}

export function createFilterOptions(input: FilterModelInput): CooccurrenceFilterOptions {
  const minFrequency = parseMinFrequency(input.minFrequencyText);
  const minStrength = parseMinStrength(input.minStrengthText);
  const topLinkCount = parseTopLinkCount(input.topLinkCountText);
  return {
    ...(minFrequency === undefined ? {} : { minFrequency }),
    selectedClusterIndexes: [...input.selectedClusterIndexes].sort((a, b) => a - b),
    ...(minStrength === undefined ? {} : { minStrength }),
    ...(topLinkCount === undefined ? {} : { topLinkCount }),
  };
}

export function filterOptionsToInput(
  file: CooccurrenceFile,
  options: CooccurrenceFilterOptions | undefined,
): FilterModelInput {
  return {
    minFrequencyText: options?.minFrequency === undefined ? '' : String(options.minFrequency),
    minStrengthText: options?.minStrength === undefined ? '' : String(options.minStrength),
    topLinkCountText: options?.topLinkCount === undefined ? '' : String(options.topLinkCount),
    selectedClusterIndexes: selectedClustersFromOptions(file, options),
  };
}
