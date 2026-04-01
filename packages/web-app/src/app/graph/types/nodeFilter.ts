/** 数値範囲フィルタ条件 */
export interface RangeFilter {
  readonly key: string;
  readonly min?: number;
  readonly max?: number;
}

/** テキスト一致フィルタ条件 */
export interface TextFilter {
  readonly key: string;
  readonly value: string;
}

/** フィルタ設定全体 */
export interface NodeFilterConfig {
  readonly rangeFilters: readonly RangeFilter[];
  readonly textFilters: readonly TextFilter[];
}

export const EMPTY_FILTER: NodeFilterConfig = {
  rangeFilters: [],
  textFilters: [],
};
