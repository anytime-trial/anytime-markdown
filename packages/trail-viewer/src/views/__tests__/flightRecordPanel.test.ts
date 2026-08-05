import { mountFlightRecordPanel, type FlightRecordPanelProps } from '../flightRecordPanel';
import { getTokens } from '../../theme/designTokens';
import { createTrailI18n } from '../../i18n/createTrailI18n';
import {
  createFlightReviewStore,
  type FlightReviewDto,
  type FlightReviewStore,
} from '../../data/flightReviewStore';
import {
  createInstructionStore,
  type InstructionRecordDto,
  type InstructionStore,
} from '../../data/instructionStore';

function record(overrides: Partial<InstructionRecordDto> = {}): InstructionRecordDto {
  return {
    instructionId: 'inst-0001-abcd',
    workspacePath: '/anytime-markdown',
    workspaceName: 'anytime-markdown',
    summary: 'Flight Review を指示単位にする',
    originPrompt: 'trail-viewer の Flight Review を指示単位にしてください',
    startedAt: '2026-08-05T00:00:00.000Z',
    endedAt: '2026-08-05T04:00:00.000Z',
    durationSeconds: 7200,
    outcome: 'unknown',
    outcomeSource: 'machine',
    sessionCount: 2,
    toolCallCount: 30,
    toolFailureCount: 3,
    reworkCount: 1,
    tags: [],
    closedAt: null,
    tokenUsage: {
      imported: false,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedCostUsd: 0,
      byModel: [],
    },
    deliverables: [],
    ...overrides,
  };
}

