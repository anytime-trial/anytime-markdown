import type { TrailI18n } from '../../i18n/types';

type Translate = (key: keyof TrailI18n) => string;

export interface KindBadge {
  /** バッジに表示する短ラベル（ローカライズ済み） */
  readonly short: string;
  /** title / aria-label 用のフル名（ローカライズ済み） */
  readonly full: string;
}

/** ExportedSymbol の kind ごとの i18n キー（型安全。t は literal キーを要求するため動的連結は不可）。 */
const KIND_KEYS: Readonly<Record<string, { short: keyof TrailI18n; full: keyof TrailI18n }>> = {
  function: { short: 'c4.kind.function', full: 'c4.kind.function.full' },
  class: { short: 'c4.kind.class', full: 'c4.kind.class.full' },
  method: { short: 'c4.kind.method', full: 'c4.kind.method.full' },
  variable: { short: 'c4.kind.variable', full: 'c4.kind.variable.full' },
};

/**
 * シンボルの kind を、バッジ用の短ラベルとツールチップ用フル名にローカライズする。
 * 未知 kind（将来の新種別）は raw 値をそのまま返す（クラッシュ回避）。
 */
export function kindBadge(kind: string, t: Translate): KindBadge {
  const keys = KIND_KEYS[kind];
  if (!keys) return { short: kind, full: kind };
  return { short: t(keys.short), full: t(keys.full) };
}
