/**
 * flightRecordPanel — Flight Record タブ（指示単位の一覧 + フィルタ + CSV + 詳細）。
 *
 * 行の単位は**指示**であってセッションではない。1 つの指示が複数セッションにまたがるため、
 * セッション単位で並べると同じ作業が別々の行へ散る。指示 : セッションの対応は
 * エージェントの明示宣言（MCP record_instruction）が作り、宣言の無いセッションは
 * サーバー側が 1 セッション = 1 指示の暗黙グループとして返す。
 *
 * 設計の要点（要件書 §14.3 / §14.5）:
 *   - store を購読して一覧・詳細を再描画する。フィルタバーは静的 DOM として一度だけ構築し、
 *     再描画で入力中の値を消さない（ラベル文言のみ render() で props.t から毎回更新する —
 *     t の関数識別子は update ごとに変わり得るため識別子比較に依存しない）。
 *   - props.t / props.store は常に最新 props から参照する（mount 時の閉じ込め禁止）。
 *     update() で store が差し替わったら購読を張り替える（serverUrl 変更時の再生成に追従）。
 *   - サーバー不達（loadFailed）は空一覧と別の顔で表示する（障害を「0 件」に見せない）。
 *   - outcome は色 + テキストの冗長表示（色のみで情報を伝えない）。
 *   - 色はテーマトークンから取り、要素側へインラインで置かない（ダーク / ライト両対応）。
 *   - セッション単位の振り返り・訂正（retrospectiveView）は詳細ペインの中に残す。
 *     成否の訂正はセッション単位の記録であり、指示単位へ畳むと出所の優先順位が壊れる。
 */
import { escapeHtml } from '../shared/escapeHtml';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { FlightReviewOutcome, FlightReviewStore } from '../data/flightReviewStore';
import type {
  InstructionDeliverableDto,
  InstructionRecordDto,
  InstructionStore,
  InstructionTokenUsageDto,
} from '../data/instructionStore';
import { buildFlightRecordCsv, downloadCsv } from '../data/flightReviewCsv';
import { formatDurationSeconds, mountRetrospectiveView, type RetrospectiveViewProps } from './retrospectiveView';
import type { TrailThemeTokens } from '../theme/designTokens';
import { applyThinScrollbar } from '../theme/thinScrollbar';

export interface FlightRecordPanelProps {
  readonly isDark: boolean;
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
  /** 指示単位の一覧・所属セッション。 */
  readonly store: InstructionStore;
  /** セッション単位の振り返り・訂正（詳細ペイン内）。 */
  readonly reviewStore: FlightReviewStore;
}

const STYLE_ID = 'am-flight-record-style';

const OUTCOME_VALUES: readonly FlightReviewOutcome[] = ['achieved', 'partial', 'unachieved', 'unknown'];

/** 成否フィルタの値。空文字は「すべて」（絞り込みなし）。 */
type OutcomeFilterValue = FlightReviewOutcome | '';

/**
 * スタイルは 1 度だけ注入する。状態色は data-* 属性 + 注入スタイルシートが正本
 * （インラインは注入スタイルを上書きして状態表現を壊す）。
 */
