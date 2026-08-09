import type { CaravanDbConnection } from '../db/connection/types';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { ParsedFinding } from '../ingest/review/findingHelpers';
import { upsertReviewFinding } from '../ingest/review/persist';
import { noopLogger, type CaravanLogger } from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewFindingRejectCounts {
  /** 引用が原文の指摘セクションに見つからない = 捏造の検知 */
  ungrounded: number;
  /** 引用が短い・本文が空・重大度/カテゴリが不正 = 形式不備 */
  malformed: number;
  /** 1 レビューあたりの上限超過 = 正当な指摘の切り捨て */
  overflow: number;
}

export interface ReviewFindingExtractionResult {
  status: 'success' | 'partial' | 'error';
  reviews_scanned: number;
  reviews_with_findings: number;
  findings_inserted: number;
  /**
   * 捨てた finding 数の理由別内訳。合算値だけだと「よく防いでいる」と
   * 「正当な指摘を落としている」を区別できない。
   */
  rejected: ReviewFindingRejectCounts;
  reviews_failed: number;
  error_detail: string;
}

export interface ReviewFindingExtractionInput {
  db: CaravanDbConnection;
  ollama: OllamaClient;
  /** 抽出元の本文を review 行から解決する。呼び出し元が activity.db / ファイルから供給する */
  resolveBody: (review: { id: string; source_kind: string; source_ref: string }) => string | null;
  model?: string;
  recordedAt: string;
  limit?: number;
  /** 対象 source_kind。既定は session のみ（review .md は書き直しで直せる） */
  sourceKinds?: readonly string[];
  /** DB へ書かず件数だけ数える。LLM 呼び出しと照合は実行する */
  dryRun?: boolean;
  logger?: CaravanLogger;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'qwen3:8b';
const DEFAULT_SOURCE_KINDS = ['session'] as const;
const MAX_BODY_CHARS = 12000;
const MAX_FINDINGS_PER_REVIEW = 20;

/**
 * 逐語引用として認める最小長（**空白を潰した後**の長さ）。
 * 生の長さで測ると空白混じりの引用が正規化後に痩せ、日本語本文では偶然一致する。
 */
const MIN_QUOTE_CHARS = 24;

/**
 * finding_index の起点。実パーサが出す index（0 起点）と衝突させない。
 *
 * caravan_review_findings は UNIQUE(review_id, finding_index) で、挿入は
 * INSERT OR IGNORE。同じ index を LLM が先に占めると、後から書式準拠でパースし直した
 * **本物の指摘が 1 件残らず黙って捨てられる**（inserted=false になるだけ）。
 */
const LLM_FINDING_INDEX_OFFSET = 10000;

/**
 * 指摘ではないセクションの見出し。ここ由来の引用は採らない。
 *
 * 引用が本文に実在するだけでは「指摘の実在」を保証しない。褒め言葉や総合評価から
 * 16 文字を引いて無関係な指摘を組み立てられてしまうため、引用元のセクションを見る。
 */
// 末尾に \b を置かないのは、JS の \b が [A-Za-z0-9_] 基準で、日本語文字の直後では
// 境界が成立せず判定が丸ごと効かなくなるため（「良い点」が除外されない）。
// 前方一致にしているので「総合評価とまとめ」のような派生見出しも除外側に入る。
const NON_FINDING_HEADINGS =
  /^\s*(?:総合評価|総評|概要|サマリ|サマリー|良い点|評価|結論|レビュー対象|次のアクション|補足情報|検証済み|Summary|Assessment|Strengths|Overview|Conclusion|Recommendations?|Good\s+points?)/i;

const SEVERITIES = new Set(['error', 'warn', 'info']);
const CATEGORIES = new Set([
  'design', 'a11y', 'security', 'perf', 'naming', 'spec', 'logic', 'other',
]);

const PROMPT_TEMPLATE = `あなたはコードレビュー記録の構造化を行う。以下はレビュアーが書いたレビュー本文である。

本文から「指摘」だけを抽出し、JSON で返す。指摘とは、修正・改善が必要だと述べている箇所を指す。

**抽出しないもの**: 総合評価・良い点・褒めている記述・レビュー対象の説明・作業ログ・「問題なし」の結論。

各指摘について次を返す。

- title: 30 文字以内の要約
- quote: **本文からの逐語引用**（24〜200 文字・改変禁止）。その指摘を述べている**地の文を 1 行だけ**コピーする。総合評価や良い点のセクションから引用してはならない。
  **コードブロック・バッククォート 3 連・改行を含めてはならない**（JSON が壊れるため）
- finding_text: 何が問題かの説明
- suggestion_text: 修正案（本文に無ければ空文字）
- severity: error / warn / info のいずれか（判断できなければその指摘を出さない）
- category: design / a11y / security / perf / naming / spec / logic / other のいずれか
- target_file_path: 対象ファイルのパス（本文に書かれていなければ空文字）

指摘が 1 件も無ければ findings を空配列にする。**本文に書かれていないことを足さない。**

すべての値は 1 行の文字列にする。改行・コードブロックを値へ入れない。

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
 * 本文を見出しで区切り、**指摘セクションだけ**を連結して返す。
 * 引用の照合対象をここに限ることで、褒め言葉からの引用を弾く。
 */
function findingSectionsOf(body: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  let excluding = false;
  for (const line of lines) {
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      excluding = NON_FINDING_HEADINGS.test(heading[1]);
      continue;
    }
    if (!excluding) kept.push(line);
  }
  return normalize(kept.join('\n'));
}

/**
 * JSON 文字列リテラルの内側にある**裸の改行だけ**を `\n` へ置き換える。
 *
 * `"` の内外を 1 文字ずつ追跡し、エスケープ済みの `\"` は状態を反転させない。
 * 構造（`{}` `[]` `,`）には触れないので、壊れ方が改行以外なら parse は失敗したままになる
 * （推測で修復すると、モデルが途中で切った出力を「完全な結果」として登録してしまう）。
 */
function escapeRawNewlinesInStrings(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && (ch === '\n' || ch === '\r')) {
      out += ch === '\n' ? '\\n' : '\\r';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * LLM 応答から findings 配列を取り出す。
 *
 * `format: 'json'` を指定しても思考ブロックや前置きが混ざるモデルがあるため、
 * 最初の `{` から最後の `}` までを切り出してから parse する。
 * 失敗はすべて理由付きでログへ出す（無言で null を返すと 223 件の実行で
 * 「failed=40」としか分からず切り分けできない）。
 */
function parseFindings(
  responseText: string,
  reviewId: string,
  logger: CaravanLogger,
): RawFinding[] | null {
  const head = responseText.slice(0, 200).replace(/\n/g, ' ');
  const start = responseText.indexOf('{');
  const end = responseText.lastIndexOf('}');
  if (start < 0 || end <= start) {
    logger.warn?.(
      `[anytime-memory] runReviewFindingExtraction: JSON が見つからない review=${reviewId} head="${head}"`,
    );
    return null;
  }
  const jsonText = responseText.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (firstErr) {
    // 実測で支配的な壊れ方は「値の中に生の改行が入る」（コードブロックを引用したとき）。
    // 文字列リテラル内の裸の改行だけをエスケープして 1 度だけ復旧を試みる。
    // これで直らないものは捨てる（壊れた JSON を推測で埋めない）。
    try {
      parsed = JSON.parse(escapeRawNewlinesInStrings(jsonText));
    } catch {
      logger.warn?.(
        `[anytime-memory] runReviewFindingExtraction: JSON parse 失敗 review=${reviewId} ` +
          `err=${firstErr instanceof Error ? firstErr.message : String(firstErr)} head="${head}"`,
      );
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    logger.warn?.(
      `[anytime-memory] runReviewFindingExtraction: 応答がオブジェクトでない review=${reviewId} head="${head}"`,
    );
    return null;
  }
  const findings = (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(findings)) {
    logger.warn?.(
      `[anytime-memory] runReviewFindingExtraction: findings 配列が無い review=${reviewId} head="${head}"`,
    );
    return null;
  }
  return findings as RawFinding[];
}

/**
 * 抽出結果を原文と照合し、根拠のあるものだけを ParsedFinding へ変換する。
 *
 * 捨てる条件:
 * - 引用が指摘セクションに無い（捏造・褒め言葉からの流用）
 * - 引用が短い / 本文が空
 * - severity / category が許容値でない（既定値で埋めると集計と skip 内訳が歪む。
 *   救済経路の性質上、値を欠く指摘を無理に残す価値は低い）
 */
function groundFindings(
  raws: RawFinding[],
  body: string,
): { findings: ParsedFinding[]; rejected: ReviewFindingRejectCounts } {
  const findingSections = findingSectionsOf(body);
  const findings: ParsedFinding[] = [];
  const rejected: ReviewFindingRejectCounts = { ungrounded: 0, malformed: 0, overflow: 0 };

  for (const raw of raws) {
    if (findings.length >= MAX_FINDINGS_PER_REVIEW) {
      rejected.overflow += 1;
      continue;
    }
    const quote = normalize(str(raw.quote));
    const findingText = str(raw.finding_text) || str(raw.title);
    const severity = str(raw.severity);
    const category = str(raw.category);

    if (
      quote.length < MIN_QUOTE_CHARS ||
      findingText.length === 0 ||
      !SEVERITIES.has(severity) ||
      !CATEGORIES.has(category)
    ) {
      rejected.malformed += 1;
      continue;
    }
    if (!findingSections.includes(quote)) {
      rejected.ungrounded += 1;
      continue;
    }

    // 対象パスも本文に現れるものだけ採る（LLM が典型的なパスを創作するため）
    const rawTarget = str(raw.target_file_path);
    const target = rawTarget.length > 0 && body.includes(rawTarget) ? rawTarget : null;

    findings.push({
      finding_index: LLM_FINDING_INDEX_OFFSET + findings.length,
      category: category as ParsedFinding['category'],
      severity: severity as ParsedFinding['severity'],
      target_file_path: target,
      target_symbol: null,
      target_line_start: null,
      target_line_end: null,
      finding_text: `${str(raw.title)}\n\n${findingText}`.trim(),
      suggestion_text: str(raw.suggestion_text),
      chapter_path: '',
      // 本文構造からの推定ではなく LLM の申告なので、推定扱いにする
      is_category_inferred: true,
      checklist_ref: null,
    });
  }

  return { findings, rejected };
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * 書式非準拠で finding を抽出できなかった review 行について、本文から LLM で
 * 指摘を再抽出して登録する救済経路。
 *
 * 対象は「本文があるのに finding が 0 件」かつ `source_kind` が {@link DEFAULT_SOURCE_KINDS}
 * の行だけ。review .md は書き直しで直せるため既定では対象外にする
 * （書き直した正しい指摘を LLM の近似が締め出さないようにするため）。
 *
 * **定期実行の pipeline ではない。** LLM 実行を伴う一回限りの救済で、
 * `CaravanDbSession` からは呼ばない。実行は `dryRun: true` で件数を確認してから行う。
 *
 * 登録した finding には `extracted_by = 'llm:<model>'` が入る（INSERT に含めるので
 * 刻印漏れは起きない）。`DELETE ... WHERE extracted_by LIKE 'llm:%'` で一括で戻せる。
 *
 * **本文に無い指摘は登録しない**: LLM へ逐語引用を要求し、それが本文の**指摘セクション**
 * に現れないものは捨てる。誰も言っていない指摘が未対処として永久に残るのを防ぐ。
 */
export async function runReviewFindingExtraction(
  input: ReviewFindingExtractionInput,
): Promise<ReviewFindingExtractionResult> {
  const { db, ollama, resolveBody, recordedAt } = input;
  const logger = input.logger ?? noopLogger;
  const model = input.model ?? DEFAULT_MODEL;
  const dryRun = input.dryRun ?? false;
  const sourceKinds = input.sourceKinds ?? DEFAULT_SOURCE_KINDS;

  const result: ReviewFindingExtractionResult = {
    status: 'success',
    reviews_scanned: 0,
    reviews_with_findings: 0,
    findings_inserted: 0,
    rejected: { ungrounded: 0, malformed: 0, overflow: 0 },
    reviews_failed: 0,
    error_detail: '',
  };

  let targets: Array<{ id: string; source_kind: string; source_ref: string }>;
  try {
    const placeholders = sourceKinds.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT id, source_kind, source_ref FROM caravan_reviews r
        WHERE r.body_excerpt <> ''
          AND r.source_kind IN (${placeholders})
          AND NOT EXISTS (SELECT 1 FROM caravan_review_findings f WHERE f.review_id = r.id)
        ORDER BY r.reviewed_at DESC` + (input.limit ? ` LIMIT ${Number(input.limit)}` : ''),
    );
    try {
      targets = stmt.all(...sourceKinds).map((row) => ({
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
      raws = parseFindings(response.response ?? '', target.id, logger);
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

    const { findings, rejected } = groundFindings(raws, body);
    result.rejected.ungrounded += rejected.ungrounded;
    result.rejected.malformed += rejected.malformed;
    result.rejected.overflow += rejected.overflow;
    if (findings.length === 0) continue;

    if (dryRun) {
      result.reviews_with_findings += 1;
      result.findings_inserted += findings.length;
      continue;
    }

    // review 単位でトランザクションを張る。途中で落ちたときに
    // entity だけ作られて finding が無い中途半端な行を残さない。
    let insertedForReview = 0;
    db.run('BEGIN');
    try {
      for (const finding of findings) {
        const upserted = upsertReviewFinding(
          db, target.id, finding, recordedAt, logger, `llm:${model}`,
        );
        if (upserted.inserted) insertedForReview += 1;
      }
      db.run('COMMIT');
    } catch (err) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackErr) {
        logger.error(
          `[anytime-memory] runReviewFindingExtraction: ROLLBACK 自体が失敗 review=${target.id}`,
          rollbackErr,
        );
      }
      result.reviews_failed += 1;
      logger.error(
        `[anytime-memory] runReviewFindingExtraction: 登録に失敗 review=${target.id}`,
        err,
      );
      continue;
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
      `inserted=${result.findings_inserted} failed=${result.reviews_failed} ` +
      `rejected(ungrounded=${result.rejected.ungrounded} malformed=${result.rejected.malformed} ` +
      `overflow=${result.rejected.overflow}) dry_run=${dryRun}`,
  );
  return result;
}
