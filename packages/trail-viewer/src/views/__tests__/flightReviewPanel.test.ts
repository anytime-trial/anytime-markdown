import { mountFlightReviewPanel, type FlightReviewPanelProps } from '../flightReviewPanel';
import { formatDurationSeconds, parseTagsInput } from '../retrospectiveView';
import { getTokens } from '../../theme/designTokens';
import { createTrailI18n } from '../../i18n/createTrailI18n';
import {
  createFlightReviewStore,
  type FlightReviewDto,
  type FlightReviewStore,
} from '../../data/flightReviewStore';

function review(overrides: Partial<FlightReviewDto> = {}): FlightReviewDto {
  return {
    id: 1,
    sessionId: 'sess-0001-abcd',
    workspacePath: '/ws',
    startedAt: '2026-07-17T09:00:00.000Z',
    endedAt: '2026-07-17T10:00:00.000Z',
    durationSeconds: 3600,
    outcome: 'unknown',
    outcomeSource: 'machine',
    toolCallCount: 10,
    toolFailureCount: 1,
    reworkCount: 2,
    unresolvedItems: '[]',
    nextConcerns: '[]',
    lessonCandidates: '[]',
    tags: '[]',
    notes: '',
    createdAt: '2026-07-17T10:00:01.000Z',
    updatedAt: '2026-07-17T10:00:01.000Z',
    ...overrides,
  };
}

