import { en } from './en';
import { ja } from './ja';
import type { TrailI18n, TrailLocale } from './types';

/**
 * ロケール辞書から t 関数を作る。
 *
 * 未定義キーはキー文字列をそのまま返す（実行時に生キーが画面へ出る）。TrailI18n は
 * 明示 interface なので、キーを追加したら ja / en 両方を埋めないと tsc が落ちる。
 *
 * views 側から直接 import できるよう **i18n 配下の独立モジュール**に置く。
 * trailViewerApp に置くと、t だけ欲しいテストが viewer アプリ全体（marked 等の ESM 依存）を
 * 巻き込んでしまう。
 */
export function createTrailI18n(locale?: TrailLocale): (k: string) => string {
  const dict: TrailI18n = locale === 'ja' ? ja : en;
  return (k: string) => (dict as unknown as Record<string, string>)[k] ?? k;
}