function ensureStyle(doc: Document, tokens: TrailThemeTokens): void {
  const existing = doc.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  const c = tokens.colors;
  style.textContent = `
/* タブパネルの器（trailViewer の getPanelContainer）は overflow:hidden で、シェル側にも
   スクロール領域が無い。パネル自身が内部スクロールを持たないと、はみ出した一覧は
   どこにもスクロールできず切り落とされる。root → body → list/detail の各段に
   min-height:0 を置くのは、flex アイテムの既定 min-height:auto が中身の高さを
   下限にしてしまい、親が縮まらず overflow が発火しないため。 */
[data-am-flight-root] {
  display: flex; flex-direction: column; gap: 12px; padding: 12px; color: ${c.textPrimary};
  flex: 1 1 auto; min-height: 0; box-sizing: border-box; overflow: hidden;
}
[data-am-flight-toolbar] { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
[data-am-flight-toolbar] label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-flight-toolbar] select, [data-am-flight-toolbar] input {
  padding: 6px 8px; font-size: 13px; background: ${c.sectionBg}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 4px;
}
[data-am-flight-toolbar] button {
  padding: 7px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-flight-body] { display: flex; gap: 16px; align-items: stretch; flex: 1 1 auto; min-height: 0; }
[data-am-flight-list] { flex: 1 1 55%; min-width: 0; min-height: 0; overflow-y: auto; }
[data-am-flight-table] { width: 100%; border-collapse: collapse; font-size: 12px; }
[data-am-flight-table] th, [data-am-flight-table] td {
  text-align: left; padding: 6px 8px; border-bottom: 1px solid ${c.border}; white-space: nowrap;
}
[data-am-flight-table] th { color: ${c.textSecondary}; font-weight: 600; }
[data-am-flight-table] tbody tr { cursor: pointer; }
[data-am-flight-table] tbody tr:hover { background: ${c.sectionBg}; }
[data-am-flight-table] tbody tr[aria-selected="true"] { background: ${c.sectionBg}; outline: 1px solid ${c.border}; }
/* 指示概要の列だけは折り返す。nowrap のままだと 1 行が横に伸び、他の列が画面外へ出る。 */
[data-am-flight-table] td[data-am-summary-cell] {
  white-space: normal; min-width: 220px; max-width: 420px;
}
[data-am-instruction-summary] { display: block; font-weight: 600; }
[data-am-instruction-origin] {
  display: block; margin-top: 2px; font-size: 11px; color: ${c.textSecondary};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 宣言の無いセッション（暗黙グループ）は概要が空。推測した見出しを人が書いた概要と
   同じ顔で出さないため、専用の淡い表示にする。 */
[data-am-instruction-undeclared] { color: ${c.textSecondary}; font-style: italic; font-weight: 400; }
[data-am-outcome-badge] {
  display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
[data-am-outcome-badge][data-outcome="achieved"] { background: ${c.successBg}; color: ${c.success}; }
[data-am-outcome-badge][data-outcome="partial"] { background: ${c.warningBg}; color: ${c.warning}; }
[data-am-outcome-badge][data-outcome="unachieved"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-outcome-badge][data-outcome="unknown"] { background: ${c.sectionBg}; color: ${c.textSecondary}; }
[data-am-source-badge], [data-am-workspace-badge] {
  display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px;
  border: 1px solid ${c.border}; color: ${c.textSecondary};
}
[data-am-flight-tag] {
  display: inline-block; margin-right: 4px; padding: 1px 6px; border-radius: 8px;
  font-size: 11px; background: ${c.sectionBg}; border: 1px solid ${c.border};
}
[data-am-flight-empty], [data-am-flight-load-failed] { font-size: 13px; padding: 16px; color: ${c.textSecondary}; }
[data-am-flight-load-failed] {
  background: ${c.warningBg}; color: ${c.warning}; border: 1px solid ${c.warning}; border-radius: 6px;
}
[data-am-flight-detail] {
  flex: 1 1 45%; min-width: 280px; background: ${c.sectionBg};
  border: 1px solid ${c.border}; border-radius: 8px; padding: 16px;
  min-height: 0; overflow-y: auto;
}
[data-am-flight-detail] h3 { margin: 0; font-size: 14px; }
[data-am-flight-detail] h4 { margin: 16px 0 6px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-flight-detail] ul { margin: 0; padding-left: 18px; font-size: 12px; }
[data-am-instruction-head] { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
[data-am-instruction-head] button {
  border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary};
  border-radius: 4px; cursor: pointer; padding: 4px 8px;
}
[data-am-instruction-prompt] {
  margin: 8px 0 0; padding: 8px; font-size: 12px; white-space: pre-wrap; word-break: break-word;
  background: ${c.charcoal}; border: 1px solid ${c.border}; border-radius: 4px;
  max-height: 120px; overflow-y: auto;
}
[data-am-instruction-facts] {
  display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 12px; margin: 8px 0 0;
}
[data-am-instruction-facts] dt { color: ${c.textSecondary}; }
[data-am-instruction-facts] dd { margin: 0; }
[data-am-deliverable-list] { list-style: none; margin: 0; padding: 0; font-size: 12px; }
[data-am-deliverable-list] li { display: flex; gap: 6px; align-items: baseline; padding: 2px 0; }
[data-am-deliverable-path] { font-family: ui-monospace, monospace; word-break: break-all; }
[data-am-deliverable-badge] {
  flex: 0 0 auto; padding: 1px 6px; border-radius: 4px; font-size: 10px; border: 1px solid ${c.border};
}
[data-am-deliverable-badge][data-committed="false"] { color: ${c.warning}; border-color: ${c.warning}; }
[data-am-deliverable-badge][data-committed="true"] { color: ${c.textSecondary}; }
[data-am-token-table] { width: 100%; border-collapse: collapse; font-size: 11px; }
[data-am-token-table] th, [data-am-token-table] td {
  text-align: right; padding: 3px 6px; border-bottom: 1px solid ${c.border};
}
[data-am-token-table] th:first-child, [data-am-token-table] td:first-child { text-align: left; }
[data-am-token-table] th { color: ${c.textSecondary}; font-weight: 600; }
[data-am-session-switch] { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 0; }
[data-am-session-switch] button {
  padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
  border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary};
}
[data-am-session-switch] button[aria-pressed="true"] { background: ${c.sectionBg}; border-color: ${c.textSecondary}; }
[data-am-retro-header] { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
[data-am-retro-header] button { border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary}; border-radius: 4px; cursor: pointer; padding: 4px 8px; }
[data-am-retro-outcome] { display: flex; gap: 8px; margin-top: 8px; }
[data-am-retro-events] { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 12px; margin: 0; }
[data-am-retro-events] dt { color: ${c.textSecondary}; }
[data-am-retro-events] dd { margin: 0; }
[data-am-retro-empty] { font-size: 12px; color: ${c.textSecondary}; margin: 0; }
[data-am-retro-edit] label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${c.textSecondary}; margin-bottom: 8px; }
[data-am-retro-edit] select, [data-am-retro-edit] input, [data-am-retro-edit] textarea {
  padding: 6px 8px; font-size: 13px; background: ${c.charcoal}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 4px; font-family: inherit;
}
[data-am-retro-actions] button {
  padding: 7px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-retro-feedback] { margin: 8px 0 0; font-size: 12px; padding: 6px 8px; border-radius: 4px; }
[data-am-retro-feedback][data-kind="success"] { background: ${c.successBg}; color: ${c.success}; }
[data-am-retro-feedback][data-kind="error"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-audit-badge], [data-am-confidence-badge] {
  display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid ${c.border};
}
[data-am-audit-badge][data-audit="unaudited"] { color: ${c.textSecondary}; background: ${c.sectionBg}; }
[data-am-audit-badge][data-audit="valid"] { color: ${c.success}; background: ${c.successBg}; border-color: ${c.success}; }
[data-am-audit-badge][data-audit="needs_fix"] { color: ${c.warning}; background: ${c.warningBg}; border-color: ${c.warning}; }
[data-am-audit-badge][data-audit="rejected"] { color: ${c.error}; background: ${c.errorBg}; border-color: ${c.error}; }
[data-am-confidence-badge] { color: ${c.textSecondary}; margin: 0 4px; }
[data-am-rationale-controls] { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; margin-bottom: 8px; }
[data-am-rationale-controls] label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-rationale-controls] select {
  padding: 6px 8px; font-size: 13px; background: ${c.charcoal}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 4px;
}
[data-am-rationale-controls] button {
  padding: 7px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-rationale-list] { margin: 0; padding-left: 18px; font-size: 12px; }
[data-am-rationale-list] code { font-family: ui-monospace, monospace; font-size: 11px; }
`;
  doc.head.appendChild(style);
}

