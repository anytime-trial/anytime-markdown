// domain/engine/pricing.ts — Model pricing and cost calculation

import type { TokenUsage, ModelPricing } from '../model/cost';

export type { TokenUsage, ModelPricing };
export type PricingSource = 'claude_code' | 'codex';

// 価格の正は Anthropic 公式（platform.claude.com/docs/en/pricing）。
// 世代で価格が変わるモデル（opus / haiku）は世代別キーで持つ。
// 期限付き導入価格（Sonnet 5 の 2026-08-31 までの 2/10 等）は焼き込まない（定価で統一）。
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
// （trail.db の実データは全行 Opus 4.5 以降のため。旧世代は必ずフル ID で流入する）。
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
 * 料金表にエントリのあるモデルか。false のとき calculateCost は既定単価
 * （claude 系: sonnet / codex 系: gpt-5.1-codex）へフォールバックする。
 * 呼び出し側はこの判定で WARN ログを出し、silent フォールバックを可視化する。
 */
export function isKnownPricingModel(model: string, source?: PricingSource): boolean {
  return MODEL_PRICING[resolvePricingModelName(model, source)] !== undefined;
}

/**
 * モデル別集計の対象にしてよい値か。'<synthetic>' などモデル ID でない番兵値を除外する。
 * 空文字は従来どおり通す（既存挙動の維持。空はソース別の既定解決に委ねる）。
 */
export function isCountableModel(model: string): boolean {
  return !/[<>]/.test(model);
}

export function calculateCost(model: string, usage: TokenUsage, source?: PricingSource): number {
  const normalized = resolvePricingModelName(model, source);
  const pricing = MODEL_PRICING[normalized] ?? MODEL_PRICING[DEFAULT_MODEL];
  const inputCost = (usage.inputTokens * pricing.inputPerM) / 1_000_000;
  const outputCost = (usage.outputTokens * pricing.outputPerM) / 1_000_000;
  const cacheReadCost =
    (usage.cacheReadTokens * pricing.inputPerM * pricing.cacheReadMultiplier) / 1_000_000;
  const cacheCreationCost =
    (usage.cacheCreationTokens * pricing.inputPerM * pricing.cacheCreationMultiplier) / 1_000_000;
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}
