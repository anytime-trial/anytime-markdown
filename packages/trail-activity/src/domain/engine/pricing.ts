// domain/engine/pricing.ts — Model pricing and cost calculation

import type { TokenUsage, ModelPricing } from '../model/cost';

export type { TokenUsage, ModelPricing };
export type PricingSource = 'claude_code' | 'codex';

// 価格の正は Anthropic 公式（platform.claude.com/docs/en/pricing）。
// 世代で価格が変わるモデル（opus / haiku）は世代別キーで持つ。
// 期限付き導入価格は焼き込まない（定価で統一）。Sonnet 5 の 2/10 は 2026-09-01 の値上げが撤回され定価になった。
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // Opus 4.5 以降（4.5/4.6/4.7/4.8）
  opus: {
    inputPerM: 5,
    outputPerM: 25,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  // Opus 4.1 以前（claude-3-opus / claude-opus-4-0 / claude-opus-4-1）
  'opus-legacy': {
    inputPerM: 15,
    outputPerM: 75,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  sonnet: {
    inputPerM: 3,
    outputPerM: 15,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  // Haiku 4.5
  haiku: {
    inputPerM: 1,
    outputPerM: 5,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  // Haiku 3.5 以前
  'haiku-legacy': {
    inputPerM: 0.8,
    outputPerM: 4,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  // Opus 5.5（2026-09。Opus 5 より安い。キャッシュ読取 $0.20 = 入力の 5%）
  'opus-5.5': {
    inputPerM: 4,
    outputPerM: 20,
    cacheReadMultiplier: 0.05,
    cacheCreationMultiplier: 1.25,
  },
  // Sonnet 5（Sonnet 4.6 以前は sonnet の 3/15）
  'sonnet-5': {
    inputPerM: 2,
    outputPerM: 10,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  // Fable 5.1（2026-09-01。入出力は Fable 5 と同じで、キャッシュ読取だけ $1.00 → $0.25）
  'fable-5.1': {
    inputPerM: 10,
    outputPerM: 50,
    cacheReadMultiplier: 0.025,
    cacheCreationMultiplier: 1.25,
  },
  // Fable 5 / Mythos 5（同価格）
  fable: {
    inputPerM: 10,
    outputPerM: 50,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1.25,
  },
  'gpt-5.2-codex': {
    inputPerM: 1.75,
    outputPerM: 14,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1,
  },
  'gpt-5.1-codex-max': {
    inputPerM: 1.25,
    outputPerM: 10,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1,
  },
  'gpt-5.1-codex': {
    inputPerM: 1.25,
    outputPerM: 10,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1,
  },
  'gpt-5-codex': {
    inputPerM: 1.25,
    outputPerM: 10,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1,
  },
  'gpt-5.1-codex-mini': {
    inputPerM: 0.25,
    outputPerM: 2,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 1,
  },
  'codex-mini-latest': {
    inputPerM: 1.5,
    outputPerM: 6,
    cacheReadMultiplier: 0.25,
    cacheCreationMultiplier: 1,
  },
};

const DEFAULT_MODEL = 'sonnet';
const DEFAULT_CODEX_MODEL = 'gpt-5.1-codex';

// 旧世代のフル ID パターン。世代情報のない素の family 名（'opus' 等）は現行世代に解決する
// （activity.db の実データは全行 Opus 4.5 以降のため。旧世代は必ずフル ID で流入する）。
const LEGACY_OPUS_RE = /claude-3-opus|opus-4-0|opus-4-1(?![0-9.])|opus-4-2025/;
const LEGACY_HAIKU_RE = /claude-3-5-haiku|claude-3-haiku/;

export function normalizeModelName(model: string): string {
  const lower = model.toLowerCase().trim();
  if (lower.includes('gpt-5.2-codex')) return 'gpt-5.2-codex';
  if (lower.includes('gpt-5.1-codex-mini')) return 'gpt-5.1-codex-mini';
  if (lower.includes('codex-mini-latest')) return 'codex-mini-latest';
  if (lower.includes('gpt-5.1-codex') || lower.includes('gpt-5-codex')) return 'gpt-5.1-codex';
  if (lower.includes('fable') || lower.includes('mythos')) return 'fable';
  if (lower.includes('opus')) return LEGACY_OPUS_RE.test(lower) ? 'opus-legacy' : 'opus';
  if (lower.includes('haiku')) return LEGACY_HAIKU_RE.test(lower) ? 'haiku-legacy' : 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';
  return lower;
}

export function resolvePricingModelName(model: string, source?: PricingSource): string {
  const normalized = normalizeModelName(model);
  if (source !== 'codex') return normalized;
  if (normalized && MODEL_PRICING[normalized]) return normalized;
  return DEFAULT_CODEX_MODEL;
}

/**
 * 単価の選択に使うキー。集計キー（resolvePricingModelName）が family 単位なのに対し、
 * 同じ family の中で単価が変わった世代だけを別キーへ分ける。
 *
 * Why not: 集計キー自体を世代で分けない。activity_session_costs.model や日次集計は family キーで
 * 蓄積されており、Opus 占有率などの時系列が世代交代のたびに別系列へ割れる。
 * Mythos 5.1 はキャッシュ読取単価が未公表のため fable（Fable 5 と同じ単価）に残す。
 */
// 世代トークンの直後は「終端・数字/ドット/ハイフン以外（[1m] 等）・日付 8 桁・英字で始まる別名（-latest 等）」を許す。
// Why not: 数字やドットの続きは許さない。sonnet-5-5 や opus-5-50 のような別世代の ID を取り違えるため。
const GENERATION_END = String.raw`(?:$|[^0-9.\-]|-(?:\d{8}(?!\d)|[a-z]))`;
const RATE_GENERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(String.raw`opus-5[-.]5` + GENERATION_END), 'opus-5.5'],
  [new RegExp(String.raw`fable-5[-.]1` + GENERATION_END), 'fable-5.1'],
  [new RegExp(String.raw`sonnet-5` + GENERATION_END), 'sonnet-5'],
];

export function resolveRateModelName(model: string, source?: PricingSource): string {
  const lower = model.toLowerCase().trim();
  const generation = RATE_GENERATIONS.find(([re]) => re.test(lower));
  return generation ? generation[1] : resolvePricingModelName(model, source);
}

/**
 * 料金表にエントリのあるモデルか。false のとき calculateCost は既定単価
 * （claude 系: sonnet / codex 系: gpt-5.1-codex）へフォールバックする。
 * 呼び出し側はこの判定で WARN ログを出し、silent フォールバックを可視化する。
 *
 * resolvePricingModelName ではなく normalizeModelName で判定する。resolve は
 * codex ソースで既定キーへ畳んでから返すため、それを見ると未知の Codex モデルが
 * 常に「既知」になり検知が無効化される（レビュー指摘 2026-07-19）。
 */
export function isKnownPricingModel(model: string): boolean {
  return MODEL_PRICING[normalizeModelName(model)] !== undefined;
}

/**
 * モデル別集計の対象にしてよい値か。'<synthetic>' などモデル ID でない番兵値を除外する。
 * 空文字は従来どおり通す（既存挙動の維持。空はソース別の既定解決に委ねる）。
 */
export function isCountableModel(model: string): boolean {
  return !/[<>]/.test(model);
}

export function calculateCost(model: string, usage: TokenUsage, source?: PricingSource): number {
  const pricing = MODEL_PRICING[resolveRateModelName(model, source)] ?? MODEL_PRICING[DEFAULT_MODEL];
  const inputCost = (usage.inputTokens * pricing.inputPerM) / 1_000_000;
  const outputCost = (usage.outputTokens * pricing.outputPerM) / 1_000_000;
  const cacheReadCost =
    (usage.cacheReadTokens * pricing.inputPerM * pricing.cacheReadMultiplier) / 1_000_000;
  const cacheCreationCost =
    (usage.cacheCreationTokens * pricing.inputPerM * pricing.cacheCreationMultiplier) / 1_000_000;
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}