function formatDateTime(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** `<input type="date">` の値（YYYY-MM-DD・ローカル日付）を UTC ISO へ。不正・空は undefined。 */
function dateInputToIso(value: string, endOfDay: boolean): string | undefined {
  if (value === '') return undefined;
  const date = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** 大きな桁を読みやすくする（キャッシュ読取は億の桁になる）。 */
function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** 一覧の成果物列は件数だけを出す（パスの列挙は詳細ペインが担う）。 */
function deliverableCounts(deliverables: readonly InstructionDeliverableDto[]): { docs: number; code: number } {
  let docs = 0;
  let code = 0;
  for (const d of deliverables) {
    if (d.kind === 'doc') docs += 1;
    else code += 1;
  }
  return { docs, code };
}

/** トークンの総量。input / output / cache を合算した「動かした量」を 1 列で示す。 */
function totalTokens(usage: InstructionTokenUsageDto): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
}

export function mountFlightRecordPanel(
  container: HTMLElement,
  initialProps: FlightRecordPanelProps,
): VanillaViewHandle<FlightRecordPanelProps> {
  let props = initialProps;
  let destroyed = false;
  let detailHandle: VanillaViewHandle<RetrospectiveViewProps> | null = null;
  let detailSessionId: string | null = null;

  ensureStyle(container.ownerDocument, props.tokens);

  const root = document.createElement('div');
  root.dataset['amFlightRoot'] = '';
  container.appendChild(root);

  // ── フィルタバー（静的 DOM。値・リスナーは維持し、文言のみ render() で更新） ──
  const toolbar = document.createElement('div');
  toolbar.dataset['amFlightToolbar'] = '';
  toolbar.innerHTML = `
    <label><span data-am-flight-label="filter.outcome"></span>
      <select data-am-flight-filter-outcome>
        <option value=""></option>
        ${OUTCOME_VALUES.map((o) => `<option value="${o}"></option>`).join('')}
      </select>
    </label>
    <label><span data-am-flight-label="filter.since"></span>
      <input type="date" data-am-flight-filter-since />
    </label>
    <label><span data-am-flight-label="filter.until"></span>
      <input type="date" data-am-flight-filter-until />
    </label>
    <label><span data-am-flight-label="filter.tag"></span>
      <input type="text" data-am-flight-filter-tag />
    </label>
    <button type="button" data-am-flight-export></button>
  `;
  root.appendChild(toolbar);

  const body = document.createElement('div');
  body.dataset['amFlightBody'] = '';
  const listRegion = document.createElement('div');
  listRegion.dataset['amFlightList'] = '';
  const detailRegion = document.createElement('div');
  detailRegion.dataset['amFlightDetail'] = '';
  detailRegion.hidden = true;
  // 一覧・詳細はそれぞれ独立にスクロールする。スクロールバーの意匠はテーマ変数追従の
  // 共有スタイルへ寄せる（ダーク／ライトのどちらでも同じ経路で色が決まる）。
  applyThinScrollbar(listRegion);
  applyThinScrollbar(detailRegion);
  body.appendChild(listRegion);
  body.appendChild(detailRegion);
  root.appendChild(body);

  const outcomeSelect = toolbar.querySelector<HTMLSelectElement>('[data-am-flight-filter-outcome]');
  const sinceInput = toolbar.querySelector<HTMLInputElement>('[data-am-flight-filter-since]');
  const untilInput = toolbar.querySelector<HTMLInputElement>('[data-am-flight-filter-until]');
  const tagInput = toolbar.querySelector<HTMLInputElement>('[data-am-flight-filter-tag]');

  /** ラベル・option・aria-label を最新の props.t で更新する（入力値・リスナーは維持）。 */
  function updateToolbarLabels(): void {
    const { t } = props;
    for (const span of toolbar.querySelectorAll<HTMLElement>('[data-am-flight-label]')) {
      span.textContent = t(`flightRecord.${span.dataset['amFlightLabel'] ?? ''}`);
    }
    if (outcomeSelect) {
      outcomeSelect.setAttribute('aria-label', t('flightRecord.filter.outcome'));
      for (const option of outcomeSelect.options) {
        option.textContent =
          option.value === '' ? t('flightRecord.filter.outcomeAll') : t(`flightRecord.outcome.${option.value}`);
      }
    }
    sinceInput?.setAttribute('aria-label', t('flightRecord.filter.since'));
    untilInput?.setAttribute('aria-label', t('flightRecord.filter.until'));
    tagInput?.setAttribute('aria-label', t('flightRecord.filter.tag'));
    const exportButton = toolbar.querySelector<HTMLButtonElement>('[data-am-flight-export]');
    if (exportButton) exportButton.textContent = t('flightRecord.exportCsv');
  }

  function applyFilter(): void {
    const outcome = (outcomeSelect?.value ?? '') as OutcomeFilterValue;
    const tag = (tagInput?.value ?? '').trim();
    props.store.setFilter({
      ...(outcome === '' ? {} : { outcome }),
      since: dateInputToIso(sinceInput?.value ?? '', false),
      until: dateInputToIso(untilInput?.value ?? '', true),
      ...(tag === '' ? {} : { tag }),
    });
  }

  outcomeSelect?.addEventListener('change', applyFilter);
  sinceInput?.addEventListener('change', applyFilter);
  untilInput?.addEventListener('change', applyFilter);
  tagInput?.addEventListener('change', applyFilter);
  toolbar.querySelector<HTMLButtonElement>('[data-am-flight-export]')?.addEventListener('click', () => {
    const instructions = props.store.getState().instructions;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(container.ownerDocument, `flight-records-${stamp}.csv`, buildFlightRecordCsv(instructions));
  });

  function selectRow(instructionId: string): void {
    void props.store.select(instructionId);
  }

  /** 概要が空（宣言の無いセッション）なら、推測せず「未宣言」と明示する。 */
  function summaryCell(record: InstructionRecordDto): string {
    const { t } = props;
    if (record.summary === '') {
      return `<span data-am-instruction-summary data-am-instruction-undeclared>${escapeHtml(t('flightRecord.undeclared'))}</span>
              <span data-am-instruction-origin>${escapeHtml(record.instructionId.slice(0, 8))}</span>`;
    }
    return `<span data-am-instruction-summary>${escapeHtml(record.summary)}</span>
            ${record.originPrompt === '' ? '' : `<span data-am-instruction-origin>${escapeHtml(record.originPrompt)}</span>`}`;
  }

  function renderList(): void {
    const { t } = props;
    const state = props.store.getState();
    if (state.loadFailed) {
      listRegion.innerHTML = `<p data-am-flight-load-failed role="status">${escapeHtml(t('flightRecord.loadFailed'))}</p>`;
      return;
    }
    if (state.instructions.length === 0) {
      listRegion.innerHTML = `<p data-am-flight-empty>${escapeHtml(t('flightRecord.empty'))}</p>`;
      return;
    }
    const rows = state.instructions
      .map((r) => {
        const selected = r.instructionId === state.selectedInstructionId;
        const tags = r.tags.map((tag) => `<span data-am-flight-tag>${escapeHtml(tag)}</span>`).join('');
        const counts = deliverableCounts(r.deliverables);
        // 未取込（session_costs にまだ行が無い）を 0 と書かない
        const tokens = r.tokenUsage.imported ? formatCount(totalTokens(r.tokenUsage)) : t('flightRecord.notImported');
        const cost = r.tokenUsage.imported ? formatUsd(r.tokenUsage.estimatedCostUsd) : '';
        const deliverableLabel = t('flightRecord.deliverableCounts')
          .replace('{docs}', String(counts.docs))
          .replace('{code}', String(counts.code));
        return `
        <tr data-instruction-id="${escapeHtml(r.instructionId)}" tabindex="0" aria-selected="${selected}">
          <td data-am-summary-cell>${summaryCell(r)}</td>
          <td><span data-am-workspace-badge>${escapeHtml(r.workspaceName)}</span></td>
          <td>${escapeHtml(formatDateTime(r.endedAt))}</td>
          <td>${escapeHtml(formatDurationSeconds(r.durationSeconds))}</td>
          <td><span data-am-outcome-badge data-outcome="${r.outcome}">${escapeHtml(t(`flightRecord.outcome.${r.outcome}`))}</span></td>
          <td><span data-am-source-badge data-source="${r.outcomeSource}">${escapeHtml(t(`flightRecord.source.${r.outcomeSource}`))}</span></td>
          <td>${r.sessionCount}</td>
          <td>${escapeHtml(deliverableLabel)}</td>
          <td>${escapeHtml(tokens)}</td>
          <td>${escapeHtml(cost)}</td>
          <td>${r.reworkCount}</td>
          <td>${r.toolFailureCount}</td>
          <td>${tags}</td>
        </tr>`;
      })
      .join('');
    listRegion.innerHTML = `
      <table data-am-flight-table aria-label="${escapeHtml(t('viewer.tab.flightRecord'))}">
        <thead>
          <tr>
            <th>${escapeHtml(t('flightRecord.column.instruction'))}</th>
            <th>${escapeHtml(t('flightRecord.column.workspace'))}</th>
            <th>${escapeHtml(t('flightRecord.column.endedAt'))}</th>
            <th>${escapeHtml(t('flightRecord.column.duration'))}</th>
            <th>${escapeHtml(t('flightRecord.column.outcome'))}</th>
            <th>${escapeHtml(t('flightRecord.column.source'))}</th>
            <th>${escapeHtml(t('flightRecord.column.sessions'))}</th>
            <th>${escapeHtml(t('flightRecord.column.deliverables'))}</th>
            <th>${escapeHtml(t('flightRecord.column.tokens'))}</th>
            <th>${escapeHtml(t('flightRecord.column.cost'))}</th>
            <th>${escapeHtml(t('flightRecord.column.rework'))}</th>
            <th>${escapeHtml(t('flightRecord.column.toolFailures'))}</th>
            <th>${escapeHtml(t('flightRecord.column.tags'))}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>`;
    const tbody = listRegion.querySelector('tbody');
    if (tbody) tbody.innerHTML = rows;
    for (const tr of listRegion.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
      const instructionId = tr.dataset['instructionId'] ?? '';
      tr.addEventListener('click', () => selectRow(instructionId));
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectRow(instructionId);
        }
      });
    }
  }

  function renderDeliverables(record: InstructionRecordDto): string {
    const { t } = props;
    if (record.deliverables.length === 0) {
      return `<p data-am-retro-empty>${escapeHtml(t('flightRecord.detail.none'))}</p>`;
    }
    // ドキュメントを先に出す（未コミットを含み、作業の成果として最初に見たいのはこちら）
    const ordered = [...record.deliverables].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'doc' ? -1 : 1;
      return a.filePath < b.filePath ? -1 : 1;
    });
    const items = ordered
      .map((d) => {
        const badge = d.committed ? d.commitHash : t('flightRecord.detail.uncommitted');
        return `<li>
          <span data-am-deliverable-badge data-committed="${d.committed}">${escapeHtml(badge)}</span>
          <span data-am-deliverable-path>${escapeHtml(d.filePath)}</span>
        </li>`;
      })
      .join('');
    return `<ul data-am-deliverable-list>${items}</ul>`;
  }

  function renderTokenUsage(usage: InstructionTokenUsageDto): string {
    const { t } = props;
    if (!usage.imported) {
      return `<p data-am-retro-empty>${escapeHtml(t('flightRecord.notImported'))}</p>`;
    }
    const rows = usage.byModel
      .map(
        (m) => `<tr>
          <td>${escapeHtml(m.model)}</td>
          <td>${escapeHtml(formatCount(m.inputTokens))}</td>
          <td>${escapeHtml(formatCount(m.outputTokens))}</td>
          <td>${escapeHtml(formatCount(m.cacheReadTokens))}</td>
          <td>${escapeHtml(formatCount(m.cacheCreationTokens))}</td>
          <td>${escapeHtml(formatUsd(m.estimatedCostUsd))}</td>
        </tr>`,
      )
      .join('');
    return `<table data-am-token-table>
      <thead><tr>
        <th>${escapeHtml(t('flightRecord.token.model'))}</th>
        <th>${escapeHtml(t('flightRecord.token.input'))}</th>
        <th>${escapeHtml(t('flightRecord.token.output'))}</th>
        <th>${escapeHtml(t('flightRecord.token.cacheRead'))}</th>
        <th>${escapeHtml(t('flightRecord.token.cacheCreation'))}</th>
        <th>${escapeHtml(t('flightRecord.token.cost'))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  /** 指示の要約ブロック（詳細ペインの上段。所属セッションの切替もここに置く）。 */
  function renderInstructionHeader(record: InstructionRecordDto): string {
    const { t } = props;
    const state = props.store.getState();
    const sessions = state.selectedSessions;
    const title = record.summary === '' ? t('flightRecord.undeclared') : record.summary;
    const switchButtons =
      sessions.length <= 1
        ? ''
        : `<div data-am-session-switch role="group" aria-label="${escapeHtml(t('flightRecord.detail.sessions'))}">
            ${sessions
              .map(
                (s) => `<button type="button" data-am-session-pick="${escapeHtml(s.sessionId)}"
                  aria-pressed="${s.sessionId === state.selectedSessionId}">${escapeHtml(String(s.sequence))}. ${escapeHtml(s.sessionId.slice(0, 8))}</button>`,
              )
              .join('')}
          </div>`;
    return `
      <div data-am-instruction-head>
        <h3>${escapeHtml(title)}</h3>
        <button type="button" data-am-instruction-close>${escapeHtml(t('flightRecord.detail.close'))}</button>
      </div>
      ${record.originPrompt === '' ? '' : `<p data-am-instruction-prompt>${escapeHtml(record.originPrompt)}</p>`}
      <dl data-am-instruction-facts>
        <dt>${escapeHtml(t('flightRecord.column.workspace'))}</dt><dd>${escapeHtml(record.workspaceName)}</dd>
        <dt>${escapeHtml(t('flightRecord.detail.startedAt'))}</dt><dd>${escapeHtml(formatDateTime(record.startedAt))}</dd>
        <dt>${escapeHtml(t('flightRecord.column.endedAt'))}</dt><dd>${escapeHtml(formatDateTime(record.endedAt))}</dd>
        <dt>${escapeHtml(t('flightRecord.column.duration'))}</dt><dd>${escapeHtml(formatDurationSeconds(record.durationSeconds))}</dd>
        <dt>${escapeHtml(t('flightRecord.column.sessions'))}</dt><dd>${record.sessionCount}</dd>
      </dl>
      <h4>${escapeHtml(t('flightRecord.detail.deliverables'))}</h4>
      ${renderDeliverables(record)}
      <h4>${escapeHtml(t('flightRecord.detail.tokenUsage'))}</h4>
      ${renderTokenUsage(record.tokenUsage)}
      <h4>${escapeHtml(t('flightRecord.detail.sessions'))}</h4>
      ${switchButtons}
    `;
  }

  function renderDetail(): void {
    const state = props.store.getState();
    const selected =
      state.instructions.find((r) => r.instructionId === state.selectedInstructionId) ?? null;
    if (selected === null) {
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      detailRegion.hidden = true;
      detailRegion.innerHTML = '';
      return;
    }
    detailRegion.hidden = false;

    // 上段（指示の要約）は毎回描き直し、下段（セッション単位の振り返り）は別の器へ
    // マウントして生かす。1 つの innerHTML で両方描くと、retrospectiveView の
    // 入力中フォームが再描画のたびに消える。
    let headerEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-header]');
    let retroEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-retro]');
    if (headerEl === null || retroEl === null) {
      detailRegion.innerHTML = '<div data-am-instruction-header></div><div data-am-instruction-retro></div>';
      headerEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-header]');
      retroEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-retro]');
      detailHandle = null;
      detailSessionId = null;
    }
    if (headerEl === null || retroEl === null) return;

    headerEl.innerHTML = renderInstructionHeader(selected);
    headerEl.querySelector<HTMLButtonElement>('[data-am-instruction-close]')?.addEventListener('click', () => {
      void props.store.select(null);
    });
    for (const button of headerEl.querySelectorAll<HTMLButtonElement>('[data-am-session-pick]')) {
      button.addEventListener('click', () => {
        props.store.selectSession(button.dataset['amSessionPick'] ?? null);
      });
    }

    renderSessionRetrospective(retroEl);
  }

  /** 選択セッションの振り返り・訂正。セッション単位の記録なので reviewStore が正本。 */
  function renderSessionRetrospective(host: HTMLElement): void {
    const sessionId = props.store.getState().selectedSessionId;
    if (sessionId === null) {
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      host.innerHTML = '';
      return;
    }
    if (props.reviewStore.getState().selectedSessionId !== sessionId) {
      void props.reviewStore.select(sessionId);
    }
    const reviewState = props.reviewStore.getState();
    const review = reviewState.selectedReview;
    if (review === null) {
      // 取得前・記録なしはフォームを出さない（空のフォームを訂正対象に見せない）
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      host.innerHTML = '';
      return;
    }
    const detailProps: RetrospectiveViewProps = {
      tokens: props.tokens,
      t: props.t,
      review,
      feedback: reviewState.selectedFeedback,
      rationale: reviewState.selectedRationale,
      saving: reviewState.saving,
      onSave: (patch) => props.reviewStore.saveManual(review.sessionId, patch),
      onEditingChange: (editing) => props.reviewStore.setEditing(editing),
      onClose: () => props.store.selectSession(null),
    };
    if (detailHandle === null || detailSessionId !== review.sessionId) {
      detailHandle?.destroy();
      host.innerHTML = '';
      detailHandle = mountRetrospectiveView(host, detailProps);
      detailSessionId = review.sessionId;
      return;
    }
    detailHandle.update(detailProps);
  }

  function render(): void {
    if (destroyed) return;
    updateToolbarLabels();
    renderList();
    renderDetail();
  }

  let unsubscribe = props.store.subscribe(render);
  let unsubscribeReview = props.reviewStore.subscribe(render);
  render();
  void props.store.refresh();

  return {
    update(next) {
      const prevStore = props.store;
      const prevReviewStore = props.reviewStore;
      props = next;
      ensureStyle(container.ownerDocument, next.tokens);
      if (next.store !== prevStore) {
        // serverUrl 変更などで store が再生成された場合は購読を張り替えて取り直す
        unsubscribe();
        unsubscribe = next.store.subscribe(render);
        void next.store.refresh();
      }
      if (next.reviewStore !== prevReviewStore) {
        unsubscribeReview();
        unsubscribeReview = next.reviewStore.subscribe(render);
      }
      render();
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      unsubscribeReview();
      detailHandle?.destroy();
      detailHandle = null;
      root.remove();
    },
  };
}
