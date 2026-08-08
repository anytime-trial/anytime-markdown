/**
 * 後方互換のための薄い re-export。
 *
 * 実装は `../runner/state` に集約されており、`MemoryCoreService` 以外の
 * Runner (例: AnalyzeAllRunner) も同じ state read/write を共有する。
 * 既存 import パス (`./state`) を壊さないためこのファイルを維持する。
 */
export {
  defaultState,
  readState,
  writeState,
  DEFAULT_STATE_SCHEMA_VERSION as STATE_SCHEMA_VERSION,
} from '../runner/state';
export type { ReadStateOptions } from '../runner/state';
