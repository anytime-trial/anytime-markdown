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

/**
 * 指摘の対処状態。
 *
 * `notLinkable` は「対処コミットの自動判定にかけられない」指摘で、未対処とは別物。
 * この 2 つを同じ「未対処」で出すと、実測 947 件中 889 件（94%）が判定対象外なのに
 * 全部が放置扱いに見え、本当に対処されていない指摘が埋もれる。
 */
export type FindingStatus = 'addressed' | 'unaddressed' | 'notLinkable';

/** 絞り込みの対処状態。空文字は「すべて」（絞り込みなし）。 */
export type FindingStatusFilter = '' | FindingStatus;

/**
 * Review サブタブの絞り込み条件。各値の空文字は「すべて」で、複数指定は AND で効く。
 * severity / category は列挙を型で固定しない — severity は memory-core が取り込んだ
 * 文字列がそのまま入り（未知値も表に出る）、category はレビュー側が自由に付けるため。
 */
export interface FindingFilter {
  readonly severity: string;
  readonly category: string;
  readonly status: FindingStatusFilter;
}

/**
 * 対処済みかどうか。表の状態セルと絞り込みが同じ述語を使うための単一の正本。
 * 空文字の SHA は「対処コミットが分からない」であって対処済みではない。
 */
function isAddressed(row: MemoryFlightReviewFindingRow): boolean {
  return row.addressedCommitSha !== null && row.addressedCommitSha !== '';
}

/** null と空文字を同じ「未解決」として扱う（DB は経路によってどちらも入る）。 */
function isBlank(value: string | null): boolean {
  return value === null || value === '';
}

/**
 * 表示する対処状態を決める。
 *
 * `notLinkable` の条件は memory-core の `linkAddresses`（対処コミットの自動リンク）が
 * 母集合を絞る条件と**同じもの**を写している: severity=info は対象外、対象ファイルパスと
 * 解決済みリポジトリの両方が揃っていなければ照合できない。片方だけ変えると、
 * 「判定対象なのに永久に未対処」あるいは「対象外なのに未対処表示」が生まれる。
 */
export function deriveFindingStatus(row: MemoryFlightReviewFindingRow): FindingStatus {
  if (isAddressed(row)) return 'addressed';
  if (row.severity === 'info') return 'notLinkable';
  if (isBlank(row.targetFilePath) || isBlank(row.targetRepo)) return 'notLinkable';
  return 'unaddressed';
}

/** 絞り込み。該当なしは空配列（呼び出し側が「絞って 0 件」を区別できるようにする）。 */
export function filterFindings(
  findings: readonly MemoryFlightReviewFindingRow[],
  filter: FindingFilter,
): readonly MemoryFlightReviewFindingRow[] {
  return findings.filter((row) => {
    if (filter.severity !== '' && row.severity !== filter.severity) return false;
    if (filter.category !== '' && row.category !== filter.category) return false;
    if (filter.status !== '' && deriveFindingStatus(row) !== filter.status) return false;
    return true;
  });
}

/**
 * カテゴリの選択肢。取得済みの指摘から作る（固定リストを持たない — カテゴリはレビュー側が
 * 自由に付けるため、列挙をコードへ焼くと新しいカテゴリが絞り込みから消える）。
 */
export function findingCategories(findings: readonly MemoryFlightReviewFindingRow[]): readonly string[] {
  const set = new Set<string>();
  for (const row of findings) {
    if (row.category !== '') set.add(row.category);
  }
  return [...set].sort((a, b) => (a < b ? -1 : 1));
}

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

/** 状態値 → 表示文言の i18n キー。表と絞り込みで同じ文言を使うための単一の正本。 */
export const FINDING_STATUS_LABEL_KEY: Record<FindingStatus, string> = {
  addressed: 'flightRecord.findings.addressed',
  unaddressed: 'flightRecord.findings.notAddressed',
  notLinkable: 'flightRecord.findings.notLinkable',
};

