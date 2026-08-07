import type { MemoryDbConnection } from '../db/connection/types';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { ParsedFinding } from '../ingest/review/findingHelpers';
import { upsertReviewFinding } from '../ingest/review/persist';
import { noopLogger, type MemoryLogger } from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewFindingExtractionResult {
  status: 'success' | 'partial' | 'error';
  /** 対象にした review 行数 */
  reviews_scanned: number;
  /** 1 件以上抽出できた review 行数 */
  reviews_with_findings: number;
  /** 登録した finding 数 */
  findings_inserted: number;
  /** 原文照合に落ちて捨てた finding 数 */
  findings_rejected: number;
  /** LLM 呼び出しに失敗した review 行数 */
  reviews_failed: number;
  error_detail: string;
}

export interface ReviewFindingExtractionInput {
  db: MemoryDbConnection;
  ollama: OllamaClient;
  /** 抽出元の本文を review_id から解決する。呼び出し元が trail.db / ファイルから供給する */
  resolveBody: (review: { id: string; source_kind: string; source_ref: string }) => string | null;
  model?: string;
  recordedAt: string;
  /** 一度に処理する上限。省略時は無制限 */
  limit?: number;
  logger?: MemoryLogger;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'qwen3:8b';
/** LLM へ渡す本文の上限。長すぎるとモデルが末尾を落とす */
const MAX_BODY_CHARS = 12000;
/** 1 レビューあたりの登録上限。異常な大量出力を止める */
const MAX_FINDINGS_PER_REVIEW = 20;
/** 逐語引用として認める最小長。短すぎると偶然一致する */
const MIN_QUOTE_CHARS = 16;

const SEVERITIES = new Set(['error', 'warn', 'info']);
const CATEGORIES = new Set([
  'design', 'a11y', 'security', 'perf', 'naming', 'spec', 'logic', 'other',
]);

const PROMPT_TEMPLATE = `あなたはコードレビュー記録の構造化を行う。以下はレビュアーが書いたレビュー本文である。

本文から「指摘」だけを抽出し、JSON で返す。指摘とは、修正・改善が必要だと述べている箇所を指す。

**抽出しないもの**: 総合評価・良い点・褒めている記述・レビュー対象の説明・作業ログ・「問題なし」の結論。

各指摘について次を返す。

- title: 30 文字以内の要約
- quote: **本文からの逐語引用**（1 行以上・16 文字以上・改変禁止）。その指摘の根拠になる箇所をそのままコピーする
- finding_text: 何が問題かの説明
- suggestion_text: 修正案（本文に無ければ空文字）
- severity: error / warn / info のいずれか
- category: design / a11y / security / perf / naming / spec / logic / other のいずれか
- target_file_path: 対象ファイルのパス（本文に書かれていなければ空文字）

指摘が 1 件も無ければ findings を空配列にする。**本文に書かれていないことを足さない。**

出力形式:
{"findings":[{"title":"...","quote":"...","finding_text":"...","suggestion_text":"...","severity":"warn","category":"logic","target_file_path":"..."}]}

--- レビュー本文ここから ---
{{BODY}}
--- レビュー本文ここまで ---`;

// ── Private helpers ───────────────────────────────────────────────────────────

interface RawFinding {
  title?: unknown;
  quote?: unknown;
  finding_text?: unknown;
  suggestion_text?: unknown;
  severity?: unknown;
  category?: unknown;
  target_file_path?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 引用照合用に空白を潰す。改行・全角空白の差で落ちるのを避ける */
function normalize(text: string): string {
  return text.replace(/[\s　]+/g, '');
}

/**
 * LLM 応答から findings 配列を取り出す。
 *
 * `format: 'json'` を指定しても思考ブロックや前置きが混ざるモデルがあるため、
 * 最初の `{` から最後の `}` までを切り出してから parse する。
 */
function parseFindings(responseText: string, logger: MemoryLogger): RawFinding[] | null {
  const start = responseText.indexOf('{');
  const end = responseText.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(responseText.slice(start, end + 1));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const findings = (parsed as { findings?: unknown }).findings;
    if (!Array.isArray(findings)) return null;
    return findings as RawFinding[];
  } catch (err) {
    logger.warn?.(
      `[anytime-memory] runReviewFindingExtraction: JSON parse failed — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/**
 * 抽出結果を原文と照合し、根拠のあるものだけを ParsedFinding へ変換する。
 *
 * quote が原文に無いものは捨てる。LLM が本文に書かれていない指摘を作った場合、
 * それを「レビュアーの指摘」として記録すると、誰も言っていない指摘が未対処として
 * 永久に残る（褒め言葉を指摘化するのと同じ壊れ方）。
 */
function groundFindings(
  raws: RawFinding[],
  body: string,
  startIndex: number,
): { findings: ParsedFinding[]; rejected: number } {
  const normalizedBody = normalize(body);
  const findings: ParsedFinding[] = [];
  let rejected = 0;

  for (const raw of raws) {
    if (findings.length >= MAX_FINDINGS_PER_REVIEW) {
      rejected += 1;
      continue;
    }
    const quote = str(raw.quote);
    const findingText = str(raw.finding_text) || str(raw.title);
    if (quote.length < MIN_QUOTE_CHARS || findingText.length === 0) {
      rejected += 1;
      continue;
    }
    if (!normalizedBody.includes(normalize(quote))) {
      rejected += 1;
      continue;
    }
    // 対象パスも本文に現れるものだけ採る（LLM が典型的なパスを創作するため）
    const rawTarget = str(raw.target_file_path);
    const target = rawTarget.length > 0 && body.includes(rawTarget) ? rawTarget : null;
    const severity = SEVERITIES.has(str(raw.severity)) ? str(raw.severity) : 'info';
    const category = CATEGORIES.has(str(raw.category)) ? str(raw.category) : 'other';

    findings.push({
      finding_index: startIndex + findings.length,
      category: category as ParsedFinding['category'],
      severity: severity as ParsedFinding['severity'],
      target_file_path: target,
      target_symbol: null,
      target_line_start: null,
      target_line_end: null,
      finding_text: `${str(raw.title)}\n\n${findingText}`.trim(),
      suggestion_text: str(raw.suggestion_text),
      checklist_ref: null,
    } as ParsedFinding);
  }

  return { findings, rejected };
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * 書式非準拠で finding を抽出できなかった review 行について、本文から LLM で
 * 指摘を再抽出して登録する救済経路。
 *
 * 対象は「本文があるのに finding が 0 件」の行だけ。書式準拠で取り込めた行には触れない。
 *
 * 登録した finding には `extracted_by = 'llm:<model>'` が入る。書式準拠の finding
 * （空文字）と区別できるようにするのは、精度が劣ることと、後から一括で取り消せる
 * ようにするため。
 *
 * **本文に無い指摘は登録しない**: LLM の出力は逐語引用（quote）を要求し、それが原文に
 * 現れないものは捨てる。誰も言っていない指摘が未対処として永久に残るのを防ぐ。
 */
export async function runReviewFindingExtraction(
  input: ReviewFindingExtractionInput,
): Promise<ReviewFindingExtractionResult> {
  const { db, ollama, resolveBody, recordedAt } = input;
  const logger = input.logger ?? noopLogger;
  const model = input.model ?? DEFAULT_MODEL;

  const result: ReviewFindingExtractionResult = {
    status: 'success',
    reviews_scanned: 0,
    reviews_with_findings: 0,
    findings_inserted: 0,
    findings_rejected: 0,
    reviews_failed: 0,
    error_detail: '',
  };

  let targets: Array<{ id: string; source_kind: string; source_ref: string }>;
  try {
    const stmt = db.prepare(
      `SELECT id, source_kind, source_ref FROM memory_reviews r
        WHERE r.body_excerpt <> ''
          AND NOT EXISTS (SELECT 1 FROM memory_review_findings f WHERE f.review_id = r.id)
        ORDER BY r.reviewed_at DESC` + (input.limit ? ` LIMIT ${Number(input.limit)}` : ''),
    );
    try {
      targets = stmt.all().map((row) => ({
        id: String(row['id']),
        source_kind: String(row['source_kind']),
        source_ref: String(row['source_ref']),
      }));
    } finally {
      stmt.free?.();
    }
  } catch (err) {
    return {
      ...result,
      status: 'error',
      error_detail: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
    };
  }

  for (const target of targets) {
    result.reviews_scanned += 1;
    const body = resolveBody(target);
    if (body === null || body.trim().length === 0) {
      // 本文を復元できない行（元メッセージが無い等）。失敗ではないので数えない
      continue;
    }

    let raws: RawFinding[] | null;
    try {
      const prompt = PROMPT_TEMPLATE.replace('{{BODY}}', body.slice(0, MAX_BODY_CHARS));
      const response = await ollama.generate({ model, prompt, format: 'json' });
      raws = parseFindings(response.response ?? '', logger);
    } catch (err) {
      result.reviews_failed += 1;
      logger.warn?.(
        `[anytime-memory] runReviewFindingExtraction: LLM 失敗 review=${target.id} — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    if (raws === null) {
      result.reviews_failed += 1;
      continue;
    }

    const { findings, rejected } = groundFindings(raws, body, 0);
    result.findings_rejected += rejected;
    if (findings.length === 0) continue;

    let insertedForReview = 0;
    for (const finding of findings) {
      const upserted = upsertReviewFinding(db, target.id, finding, recordedAt, logger);
      if (!upserted.inserted) continue;
      db.run(
        `UPDATE memory_review_findings SET extracted_by = ?
          WHERE review_id = ? AND finding_index = ?`,
        [`llm:${model}`, target.id, finding.finding_index],
      );
      insertedForReview += 1;
    }
    if (insertedForReview > 0) {
      result.reviews_with_findings += 1;
      result.findings_inserted += insertedForReview;
    }
  }

  if (result.reviews_failed > 0) {
    result.status = result.findings_inserted > 0 ? 'partial' : 'error';
  }

  logger.info(
    `[${recordedAt}] [INFO] [anytime-memory] runReviewFindingExtraction: ` +
      `scanned=${result.reviews_scanned} with_findings=${result.reviews_with_findings} ` +
      `inserted=${result.findings_inserted} rejected=${result.findings_rejected} ` +
      `failed=${result.reviews_failed}`,
  );
  return result;
}
