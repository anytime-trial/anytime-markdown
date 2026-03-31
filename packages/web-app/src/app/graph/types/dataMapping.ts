/** データ駆動マッピングの設定 */
export interface DataMappingConfig {
  /** ノードサイズにマッピングする metadata キー */
  readonly sizeKey?: string;
  /** サイズの出力範囲 [min, max]（ピクセル） */
  readonly sizeRange?: readonly [number, number];
  /** ノード色にマッピングする metadata キー */
  readonly colorKey?: string;
  /** カラースケール [min色, max色]（hex） */
  readonly colorRange?: readonly [string, string];
  /** エッジ太さの出力範囲 [min, max] */
  readonly weightRange?: readonly [number, number];
}

export const DEFAULT_DATA_MAPPING: Readonly<DataMappingConfig> = {
  sizeRange: [60, 200],
  colorRange: ['#c6dbef', '#08519c'],
  weightRange: [1, 8],
};
