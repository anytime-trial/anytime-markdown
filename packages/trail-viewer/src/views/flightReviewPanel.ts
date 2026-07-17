/**
 * flightReviewPanel — Phase 6 S3。Flight Review タブ（一覧 + フィルタ + CSV + 詳細）。
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
 */
import { escapeHtml } from '../shared/escapeHtml';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { FlightReviewOutcome, FlightReviewStore } from '../data/flightReviewStore';
import { buildFlightReviewCsv, downloadCsv } from '../data/flightReviewCsv';
import { formatDurationSeconds, mountRetrospectiveView, type RetrospectiveViewProps } from './retrospectiveView';
import type { TrailThemeTokens } from '../theme/designTokens';

export interface FlightReviewPanelProps {
  readonly isDark: boolean;
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
  readonly store: FlightReviewStore;
}

const STYLE_ID = 'am-flight-review-style';

const OUTCOME_VALUES: readonly FlightReviewOutcome[] = ['achieved', 'partial', 'unachieved', 'unknown'];

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
[data-am-flight-root] { display: flex; flex-direction: column; gap: 12px; padding: 12px; color: ${c.textPrimary}; }
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
[data-am-flight-body] { display: flex; gap: 16px; align-items: flex-start; }
[data-am-flight-list] { flex: 1 1 55%; min-width: 0; }
[data-am-flight-table] { width: 100%; border-collapse: collapse; font-size: 12px; }
[data-am-flight-table] th, [data-am-flight-table] td {
  text-align: left; padding: 6px 8px; border-bottom: 1px solid ${c.border}; white-space: nowrap;
}
[data-am-flight-table] th { color: ${c.textSecondary}; font-weight: 600; }
[data-am-flight-table] tbody tr { cursor: pointer; }
[data-am-flight-table] tbody tr:hover { background: ${c.sectionBg}; }
[data-am-flight-table] tbody tr[aria-selected="true"] { background: ${c.sectionBg}; outline: 1px solid ${c.border}; }
[data-am-outcome-badge] {
  display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
[data-am-outcome-badge][data-outcome="achieved"] { background: ${c.successBg}; color: ${c.success}; }
[data-am-outcome-badge][data-outcome="partial"] { background: ${c.warningBg}; color: ${c.warning}; }
[data-am-outcome-badge][data-outcome="unachieved"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-outcome-badge][data-outcome="unknown"] { background: ${c.sectionBg}; color: ${c.textSecondary}; }
[data-am-source-badge] {
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
}
[data-am-flight-detail] h3 { margin: 0; font-size: 14px; }
[data-am-flight-detail] h4 { margin: 16px 0 6px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-flight-detail] ul { margin: 0; padding-left: 18px; font-size: 12px; }
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

/** JSON 配列文字列からタグ配列へ（壊れていれば空。列表示用）。 */
function parseTags(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    console.warn(`[flightReview] broken JSON in tags: ${raw.slice(0, 80)}`);
    return [];
  }
}