function statusCell(t: FindingsTranslate, row: MemoryFlightReviewFindingRow): string {
  const status = deriveFindingStatus(row);
  // 判定対象外は理由が自明でないので title で補う（色だけ・語だけでは伝わらない）。
  const hint =
    status === 'notLinkable'
      ? ` title="${escapeHtml(t('flightRecord.findings.notLinkableHint'))}"`
      : '';
  return `<span data-am-finding-status data-status="${status}"${hint}>${escapeHtml(
    t(FINDING_STATUS_LABEL_KEY[status]),
  )}</span>`;
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

/**
 * Review サブタブの全指示横断表。
 *
 * 列順は「指摘 → 状態 → レビュー日 → 重大度 → カテゴリ → 対象 → 指示」。指摘本文を先頭に
 * 置くのは、この表を読む目的が「何を指摘されたか」であって、どの指示に属するかは
 * 絞り込み・行クリックで辿る二次情報のため。thead と tbody は同じ順で並べる
 * （片方だけ替えると値が別の列へ入り、件数を見るテストでは捕まらない）。
 */
export function renderFindingTable(input: {
  t: FindingsTranslate;
  findings: readonly MemoryFlightReviewFindingRow[];
  loadFailed: boolean;
  linkable: boolean;
  /** instructionId → 一覧に出す指示名（未宣言はセッション ID 先頭 8 桁）。 */
  labelOf: (instructionId: string) => string;
  /** 絞り込みが効いているか。0 件の意味（指摘なし / 絞って消えた）を書き分けるために要る。 */
  filterActive?: boolean;
  /** 絞り込み前の総件数。渡されたときだけ「表示 / 総数」を出す。 */
  totalCount?: number;
}): string {
  const { t, loadFailed, linkable, labelOf } = input;
  if (loadFailed) {
    return `<p data-am-finding-load-failed role="status">${escapeHtml(t('flightRecord.findings.loadFailed'))}</p>`;
  }
  if (input.findings.length === 0) {
    // 「絞って消えた」を「指摘なし」と同じ顔で出すと、レビュー漏れを見落とす。
    if (input.filterActive === true) {
      return `<p data-am-finding-empty-filtered role="status">${escapeHtml(t('flightRecord.findings.noneFiltered'))}</p>`;
    }
    return `<p data-am-finding-empty>${escapeHtml(t('flightRecord.findings.none'))}</p>`;
  }
  const rows = sortFindings(input.findings)
    .map(
      (row) => `<tr data-am-finding-row data-finding-id="${escapeHtml(row.id)}"
        data-instruction-id="${escapeHtml(row.instructionId)}">
        <td data-am-finding-text-cell>${escapeHtml(row.findingText)}</td>
        <td data-am-finding-nowrap-cell>${statusCell(t, row)}</td>
        <td data-am-finding-nowrap-cell>${escapeHtml(row.reviewedAt.slice(0, 10))}</td>
        <td data-am-finding-nowrap-cell>${severityChip(t, row.severity)}</td>
        <td data-am-finding-nowrap-cell>${escapeHtml(row.category)}</td>
        <td data-am-finding-target-cell>${targetCell(t, row, linkable)}</td>
        <td>${escapeHtml(labelOf(row.instructionId))}</td>
      </tr>`,
    )
    .join('');
  const shown =
    input.totalCount === undefined
      ? ''
      : `<span data-am-finding-shown>${input.findings.length} / ${input.totalCount}</span>`;
  return `
    <p data-am-finding-note>${escapeHtml(t('flightRecord.findings.scopeNote'))}${shown}</p>
    <table data-am-finding-table aria-label="${escapeHtml(t('flightRecord.tab.review'))}">
      <thead><tr>
        <th>${escapeHtml(t('flightRecord.findings.column.finding'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.status'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.reviewedAt'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.severity'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.category'))}</th>
        <th>${escapeHtml(t('flightRecord.findings.column.target'))}</th>
        <th>${escapeHtml(t('flightRecord.column.instruction'))}</th>
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
