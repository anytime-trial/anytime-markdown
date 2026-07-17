/**
 * flightReviewCsv — Phase 6 S3。Flight Review 一覧の CSV エクスポート（FR-19）。
 *
 * buildFlightReviewCsv は純粋関数（RFC 4180: カンマ・引用符・改行をエスケープ、CRLF 区切り）。
 * ダウンロードの副作用は downloadCsv に分離する。
 */
import type { FlightReviewDto } from './flightReviewStore';

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

function toField(value: string | number | null): string {
  if (value === null) return '';
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