/** fetch を差し替えて応答を制御する。呼び出し記録も返す。 */
function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
): { calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(impl(String(url), init));
  }) as typeof fetch;
  return { calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('flightReviewPanel', () => {
  const originalFetch = globalThis.fetch;
  let container: HTMLElement;
  let store: FlightReviewStore | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    store?.dispose();
    store = null;
    container.remove();
    globalThis.fetch = originalFetch;
  });

  function mountWithStore(s: FlightReviewStore): ReturnType<typeof mountFlightReviewPanel> {
    const props: FlightReviewPanelProps = {
      isDark: true,
      tokens: getTokens(true),
      t: createTrailI18n('ja'),
      store: s,
    };
    return mountFlightReviewPanel(container, props);
  }

  it('一覧を表示し outcome は色 + テキストの冗長表示になる（FR-16）', async () => {
    stubFetch(() => jsonResponse({ flightReviews: [review({ outcome: 'achieved', outcomeSource: 'self' })] }));
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    const rows = container.querySelectorAll('[data-am-flight-table] tbody tr');
    expect(rows).toHaveLength(1);
    const badge = container.querySelector<HTMLElement>('[data-am-outcome-badge]');
    expect(badge?.dataset['outcome']).toBe('achieved');
    expect(badge?.textContent).toBe('達成');
    handle.destroy();
  });

  it('取得失敗は空一覧と別の表示になる', async () => {
    stubFetch(() => {
      throw new Error('down');
    });
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    expect(container.querySelector('[data-am-flight-load-failed]')).not.toBeNull();
    expect(container.querySelector('[data-am-flight-empty]')).toBeNull();
    handle.destroy();
  });

  it('0 件は空状態を表示する', async () => {
    stubFetch(() => jsonResponse({ flightReviews: [] }));
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    expect(container.querySelector('[data-am-flight-empty]')).not.toBeNull();
    handle.destroy();
  });

  it('outcome フィルタの変更がサーバーへのクエリに反映される（FR-16）', async () => {
    const { calls } = stubFetch(() => jsonResponse({ flightReviews: [] }));
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    const select = container.querySelector<HTMLSelectElement>('[data-am-flight-filter-outcome]');
    expect(select).not.toBeNull();
    if (select) {
      select.value = 'achieved';
      select.dispatchEvent(new Event('change'));
    }
    await settle();

    expect(calls.at(-1)?.url).toContain('outcome=achieved');
    handle.destroy();
  });

  it('行選択で詳細（RetrospectiveView）が表示され user feedback を取得する（FR-17）', async () => {
    stubFetch((url) => {
      if (url.includes('user-feedback')) {
        return jsonResponse({
          userFeedback: [
            {
              id: 1,
              sessionId: 'sess-0001-abcd',
              occurredAt: '2026-07-17T09:30:00.000Z',
              promptExcerpt: 'やり直して',
              matchedPattern: 'やり直',
              createdAt: '2026-07-17T09:30:01.000Z',
            },
          ],
        });
      }
      return jsonResponse({ flightReviews: [review()] });
    });
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    const detail = container.querySelector<HTMLElement>('[data-am-flight-detail]');
    expect(detail?.hidden).toBe(false);
    expect(detail?.textContent).toContain('やり直して');
    handle.destroy();
  });

  it('S2 項目が空でも詳細は空状態表示で成立する（FR-18）', async () => {
    stubFetch((url) =>
      url.includes('user-feedback')
        ? jsonResponse({ userFeedback: [] })
        : jsonResponse({ flightReviews: [review()] }),
    );
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    const empties = container.querySelectorAll('[data-am-retro-empty]');
    // 未解決・次回の懸念・学習候補・user feedback の 4 セクションすべて空状態
    expect(empties.length).toBe(4);
    handle.destroy();
  });

  it('訂正保存で PATCH が送られ、成功後は manual 表示に変わる（FR-17）', async () => {
    let manual = false;
    const { calls } = stubFetch((url, init) => {
      if (init?.method === 'PATCH') {
        manual = true;
        return jsonResponse({ ok: true });
      }
      if (url.includes('user-feedback')) return jsonResponse({ userFeedback: [] });
      return jsonResponse({
        flightReviews: [
          manual
            ? review({ outcome: 'achieved', outcomeSource: 'manual', tags: '["release"]' })
            : review(),
        ],
      });
    });
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    const outcomeSelect = container.querySelector<HTMLSelectElement>('[data-am-retro-outcome-select]');
    if (outcomeSelect) {
      outcomeSelect.value = 'achieved';
      outcomeSelect.dispatchEvent(new Event('change'));
    }
    const tagsInput = container.querySelector<HTMLInputElement>('[data-am-retro-tags]');
    if (tagsInput) {
      tagsInput.value = 'release';
      tagsInput.dispatchEvent(new Event('input'));
    }
    container.querySelector<HTMLButtonElement>('[data-am-retro-save]')?.click();
    await settle();

    const patchCall = calls.find((c) => c.init?.method === 'PATCH');
    expect(patchCall?.url).toBe('http://x/api/trail/flight-reviews/sess-0001-abcd');
    expect(JSON.parse(String(patchCall?.init?.body))).toEqual({
      outcome: 'achieved',
      tags: ['release'],
      notes: '',
    });
    const source = container.querySelector<HTMLElement>('[data-am-retro-outcome] [data-am-source-badge]');
    expect(source?.dataset['source']).toBe('manual');
    expect(container.querySelector('[data-am-retro-feedback]')?.getAttribute('data-kind')).toBe('success');
    handle.destroy();
  });

  it('編集開始で store.setEditing(true) が呼ばれポーリング反映が保留される', async () => {
    let payload = [review()];
    stubFetch((url) =>
      url.includes('user-feedback') ? jsonResponse({ userFeedback: [] }) : jsonResponse({ flightReviews: payload }),
    );
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    const notes = container.querySelector<HTMLTextAreaElement>('[data-am-retro-notes]');
    if (notes) {
      notes.value = '編集中';
      notes.dispatchEvent(new Event('input'));
    }
    expect(store.getState().editing).toBe(true);

    payload = [review(), review({ id: 2, sessionId: 'sess-0002-efgh' })];
    await store.refresh();
    expect(store.getState().reviews).toHaveLength(1);
    handle.destroy();
  });

  it('CSV ボタンでフィルタ結果の CSV がダウンロードされる（FR-19）', async () => {
    stubFetch(() => jsonResponse({ flightReviews: [review()] }));
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    container.querySelector<HTMLButtonElement>('[data-am-flight-export]')?.click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    handle.destroy();
  });
});

describe('retrospectiveView helpers', () => {
  it('formatDurationSeconds は h/m/s へ整形し null は空にする', () => {
    expect(formatDurationSeconds(null)).toBe('');
    expect(formatDurationSeconds(45)).toBe('45s');
    expect(formatDurationSeconds(300)).toBe('5m');
    expect(formatDurationSeconds(3660)).toBe('1h 1m');
  });

  it('parseTagsInput はカンマ区切りを trim し空要素を除く', () => {
    expect(parseTagsInput(' release, ui ,,')).toEqual(['release', 'ui']);
    expect(parseTagsInput('')).toEqual([]);
  });
});
