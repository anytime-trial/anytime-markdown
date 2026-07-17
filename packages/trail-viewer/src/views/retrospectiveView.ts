/**
 * retrospectiveView — Phase 6 S3。Flight Review 詳細（RetrospectiveView）+ 手動訂正フォーム。
 *
 * 設計の要点（要件書 §14.4）:
 *   - 機体自己評価（self）/ 機械値をデフォルト表示し、人間が訂正して保存すると manual になる。
 *   - フォーム値はローカル状態（formOutcome / formTags / formNotes）で保持し、update() の
 *     再描画で入力が消えない（ポーリングと編集の競合の pre-mortem 手当て）。
 *   - S2 項目（未解決・学習候補・user feedback）が空でも空状態表示で成立する（FR-18）。
 *   - 保存の成否は視覚フィードバックで返す（成功 / サーバーの理由付き失敗）。
 */
import { escapeHtml } from '../shared/escapeHtml';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type {
  FlightReviewDto,
  FlightReviewManualPatchDto,
  FlightReviewSaveResult,
  UserFeedbackDto,
} from '../data/flightReviewStore';
import type { TrailThemeTokens } from '../theme/designTokens';

export interface RetrospectiveViewProps {
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
  readonly review: FlightReviewDto;
  readonly feedback: readonly UserFeedbackDto[];
  readonly saving: boolean;
  readonly onSave: (patch: FlightReviewManualPatchDto) => Promise<FlightReviewSaveResult>;
  /** 訂正フォームに触れたら true を親へ伝える（ポーリング反映の保留）。 */
  readonly onEditingChange: (editing: boolean) => void;
  readonly onClose: () => void;
}

type ManualOutcome = Exclude<FlightReviewDto['outcome'], 'unknown'>;

const MANUAL_OUTCOMES: readonly ManualOutcome[] = ['achieved', 'partial', 'unachieved'];

interface LessonCandidateDto {
  readonly kind: string;
  readonly summary: string;
  readonly evidence: string;
}

