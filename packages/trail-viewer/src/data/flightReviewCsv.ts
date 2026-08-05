/**
 * flightReviewCsv — Flight Review（セッション単位）と Flight Record（指示単位）の CSV エクスポート（FR-19）。
 *
 * build*Csv は純粋関数（RFC 4180: カンマ・引用符・改行をエスケープ、CRLF 区切り）。
 * ダウンロードの副作用は downloadCsv に分離する。
 */
import type { FlightReviewDto } from './flightReviewStore';
import type { InstructionRecordDto } from './instructionStore';

const HEADER = [
  'sessionId',
  'startedAt',
  'endedAt',
  'durationSeconds',
  'outcome',
  'outcomeSource',
  'toolCallCount',
  'toolFailureCount',
  'reworkCount',
  'tags',
  'notes',
] as const;

/** RFC 4180: カンマ・引用符・改行を含むフィールドは二重引用符で囲み、引用符は二重化する。 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** 表計算ソフトの式評価（CSV formula injection）を防ぐ。数値・enum 由来は対象外。 */
function sanitizeFormulaPrefix(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function toField(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'string') return escapeCsvField(sanitizeFormulaPrefix(value));
  return escapeCsvField(String(value));
}

export function buildFlightReviewCsv(reviews: readonly FlightReviewDto[]): string {
  const rows = reviews.map((r) =>
    [
      toField(r.sessionId),
      toField(r.startedAt),
      toField(r.endedAt),
      toField(r.durationSeconds),
      toField(r.outcome),
      toField(r.outcomeSource),
      toField(r.toolCallCount),
      toField(r.toolFailureCount),
      toField(r.reworkCount),
      // tags は JSON 配列文字列のまま出す（区切り文字 join は tag 内の同文字と衝突して非可逆）
      toField(r.tags),
      toField(r.notes),
    ].join(','),
  );
  return [HEADER.join(','), ...rows].join('\r\n');
}

const RECORD_HEADER = [
  'instructionId',
  'summary',
  'originPrompt',
  'workspaceName',
  'startedAt',
  'endedAt',
  'durationSeconds',
  'outcome',
  'outcomeSource',
  'sessionCount',
  'docDeliverables',
  'codeDeliverables',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
  'estimatedCostUsd',
  'toolCallCount',
  'toolFailureCount',
  'reworkCount',
  'tags',
] as const;

/**
 * Flight Record（指示単位）の CSV。列は一覧の列に起点プロンプトとトークン内訳を加えたもの。
 * トークンが未取込のときは 0 ではなく空欄にする（表計算側で 0 と平均されないため）。
 */
export function buildFlightRecordCsv(records: readonly InstructionRecordDto[]): string {
  const rows = records.map((r) => {
    const docs = r.deliverables.filter((d) => d.kind === 'doc').length;
    const code = r.deliverables.length - docs;
    const usage = r.tokenUsage;
    const tokenField = (value: number): string => (usage.imported ? toField(value) : '');
    return [
      toField(r.instructionId),
      toField(r.summary),
      toField(r.originPrompt),
      toField(r.workspaceName),
      toField(r.startedAt),
      toField(r.endedAt),
      toField(r.durationSeconds),
      toField(r.outcome),
      toField(r.outcomeSource),
      toField(r.sessionCount),
      toField(docs),
      toField(code),
      tokenField(usage.inputTokens),
      tokenField(usage.outputTokens),
      tokenField(usage.cacheReadTokens),
      tokenField(usage.cacheCreationTokens),
      usage.imported ? toField(usage.estimatedCostUsd) : '',
      toField(r.toolCallCount),
      toField(r.toolFailureCount),
      toField(r.reworkCount),
      // tags は JSON 配列文字列で出す（区切り文字 join は tag 内の同文字と衝突して非可逆）
      toField(JSON.stringify(r.tags)),
    ].join(',');
  });
  return [RECORD_HEADER.join(','), ...rows].join('\r\n');
}

/** 副作用: Blob を生成しブラウザにダウンロードさせる。jsdom では検証しない（実機確認）。 */
export function downloadCsv(doc: Document, filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