export function mountFlightReviewPanel(
  container: HTMLElement,
  initialProps: FlightReviewPanelProps,
): VanillaViewHandle<FlightReviewPanelProps> {
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
      span.textContent = t(`flightReview.${span.dataset['amFlightLabel'] ?? ''}`);
    }
    if (outcomeSelect) {
      outcomeSelect.setAttribute('aria-label', t('flightReview.filter.outcome'));
      for (const option of outcomeSelect.options) {
        option.textContent =
          option.value === '' ? t('flightReview.filter.outcomeAll') : t(`flightReview.outcome.${option.value}`);
      }
    }
    sinceInput?.setAttribute('aria-label', t('flightReview.filter.since'));
    untilInput?.setAttribute('aria-label', t('flightReview.filter.until'));
    tagInput?.setAttribute('aria-label', t('flightReview.filter.tag'));
    const exportButton = toolbar.querySelector<HTMLButtonElement>('[data-am-flight-export]');
    if (exportButton) exportButton.textContent = t('flightReview.exportCsv');
  }

  function applyFilter(): void {
    const outcome = (outcomeSelect?.value ?? '') as FlightReviewOutcome | '';
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
    const reviews = props.store.getState().reviews;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(container.ownerDocument, `flight-reviews-${stamp}.csv`, buildFlightReviewCsv(reviews));
  });

  function selectRow(sessionId: string): void {
    void props.store.select(sessionId);
  }

  function renderList(): void {
    const { t } = props;
    const state = props.store.getState();
    if (state.loadFailed) {
      listRegion.innerHTML = `<p data-am-flight-load-failed role="status">${escapeHtml(t('flightReview.loadFailed'))}</p>`;
      return;
    }
    if (state.reviews.length === 0) {
      listRegion.innerHTML = `<p data-am-flight-empty>${escapeHtml(t('flightReview.empty'))}</p>`;
      return;
    }
    const rows = state.reviews
      .map((r) => {
        const selected = r.sessionId === state.selectedSessionId;
        const tags = parseTags(r.tags)
          .map((tag) => `<span data-am-flight-tag>${escapeHtml(tag)}</span>`)
          .join('');
        return `
        <tr data-session-id="${escapeHtml(r.sessionId)}" tabindex="0" aria-selected="${selected}">
          <td>${escapeHtml(r.sessionId.slice(0, 8))}</td>
          <td>${escapeHtml(formatDateTime(r.endedAt))}</td>
          <td>${escapeHtml(formatDurationSeconds(r.durationSeconds))}</td>
          <td><span data-am-outcome-badge data-outcome="${r.outcome}">${escapeHtml(t(`flightReview.outcome.${r.outcome}`))}</span></td>
          <td><span data-am-source-badge data-source="${r.outcomeSource}">${escapeHtml(t(`flightReview.source.${r.outcomeSource}`))}</span></td>
          <td>${r.reworkCount}</td>
          <td>${r.toolFailureCount}</td>
          <td>${tags}</td>
        </tr>`;
      })
      .join('');
    listRegion.innerHTML = `
      <table data-am-flight-table aria-label="${escapeHtml(t('viewer.tab.flightReview'))}">
        <thead>
          <tr>
            <th>${escapeHtml(t('flightReview.column.session'))}</th>
            <th>${escapeHtml(t('flightReview.column.endedAt'))}</th>
            <th>${escapeHtml(t('flightReview.column.duration'))}</th>
            <th>${escapeHtml(t('flightReview.column.outcome'))}</th>
            <th>${escapeHtml(t('flightReview.column.source'))}</th>
            <th>${escapeHtml(t('flightReview.column.rework'))}</th>
            <th>${escapeHtml(t('flightReview.column.toolFailures'))}</th>
            <th>${escapeHtml(t('flightReview.column.tags'))}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>`;
    const tbody = listRegion.querySelector('tbody');
    if (tbody) tbody.innerHTML = rows;
    for (const tr of listRegion.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
      const sessionId = tr.dataset['sessionId'] ?? '';
      tr.addEventListener('click', () => selectRow(sessionId));
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectRow(sessionId);
        }
      });
    }
  }

  function renderDetail(): void {
    const state = props.store.getState();
    const selected = state.reviews.find((r) => r.sessionId === state.selectedSessionId) ?? null;
    if (selected === null) {
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      detailRegion.hidden = true;
      return;
    }
    detailRegion.hidden = false;
    const detailProps: RetrospectiveViewProps = {
      tokens: props.tokens,
      t: props.t,
      review: selected,
      feedback: state.selectedFeedback,
      saving: state.saving,
      onSave: (patch) => props.store.saveManual(selected.sessionId, patch),
      onEditingChange: (editing) => props.store.setEditing(editing),
      onClose: () => void props.store.select(null),
    };
    if (detailHandle === null || detailSessionId !== selected.sessionId) {
      detailHandle?.destroy();
      detailHandle = mountRetrospectiveView(detailRegion, detailProps);
      detailSessionId = selected.sessionId;
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
  render();
  void props.store.refresh();

  return {
    update(next) {
      const prevStore = props.store;
      props = next;
      ensureStyle(container.ownerDocument, next.tokens);
      if (next.store !== prevStore) {
        // serverUrl 変更などで store が再生成された場合は購読を張り替えて取り直す
        unsubscribe();
        unsubscribe = next.store.subscribe(render);
        void next.store.refresh();
      }
      render();
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      detailHandle?.destroy();
      detailHandle = null;
      root.remove();
    },
  };
}
