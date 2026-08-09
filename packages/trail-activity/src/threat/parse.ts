/**
 * 検知 LLM 応答のパーサ。出典: https://github.com/uber/ADR の adr_baseline.py
 * （Apache License 2.0）のパース仕様を、文字列 split ではなく型ガードで再実装した。
 * Tier 1 は fail-closed（曖昧・壊れた応答は suspicious 側）、Tier 2 は判別可能
 * union で unparseable を返し、呼び出し側の refusal リトライ分岐に委ねる。
 */

import {
  THREAT_TACTIC_IDS,
  type DetectionParseResult,
  type ThreatTacticId,
  type TriageVerdict,
} from './types';

const DEFAULT_CONFIDENCE = 0.8;

function extractLineValue(text: string, label: string): string | null {
  const lower = text.toLowerCase();
  const index = lower.indexOf(label);
  if (index === -1) {
    return null;
  }
  const rest = text.slice(index + label.length);
  const line = rest.split('\n')[0].trim();
  return line.length > 0 ? line : null;
}

function extractTactic(text: string): ThreatTacticId | null {
  const value = extractLineValue(text, 'threat_tactic:');
  if (value === null) {
    return null;
  }
  const lowered = value.toLowerCase();
  return THREAT_TACTIC_IDS.find((tactic) => lowered.includes(tactic)) ?? null;
}

function extractConfidence(text: string): number {
  const value = extractLineValue(text, 'confidence:');
  if (value === null) {
    return DEFAULT_CONFIDENCE;
  }
  const parsed = Number.parseFloat(value.split(/\s+/)[0]);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_CONFIDENCE;
  }
  return parsed;
}

/**
 * Tier 1 triage 応答を解析する。BENIGN と明言され SUSPICIOUS が現れない場合のみ
 * 非 suspicious とし、それ以外（両方出現・どちらも無い・形式崩れ）は suspicious へ
 * 倒す（原典の high-recall 方針）。
 */
export function parseTriageResponse(text: string): TriageVerdict {
  const lower = text.toLowerCase();
  const isSuspicious = !(lower.includes('benign') && !lower.includes('suspicious'));
  const reason =
    extractLineValue(text, 'reasoning:') ?? extractLineValue(text, 'reason:') ?? 'Fast triage assessment';
  return {
    kind: 'triage',
    isSuspicious,
    tactic: isSuspicious ? extractTactic(text) : null,
    confidence: extractConfidence(text),
    reason,
  };
}

function findBalancedJson(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Tier 2 reasoning 応答から `{"is_threat": ...}` JSON を抽出して解析する。
 * 前後の散文・入れ子 brace・文字列中の brace に耐える（原典の brace バランス走査）。
 */
export function parseDetectionResponse(text: string): DetectionParseResult {
  const anchor = text.indexOf('"is_threat"');
  if (anchor === -1) {
    return { kind: 'unparseable', reason: 'no "is_threat" JSON object found in response' };
  }
  const start = text.lastIndexOf('{', anchor);
  if (start === -1) {
    return { kind: 'unparseable', reason: 'no opening brace before "is_threat"' };
  }
  const jsonText = findBalancedJson(text, start);
  if (jsonText === null) {
    return { kind: 'unparseable', reason: 'unbalanced braces around "is_threat" JSON object' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      kind: 'unparseable',
      reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isRecord(parsed) || typeof parsed.is_threat !== 'boolean') {
    return { kind: 'unparseable', reason: 'is_threat is missing or not a boolean' };
  }
  const confidence =
    typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0.5;
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';

  return {
    kind: 'parsed',
    verdict: { kind: 'detection', isThreat: parsed.is_threat, confidence, explanation },
  };
}

const REFUSAL_MARKERS = [
  'prompt injection',
  "won't call nonexistent",
  "won't output",
  "i won't",
  'flagging this before responding',
  'mimics injected content',
  'nonexistent analysis functions',
  "what i won't do",
] as const;

/**
 * 検査対象 transcript を injection と誤認した拒否応答かを判定する。
 * JSON 契約を含む応答は解析可能なので refusal 扱いしない（原典の判定を踏襲）。
 */
export function isRefusalResponse(text: string): boolean {
  if (text.includes('"is_threat"')) {
    return false;
  }
  const lower = text.toLowerCase();
  return REFUSAL_MARKERS.some((marker) => lower.includes(marker));
}