function review(overrides: Partial<FlightReviewDto> = {}): FlightReviewDto {
  return {
    id: 1,
    sessionId: 'sess-0001-abcd',
    workspacePath: '/anytime-markdown',
    startedAt: '2026-08-05T00:00:00.000Z',
    endedAt: '2026-08-05T01:00:00.000Z',
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
    createdAt: '2026-08-05T01:00:01.000Z',
    updatedAt: '2026-08-05T01:00:01.000Z',
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

describe('flightRecordPanel', () => {
  const originalFetch = globalThis.fetch;
  let container: HTMLElement;
  let store: InstructionStore | null = null;
  let reviewStore: FlightReviewStore | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    store?.dispose();
    store = null;
    reviewStore?.dispose();
    reviewStore = null;
    container.remove();
    globalThis.fetch = originalFetch;
  });

  function mountWith(s: InstructionStore, rs: FlightReviewStore): ReturnType<typeof mountFlightRecordPanel> {
    const props: FlightRecordPanelProps = {
      isDark: true,
      tokens: getTokens(true),
      t: createTrailI18n('ja'),
      store: s,
      reviewStore: rs,
    };
    return mountFlightRecordPanel(container, props);
  }

  /** 既定の応答: 一覧のみ返し、他エンドポイントは空。 */
  function stubList(instructions: InstructionRecordDto[]) {
    return stubFetch((url) => {
      if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions });
      if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
      if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [] });
      return jsonResponse({});
    });
  }

  async function mountAndSettle(instructions: InstructionRecordDto[]) {
    store = createInstructionStore('http://x');
    reviewStore = createFlightReviewStore('http://x');
    const handle = mountWith(store, reviewStore);
    await settle();
    return handle;
  }

  function panelStyleText(): string {
    return Array.from(document.head.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n');
  }

  /** セレクタのルール本体を取り出す（宣言の有無を個別に検査するため）。 */
  function ruleBody(css: string, selector: string): string {
    const idx = css.indexOf(selector + ' ');
    const start = css.indexOf('{', idx < 0 ? css.indexOf(selector) : idx);
    return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  }

  // ── 内部スクロール（タブパネルの器が overflow:hidden なので、パネル自身が持たないと切れる） ──
  //
  // jsdom はレイアウトを計算しないため「実際にスクロールできるか」は測れない。症状ではなく
  // 原因（スクロール領域の宣言と、flex の min-height:0 の連鎖）を検査する。実ブラウザでの
  // 確認は別途必要。
  it('一覧と詳細が内部スクロール領域を持ち、flex の min-height:0 が連鎖している', async () => {
    stubList([record()]);
    const handle = await mountAndSettle([record()]);

    const css = panelStyleText();
    expect(ruleBody(css, '[data-am-flight-list]')).toContain('overflow-y: auto');
    expect(ruleBody(css, '[data-am-flight-detail]')).toContain('overflow-y: auto');
    for (const sel of ['[data-am-flight-root]', '[data-am-flight-body]', '[data-am-flight-list]', '[data-am-flight-detail]']) {
      expect(ruleBody(css, sel)).toContain('min-height: 0');
    }
    handle.destroy();
  });

  describe('一覧', () => {
    it('行の単位が指示になり、指示概要と起点プロンプトを示す', async () => {
      stubList([record()]);
      const handle = await mountAndSettle([record()]);

      const rows = container.querySelectorAll('[data-am-flight-table] tbody tr');
      expect(rows).toHaveLength(1);
      expect(container.querySelector('[data-am-instruction-summary]')?.textContent).toContain(
        'Flight Review を指示単位にする',
      );
      expect(container.querySelector('[data-am-instruction-origin]')?.textContent).toContain(
        'trail-viewer の Flight Review を指示単位にして',
      );
      handle.destroy();
    });

    it('ワークスペース名とセッション数を列に持つ', async () => {
      stubList([record()]);
      const handle = await mountAndSettle([record()]);

      expect(container.querySelector('[data-am-workspace-badge]')?.textContent).toContain('anytime-markdown');
      const cells = container.querySelectorAll('[data-am-flight-table] tbody td');
      expect(Array.from(cells).map((c) => c.textContent?.trim())).toContain('2');
      handle.destroy();
    });

    it('outcome は色 + テキストの冗長表示になる', async () => {
      stubList([record({ outcome: 'achieved' })]);
      const handle = await mountAndSettle([]);

      const badge = container.querySelector<HTMLElement>('[data-am-outcome-badge]');
      expect(badge?.dataset['outcome']).toBe('achieved');
      expect(badge?.textContent?.trim()).not.toBe('');
      handle.destroy();
    });

    it('宣言の無い指示は概要を推測せず「宣言なし」と示す', async () => {
      stubList([record({ summary: '', originPrompt: '' })]);
      const handle = await mountAndSettle([]);

      expect(container.querySelector('[data-am-instruction-undeclared]')).not.toBeNull();
      handle.destroy();
    });

    it('トークン未取込は 0 ではなく未取込として示す', async () => {
      stubList([record()]);
      const handle = await mountAndSettle([]);

      const text = container.querySelector('[data-am-flight-table] tbody')?.textContent ?? '';
      expect(text).toContain('未取込');
      handle.destroy();
    });

    it('トークンが取込済みなら合計と費用を出す', async () => {
      stubList([
        record({
          tokenUsage: {
            imported: true,
            inputTokens: 1000,
            outputTokens: 2000,
            cacheReadTokens: 3000,
            cacheCreationTokens: 4000,
            estimatedCostUsd: 12.5,
            byModel: [
              { model: 'opus', inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 3000, cacheCreationTokens: 4000, estimatedCostUsd: 12.5 },
            ],
          },
        }),
      ]);
      const handle = await mountAndSettle([]);

      const text = container.querySelector('[data-am-flight-table] tbody')?.textContent ?? '';
      expect(text).toContain('10,000');
      expect(text).toContain('$12.50');
      handle.destroy();
    });

    it('取得失敗は空一覧と別の表示になる', async () => {
      stubFetch(() => jsonResponse({}, 500));
      const handle = await mountAndSettle([]);

      expect(container.querySelector('[data-am-flight-load-failed]')).not.toBeNull();
      expect(container.querySelector('[data-am-flight-empty]')).toBeNull();
      handle.destroy();
    });

    it('0 件は空状態を表示する', async () => {
      stubList([]);
      const handle = await mountAndSettle([]);

      expect(container.querySelector('[data-am-flight-empty]')).not.toBeNull();
      expect(container.querySelector('[data-am-flight-load-failed]')).toBeNull();
      handle.destroy();
    });

    it('outcome フィルタの変更がサーバーへのクエリに反映される', async () => {
      const { calls } = stubList([]);
      const handle = await mountAndSettle([]);

      const select = container.querySelector<HTMLSelectElement>('[data-am-flight-filter-outcome]');
      expect(select).not.toBeNull();
      select!.value = 'achieved';
      select!.dispatchEvent(new Event('change'));
      await settle();

      const last = calls.filter((c) => c.url.includes('/api/trail/instructions?')).at(-1);
      expect(last?.url).toContain('outcome=achieved');
      handle.destroy();
    });
  });

  describe('詳細', () => {
    function stubDetail(overrides: Partial<InstructionRecordDto> = {}) {
      return stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions: [record(overrides)] });
        if (url.includes('/sessions')) {
          return jsonResponse({
            sessions: [
              { instructionId: 'inst-0001-abcd', sessionId: 'sess-0001-abcd', sequence: 1, declaredAt: '2026-08-05T00:00:00.000Z' },
              { instructionId: 'inst-0001-abcd', sessionId: 'sess-0002-efgh', sequence: 2, declaredAt: '2026-08-05T02:00:00.000Z' },
            ],
          });
        }
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [review()] });
        if (url.includes('/api/memory/rationale')) return jsonResponse({ rationale: [] });
        if (url.includes('/api/trail/user-feedback')) return jsonResponse({ userFeedback: [] });
        return jsonResponse({});
      });
    }

    async function openFirstRow(overrides: Partial<InstructionRecordDto> = {}) {
      stubDetail(overrides);
      const handle = await mountAndSettle([]);
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();
      return handle;
    }

    it('行選択で指示の要約・時間・所属セッションが表示される', async () => {
      const handle = await openFirstRow();

      const detail = container.querySelector<HTMLElement>('[data-am-flight-detail]');
      expect(detail?.hidden).toBe(false);
      expect(detail?.textContent).toContain('Flight Review を指示単位にする');
      expect(container.querySelector('[data-am-instruction-facts]')).not.toBeNull();
      handle.destroy();
    });

    it('成果物をコミット済み / 未コミットの別つきで一覧する', async () => {
      const handle = await openFirstRow({
        deliverables: [
          { kind: 'code', filePath: 'packages/trail-core/src/a.ts', committed: true, commitHash: 'abc12345' },
          { kind: 'doc', filePath: 'spec/b.md', committed: false, commitHash: '' },
        ],
      });

      const items = container.querySelectorAll('[data-am-deliverable-list] li');
      expect(items).toHaveLength(2);
      // ドキュメントを先に出す
      expect(items[0]?.textContent).toContain('spec/b.md');
      const badges = container.querySelectorAll<HTMLElement>('[data-am-deliverable-badge]');
      expect(badges[0]?.dataset['committed']).toBe('false');
      expect(badges[0]?.textContent?.trim()).toBe('未コミット');
      expect(badges[1]?.textContent?.trim()).toBe('abc12345');
      handle.destroy();
    });

    it('成果物が 0 件なら空状態を出す', async () => {
      const handle = await openFirstRow();

      expect(container.querySelector('[data-am-deliverable-list]')).toBeNull();
      expect(container.querySelector('[data-am-retro-empty]')).not.toBeNull();
      handle.destroy();
    });

    it('トークンのモデル別内訳を詳細に出す', async () => {
      const handle = await openFirstRow({
        tokenUsage: {
          imported: true,
          inputTokens: 100,
          outputTokens: 200,
          cacheReadTokens: 300,
          cacheCreationTokens: 400,
          estimatedCostUsd: 1.25,
          byModel: [
            { model: 'opus', inputTokens: 100, outputTokens: 200, cacheReadTokens: 300, cacheCreationTokens: 400, estimatedCostUsd: 1.25 },
          ],
        },
      });

      const table = container.querySelector('[data-am-token-table]');
      expect(table).not.toBeNull();
      expect(table?.textContent).toContain('opus');
      expect(table?.textContent).toContain('$1.25');
      handle.destroy();
    });

    it('複数セッションのときだけセッション切替を出し、先頭を開く', async () => {
      const handle = await openFirstRow();

      const buttons = container.querySelectorAll<HTMLButtonElement>('[data-am-session-pick]');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
      handle.destroy();
    });

    it('セッションを切り替えると当該セッションの振り返りを取り直す', async () => {
      const { calls } = stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions: [record()] });
        if (url.includes('/sessions')) {
          return jsonResponse({
            sessions: [
              { instructionId: 'inst-0001-abcd', sessionId: 'sess-0001-abcd', sequence: 1, declaredAt: '2026-08-05T00:00:00.000Z' },
              { instructionId: 'inst-0001-abcd', sessionId: 'sess-0002-efgh', sequence: 2, declaredAt: '2026-08-05T02:00:00.000Z' },
            ],
          });
        }
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [review()] });
        return jsonResponse({ rationale: [], userFeedback: [] });
      });
      const handle = await mountAndSettle([]);
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      container.querySelectorAll<HTMLButtonElement>('[data-am-session-pick]')[1]?.click();
      await settle();

      expect(calls.some((c) => c.url.includes('sessionId=sess-0002-efgh'))).toBe(true);
      handle.destroy();
    });

    it('セッション単位の振り返り（RetrospectiveView）を詳細内に出す', async () => {
      const handle = await openFirstRow();

      expect(container.querySelector('[data-am-retro-header]')).not.toBeNull();
      handle.destroy();
    });

    it('訂正保存で当該セッションへ PATCH が送られる', async () => {
      const { calls } = stubFetch((url, init) => {
        if (init?.method === 'PATCH') return jsonResponse({ ok: true });
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions: [record()] });
        if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [review()] });
        return jsonResponse({ rationale: [], userFeedback: [] });
      });
      const handle = await mountAndSettle([]);
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      const outcomeSelect = container.querySelector<HTMLSelectElement>('[data-am-retro-outcome-select]');
      expect(outcomeSelect).not.toBeNull();
      outcomeSelect!.value = 'achieved';
      outcomeSelect!.dispatchEvent(new Event('change'));
      container.querySelector<HTMLButtonElement>('[data-am-retro-save]')?.click();
      await settle();

      const patchCall = calls.find((c) => c.init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(patchCall?.url).toContain('/api/trail/flight-reviews/');
      handle.destroy();
    });

    it('宣言の無い指示（暗黙グループ）は指示 ID をセッションとして開く', async () => {
      const { calls } = stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) {
          return jsonResponse({ instructions: [record({ instructionId: 'sess-lonely', summary: '', originPrompt: '', sessionCount: 1 })] });
        }
        if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [review({ sessionId: 'sess-lonely' })] });
        return jsonResponse({ rationale: [], userFeedback: [] });
      });
      const handle = await mountAndSettle([]);
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      expect(calls.some((c) => c.url.includes('sessionId=sess-lonely'))).toBe(true);
      handle.destroy();
    });
  });

  describe('props の更新', () => {
    it('t が変わるとツールバー文言が更新され入力値は維持される', async () => {
      stubList([]);
      const handle = await mountAndSettle([]);

      const tagInput = container.querySelector<HTMLInputElement>('[data-am-flight-filter-tag]');
      tagInput!.value = 'release';
      handle.update({
        isDark: true,
        tokens: getTokens(true),
        t: createTrailI18n('en'),
        store: store!,
        reviewStore: reviewStore!,
      });

      const label = container.querySelector<HTMLElement>('[data-am-flight-label="filter.outcome"]');
      expect(label?.textContent).toBe('Outcome');
      expect(tagInput?.value).toBe('release');
      handle.destroy();
    });

    it('store が差し替わると新 store を購読・操作する', async () => {
      const { calls } = stubList([]);
      const handle = await mountAndSettle([]);

      const store2 = createInstructionStore('http://new');
      handle.update({
        isDark: true,
        tokens: getTokens(true),
        t: createTrailI18n('ja'),
        store: store2,
        reviewStore: reviewStore!,
      });
      await settle();

      const select = container.querySelector<HTMLSelectElement>('[data-am-flight-filter-outcome]');
      select!.value = 'partial';
      select!.dispatchEvent(new Event('change'));
      await settle();

      const last = calls.at(-1);
      expect(last?.url).toContain('http://new');
      expect(last?.url).toContain('outcome=partial');
      handle.destroy();
      store2.dispose();
    });
  });

  it('CSV ボタンでフィルタ結果の CSV がダウンロードされる', async () => {
    stubList([record()]);
    const createObjectURL = jest.fn(() => 'blob:x');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const handle = await mountAndSettle([]);

    container.querySelector<HTMLButtonElement>('[data-am-flight-export]')?.click();

    expect(createObjectURL).toHaveBeenCalled();
    handle.destroy();
  });
});
