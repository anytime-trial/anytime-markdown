/**
 * flightReviewFindingsView — Flight Record に出すレビュー指摘の描画（HTML 生成 + リンク配線）。
 *
 * flightRecordPanel から切り出しているのは、指摘の描画が「詳細ペインの節」と
 * 「Review サブタブの全指示横断表」の 2 か所で使われるため。同じ severity 表現・
 * 同じリンク挙動を 2 か所へ書き分けると、片方だけ育って挙動が食い違う。
 *
 * 色は data-* 属性 + 注入スタイルシートが正本（インラインで持たない）。severity は
 * 色だけでなくテキストでも示す（色のみで情報を伝えない）。
 */
import { escapeHtml } from '../shared/escapeHtml';
import type { MemoryFlightReviewFindingRow } from '../data/types';

export type FindingsTranslate = (key: string) => string;

/** severity の並び順。重い順に見せる（error → warn → info）。 */
const SEVERITY_ORDER: Record<string, number> = { error: 0, warn: 1, info: 2 };

export function sortFindings(
  findings: readonly MemoryFlightReviewFindingRow[],
): readonly MemoryFlightReviewFindingRow[] {
  return [...findings].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 9;
    const sb = SEVERITY_ORDER[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.reviewedAt !== b.reviewedAt) return a.reviewedAt < b.reviewedAt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}

function severityChip(t: FindingsTranslate, severity: string): string {
  return `<span data-am-finding-severity data-severity="${escapeHtml(severity)}">${escapeHtml(
    t(`flightRecord.findings.severity.${severity}`),
  )}</span>`;
}

/**
 * 対象ファイル。解決できている場合だけボタン（リンク）にする。
 * null は「対象を特定できなかった」であって「リポジトリ直下」ではないので、
 * 既定値で埋めず未解決として出す。
 */
function targetCell(t: FindingsTranslate, row: MemoryFlightReviewFindingRow, linkable: boolean): string {
  if (row.targetFilePath === null || row.targetFilePath === '') {
    return `<span data-am-finding-target data-unresolved="true">${escapeHtml(t('flightRecord.findings.targetUnresolved'))}</span>`;
  }
  const path = escapeHtml(row.targetFilePath);
  if (!linkable) return `<span data-am-finding-target>${path}</span>`;
  return `<button type="button" data-am-finding-open="${path}"
    title="${escapeHtml(t('flightRecord.findings.openFile'))}">${path}</button>`;
}

function statusCell(t: FindingsTranslate, row: MemoryFlightReviewFindingRow): string {
  if (row.addressedCommitSha) {
    return `<span data-am-finding-status data-addressed="true">${escapeHtml(t('flightRecord.findings.addressed'))}</span>`;
  }
  return `<span data-am-finding-status data-addressed="false">${escapeHtml(t('flightRecord.findings.notAddressed'))}</span>`;
}

/** 一覧の件数セル。未取得（loadFailed）は 0 件と書かない。 */
export function findingCountCell(
  t: FindingsTranslate,
  counts: { error: number; warn: number; info: number; total: number } | null,
  loadFailed: boolean,
): string {
  if (loadFailed) {
    return `<span data-am-finding-count data-state="unknown">${escapeHtml(t('flightRecord.findings.unknown'))}</span>`;
  }
  if (counts === null || counts.total === 0) {
    return `<span data-am-finding-count data-state="none">0</span>`;
  }
  const parts: string[] = [];
  if (counts.error > 0) parts.push(`<span data-am-finding-count data-state="error">${counts.error}</span>`);
  if (counts.warn > 0) parts.push(`<span data-am-finding-count data-state="warn">${counts.warn}</span>`);
  if (counts.info > 0) parts.push(`<span data-am-finding-count data-state="info">${counts.info}</span>`);
  return parts.join('');
}

/** 詳細ペインの「この指示で出た指摘」節。 */
export function renderFindingSection(input: {
  t: FindingsTranslate;
  findings: readonly MemoryFlightReviewFindingRow[];
  loadFailed: boolean;
  linkable: boolean;
}): string {
  const { t, loadFailed, linkable } = input;
  if (loadFailed) {
    return `<p data-am-finding-load-failed role="status">${escapeHtml(t('flightRecord.findings.loadFailed'))}</p>`;
  }
  if (input.findings.length === 0) {
    return `<p data-am-finding-empty>${escapeHtml(t('flightRecord.findings.none'))}</p>`;
  }
  const items = sortFindings(input.findings)
    .map(
      (row) => `<li data-am-finding-item data-finding-id="${escapeHtml(row.id)}">
        <div data-am-finding-head>
          ${severityChip(t, row.severity)}
          <span data-am-finding-category>${escapeHtml(row.category)}</span>
          ${targetCell(t, row, linkable)}
          ${statusCell(t, row)}
        </div>
        <p data-am-finding-text>${escapeHtml(row.findingText)}</p>
      </li>`,
    )
    .join('');
  return `<ul data-am-finding-list>${items}</ul>`;
}

/** Review サブタブの全指示横断表。 */
export function renderFindingTable(input: {
  t: FindingsTranslate;
  findings: readonly MemoryFlightReviewFindingRow[];
  loadFailed: boolean;
  linkable: boolean;
  /** instructionId → 一覧に出す指示名（未宣言はセッション ID 先頭 8 桁）。 */
  labelOf: (instructionId: string) => string;
}): string {
  const { t, loadFailed, linkable, labelOf } = input;
  if (loadFailed) {
    return `<p data-am-finding-load-failed role="status">${escapeHtml(t('flightRecord.findings.loadFailed'))}</p>`;
  }
  if (input.findings.length === 0) {
    return `<p data-am-finding-empty>${escapeHtml(t('flightRecord.findings.none'))}</p>`;
  }
  const rows = sortFindings(input.findings)
    .map(
      (row) => `<tr data-am-finding-row data-finding-id="${escapeHtml(row.id)}"
        data-instruction-id="${escapeHtml(row.instructionId)}">
        <td>${escapeHtml(labelOf(row.instructionId))}</td>
        <td>${severityChip(t, row.severity)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${targetCell(t, row, linkable)}</td>
        <td data-am-finding-text-cell>${escapeHtml(row.findingText)}</td>
        <td>${escapeHtml(row.reviewedAt.slice(0, 10))}</td>
        <td>${statusCell(t, row)}</td>
      </tr>`,
    )
    .join('');
  return `
    <p data-am-finding-note>${escapeHtml(t('flightRecord.findings.scopeNote'))}</p>
    <table data-am-finding-table aria-label="${escapeHtml(t('flightRecord.tab.review'))}">
      <thead><tr>
        <th>${escapeHtml(t('flightRecord.column.instruction'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.severity'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.category'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.target'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.finding'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.reviewedAt'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.status'))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * 対象ファイルボタンへ click を張る。描画のたびに呼ぶ（innerHTML で作り直すため）。
 * onOpenFile が無い環境（webview 外・テスト）ではボタン自体を出さないので、ここは no-op。
 */
export function wireFindingLinks(host: HTMLElement, onOpenFile: (filePath: string) => void): void {
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-am-finding-open]')) {
    const filePath = button.dataset['amFindingOpen'] ?? '';
    if (filePath === '') continue;
    button.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onOpenFile(filePath);
    });
  }
}