/** JSON 配列文字列を安全に読む。壊れたデータは空配列 + warn（silent にはしない）。 */
function parseJsonArray<T>(raw: string, label: string): readonly T[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.warn(`[flightReview] broken JSON in ${label}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function formatDateTime(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/** カンマ区切りのタグ入力を配列へ（空要素は除く）。 */
export function parseTagsInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

export function mountRetrospectiveView(
  container: HTMLElement,
  initialProps: RetrospectiveViewProps,
): VanillaViewHandle<RetrospectiveViewProps> {
  let props = initialProps;
  let destroyed = false;

  // フォームのローカル状態（再描画で消さない）
  let formOutcome: ManualOutcome | '' = props.review.outcome === 'unknown' ? '' : props.review.outcome;
  let formTags = parseJsonArray<string>(props.review.tags, 'tags').join(', ');
  let formNotes = props.review.notes;
  let feedbackMessage: { kind: 'success' | 'error'; text: string } | null = null;
  let touched = false;

  const root = document.createElement('div');
  root.dataset['amRetroRoot'] = '';
  container.appendChild(root);

  function markTouched(): void {
    if (touched) return;
    touched = true;
    props.onEditingChange(true);
  }

  async function handleSave(): Promise<void> {
    const patch: FlightReviewManualPatchDto = {
      ...(formOutcome === '' ? {} : { outcome: formOutcome }),
      tags: parseTagsInput(formTags),
      notes: formNotes,
    };
    const result = await props.onSave(patch);
    if (destroyed) return;
    touched = false;
    feedbackMessage = result.ok
      ? { kind: 'success', text: props.t('flightReview.edit.saveSuccess') }
      : { kind: 'error', text: `${props.t('flightReview.edit.saveError')}: ${result.error ?? ''}` };
    render();
  }

  function renderListSection(title: string, items: readonly string[]): string {
    const { t } = props;
    const body =
      items.length === 0
        ? `<p data-am-retro-empty>${escapeHtml(t('flightReview.detail.none'))}</p>`
        : `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    return `<section><h4>${escapeHtml(title)}</h4>${body}</section>`;
  }

  function render(): void {
    if (destroyed) return;
    const { t, review, feedback, saving } = props;
    const unresolved = parseJsonArray<string>(review.unresolvedItems, 'unresolvedItems');
    const concerns = parseJsonArray<string>(review.nextConcerns, 'nextConcerns');
    const lessons = parseJsonArray<LessonCandidateDto>(review.lessonCandidates, 'lessonCandidates');

    root.innerHTML = `
      <header data-am-retro-header>
        <h3>${escapeHtml(t('flightReview.detail.title'))} — ${escapeHtml(review.sessionId)}</h3>
        <button type="button" data-am-retro-close aria-label="${escapeHtml(t('flightReview.detail.close'))}">✕</button>
      </header>
      <div data-am-retro-outcome>
        <span data-am-outcome-badge data-outcome="${review.outcome}">${escapeHtml(t(`flightReview.outcome.${review.outcome}`))}</span>
        <span data-am-source-badge data-source="${review.outcomeSource}">${escapeHtml(t(`flightReview.source.${review.outcomeSource}`))}</span>
      </div>
      <section>
        <h4>${escapeHtml(t('flightReview.detail.keyEvents'))}</h4>
        <dl data-am-retro-events>
          <dt>${escapeHtml(t('flightReview.column.endedAt'))}</dt><dd>${escapeHtml(formatDateTime(review.endedAt))}</dd>
          <dt>${escapeHtml(t('flightReview.column.duration'))}</dt><dd>${escapeHtml(formatDurationSeconds(review.durationSeconds))}</dd>
          <dt>${escapeHtml(t('flightReview.detail.toolCalls'))}</dt><dd>${review.toolCallCount}</dd>
          <dt>${escapeHtml(t('flightReview.column.toolFailures'))}</dt><dd>${review.toolFailureCount}</dd>
          <dt>${escapeHtml(t('flightReview.column.rework'))}</dt><dd>${review.reworkCount}</dd>
        </dl>
      </section>
      ${renderListSection(t('flightReview.detail.unresolved'), unresolved)}
      ${renderListSection(t('flightReview.detail.nextConcerns'), concerns)}
      ${renderListSection(
        t('flightReview.detail.lessonCandidates'),
        lessons.map((l) => `[${l.kind}] ${l.summary}`),
      )}
      ${renderListSection(
        t('flightReview.detail.userFeedback'),
        feedback.map((f) => `${formatDateTime(f.occurredAt)} — ${f.promptExcerpt}`),
      )}
      <section data-am-retro-edit>
        <h4>${escapeHtml(t('flightReview.edit.title'))}</h4>
        <label>
          ${escapeHtml(t('flightReview.edit.outcome'))}
          <select data-am-retro-outcome-select>
            <option value="">${escapeHtml(t('flightReview.edit.keepCurrent'))}</option>
            ${MANUAL_OUTCOMES.map(
              (o) =>
                `<option value="${o}"${formOutcome === o ? ' selected' : ''}>${escapeHtml(t(`flightReview.outcome.${o}`))}</option>`,
            ).join('')}
          </select>
        </label>
        <label>
          ${escapeHtml(t('flightReview.edit.tags'))}
          <input type="text" data-am-retro-tags placeholder="${escapeHtml(t('flightReview.edit.tagsPlaceholder'))}" />
        </label>
        <label>
          ${escapeHtml(t('flightReview.edit.notes'))}
          <textarea data-am-retro-notes rows="3" maxlength="2000"></textarea>
        </label>
        <div data-am-retro-actions>
          <button type="button" data-am-retro-save ${saving ? 'disabled' : ''}>
            ${escapeHtml(saving ? t('flightReview.edit.saving') : t('flightReview.edit.save'))}
          </button>
        </div>
        ${
          feedbackMessage
            ? `<p data-am-retro-feedback data-kind="${feedbackMessage.kind}" role="status">${escapeHtml(feedbackMessage.text)}</p>`
            : ''
        }
      </section>
    `;

    // フォーム値はローカル状態から復元する（innerHTML 再構築で失わない）
    const outcomeSelect = root.querySelector<HTMLSelectElement>('[data-am-retro-outcome-select]');
    const tagsInput = root.querySelector<HTMLInputElement>('[data-am-retro-tags]');
    const notesInput = root.querySelector<HTMLTextAreaElement>('[data-am-retro-notes]');
    if (outcomeSelect) {
      outcomeSelect.value = formOutcome;
      outcomeSelect.addEventListener('change', () => {
        formOutcome = (outcomeSelect.value as ManualOutcome | '') ?? '';
        markTouched();
      });
    }
    if (tagsInput) {
      tagsInput.value = formTags;
      tagsInput.addEventListener('input', () => {
        formTags = tagsInput.value;
        markTouched();
      });
    }
    if (notesInput) {
      notesInput.value = formNotes;
      notesInput.addEventListener('input', () => {
        formNotes = notesInput.value;
        markTouched();
      });
    }
    root.querySelector<HTMLButtonElement>('[data-am-retro-save]')?.addEventListener('click', () => void handleSave());
    root.querySelector<HTMLButtonElement>('[data-am-retro-close]')?.addEventListener('click', () => props.onClose());
  }

  render();

  return {
    update(next) {
      const reviewChanged = next.review.sessionId !== props.review.sessionId;
      props = next;
      if (reviewChanged) {
        // 別セッションへ切り替わったらフォームを初期化する
        formOutcome = next.review.outcome === 'unknown' ? '' : next.review.outcome;
        formTags = parseJsonArray<string>(next.review.tags, 'tags').join(', ');
        formNotes = next.review.notes;
        feedbackMessage = null;
        touched = false;
      }
      render();
    },
    destroy() {
      destroyed = true;
      root.remove();
    },
  };
}
