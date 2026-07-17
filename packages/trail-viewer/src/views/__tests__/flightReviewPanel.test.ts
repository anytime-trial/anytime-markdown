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
    rationaleAuditStatus: 'unaudited',
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
    // 未解決・次回の懸念・学習候補・user feedback・rationale（S4）の 5 セクションすべて空状態
    expect(empties.length).toBe(5);
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

  it('update で t が変わるとツールバー文言が更新され入力値は維持される（cross-review 指摘対応）', async () => {
    stubFetch(() => jsonResponse({ flightReviews: [] }));
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    const tagInput = container.querySelector<HTMLInputElement>('[data-am-flight-filter-tag]');
    if (tagInput) tagInput.value = 'release';

    handle.update({ isDark: true, tokens: getTokens(true), t: createTrailI18n('en'), store });
    await settle();

    const label = container.querySelector<HTMLElement>('[data-am-flight-label="filter.outcome"]');
    expect(label?.textContent).toBe('Outcome');
    expect(container.querySelector<HTMLInputElement>('[data-am-flight-filter-tag]')?.value).toBe('release');
    handle.destroy();
  });

  it('update で store が差し替わると新 store を購読・操作する（cross-review 指摘対応）', async () => {
    const { calls } = stubFetch(() => jsonResponse({ flightReviews: [] }));
    store = createFlightReviewStore('http://old');
    const handle = mountWithStore(store);
    await settle();

    const store2 = createFlightReviewStore('http://new');
    handle.update({ isDark: true, tokens: getTokens(true), t: createTrailI18n('ja'), store: store2 });
    await settle();

    // 差し替え直後に新 store で再取得される
    expect(calls.some((c) => c.url.startsWith('http://new/api/trail/flight-reviews'))).toBe(true);

    // 以後のフィルタ操作も新 store（新 serverUrl）に向かう
    const select = container.querySelector<HTMLSelectElement>('[data-am-flight-filter-outcome]');
    if (select) {
      select.value = 'achieved';
      select.dispatchEvent(new Event('change'));
    }
    await settle();
    const last = calls.at(-1);
    expect(last?.url).toContain('http://new/');
    expect(last?.url).toContain('outcome=achieved');

    store2.dispose();
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

describe('flightReviewPanel rationale audit (Phase 6 S4)', () => {
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
    return mountFlightReviewPanel(container, {
      isDark: true,
      tokens: getTokens(true),
      t: createTrailI18n('ja'),
      store: s,
    });
  }

  function rationaleFetch(nodes: unknown[]): void {
    stubFetch((url) => {
      if (url.includes('/api/memory/rationale')) return jsonResponse({ rationale: nodes });
      if (url.includes('user-feedback')) return jsonResponse({ userFeedback: [] });
      return jsonResponse({ flightReviews: [review()] });
    });
  }

  it('一覧に監査ステータスバッジ列が表示される（FR-24）', async () => {
    stubFetch(() => jsonResponse({ flightReviews: [review({ rationaleAuditStatus: 'valid' })] }));
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();

    const badge = container.querySelector<HTMLElement>('tbody [data-am-audit-badge]');
    expect(badge?.dataset['audit']).toBe('valid');
    expect(badge?.textContent).toBe('妥当');
    handle.destroy();
  });

  it('Rationale セクションにノードが表示され confidence フィルタが効く（FR-24）', async () => {
    rationaleFetch([
      { commitHash: 'abc123def456', summary: '単純さを優先', confidenceLabel: 'EXTRACTED', createdAt: '2026-07-17T09:00:00.000Z' },
      { commitHash: 'ffff00001111', summary: '推定された根拠', confidenceLabel: 'INFERRED', createdAt: '2026-07-17T09:10:00.000Z' },
    ]);
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();
    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    expect(container.querySelectorAll('[data-am-rationale-list] li')).toHaveLength(2);

    const filter = container.querySelector<HTMLSelectElement>('[data-am-rationale-filter]');
    if (filter) {
      filter.value = 'INFERRED';
      filter.dispatchEvent(new Event('change'));
    }
    const items = container.querySelectorAll('[data-am-rationale-list] li');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('推定された根拠');
    handle.destroy();
  });

  it('監査ステータスの保存で PATCH に rationaleAuditStatus のみが載る（FR-24）', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse({ ok: true }));
      if (String(url).includes('/api/memory/rationale')) return Promise.resolve(jsonResponse({ rationale: [] }));
      if (String(url).includes('user-feedback')) return Promise.resolve(jsonResponse({ userFeedback: [] }));
      return Promise.resolve(jsonResponse({ flightReviews: [review()] }));
    }) as typeof fetch;
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();
    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    const auditSelect = container.querySelector<HTMLSelectElement>('[data-am-audit-status]');
    if (auditSelect) {
      auditSelect.value = 'needs_fix';
      auditSelect.dispatchEvent(new Event('change'));
    }
    container.querySelector<HTMLButtonElement>('[data-am-audit-save]')?.click();
    await settle();

    const patchCall = calls.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patchCall?.init?.body))).toEqual({ rationaleAuditStatus: 'needs_fix' });
    expect(container.querySelector('[data-am-retro-rationale] [data-am-retro-feedback]')?.getAttribute('data-kind')).toBe('success');
    handle.destroy();
  });

  it('手動編集中の監査保存はポーリング保留を解除しない（cross-review 指摘対応）', async () => {
    rationaleFetch([]);
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();
    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    // 手動フォーム（notes）を編集 → editing 保留
    const notes = container.querySelector<HTMLTextAreaElement>('[data-am-retro-notes]');
    if (notes) {
      notes.value = '未保存の編集';
      notes.dispatchEvent(new Event('input'));
    }
    expect(store.getState().editing).toBe(true);

    // 監査だけ保存 → 手動編集の保留は維持される
    container.querySelector<HTMLButtonElement>('[data-am-audit-save]')?.click();
    await settle();
    expect(store.getState().editing).toBe(true);
    handle.destroy();
  });

  it('監査のみの変更は監査保存で保留が解除される', async () => {
    rationaleFetch([]);
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();
    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    const auditSelect = container.querySelector<HTMLSelectElement>('[data-am-audit-status]');
    if (auditSelect) {
      auditSelect.value = 'valid';
      auditSelect.dispatchEvent(new Event('change'));
    }
    expect(store.getState().editing).toBe(true);

    container.querySelector<HTMLButtonElement>('[data-am-audit-save]')?.click();
    await settle();
    expect(store.getState().editing).toBe(false);
    handle.destroy();
  });

  it('rationale 0 件は空状態で成立する（FR-25）', async () => {
    rationaleFetch([]);
    store = createFlightReviewStore('http://x');
    const handle = mountWithStore(store);
    await settle();
    container.querySelector<HTMLTableRowElement>('tbody tr')?.click();
    await settle();

    expect(container.querySelector('[data-am-retro-rationale] [data-am-retro-empty]')?.textContent).toContain(
      '決定根拠ノードはありません',
    );
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
