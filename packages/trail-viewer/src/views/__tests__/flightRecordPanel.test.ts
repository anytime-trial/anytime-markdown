import { mountFlightRecordPanel, type FlightRecordPanelProps } from '../flightRecordPanel';
import { createFlightFindingStore, type FlightFindingStore } from '../../data/flightFindingStore';
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

/**
 * ui-core Select（combobox ボタン + ポータル listbox）の選択肢をラベルで選ぶ。
 * mousedown で開き、listbox は portalTarget = document.body へ出る。見つからない場合は
 * throw する ——「操作できなかった」を黙って通すと、UI が壊れてもテストが緑のままになる。
 */
function chooseOption(host: Element | null | undefined, label: string): void {
  const combo = host?.querySelector<HTMLButtonElement>('[role="combobox"]') ?? null;
  if (combo === null) throw new Error('combobox が見つからない');
  combo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const options = [...document.body.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
  const target = options.find((o) => (o.textContent ?? '').trim() === label);
  if (target === undefined) {
    throw new Error(`option "${label}" が見つからない（候補: ${options.map((o) => o.textContent).join(' / ')}）`);
  }
  target.click();
}

describe('flightRecordPanel', () => {
  const originalFetch = globalThis.fetch;
  let container: HTMLElement;
  let store: InstructionStore | null = null;
  let reviewStore: FlightReviewStore | null = null;
  let findingStore: FlightFindingStore | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    store?.dispose();
    store = null;
    reviewStore?.dispose();
    reviewStore = null;
    findingStore?.dispose();
    findingStore = null;
    container.remove();
    globalThis.fetch = originalFetch;
  });

  function mountWith(
    s: InstructionStore,
    rs: FlightReviewStore,
    overrides: Partial<FlightRecordPanelProps> = {},
  ): ReturnType<typeof mountFlightRecordPanel> {
    findingStore ??= createFlightFindingStore('http://x');
    const props: FlightRecordPanelProps = {
      isDark: true,
      tokens: getTokens(true),
      t: createTrailI18n('ja'),
      store: s,
      reviewStore: rs,
      findingStore,
      serverUrl: '',
      ...overrides,
    };
    return mountFlightRecordPanel(container, props);
  }

  /** 既定の応答: 一覧のみ返し、他エンドポイントは空。 */
  function stubList(instructions: InstructionRecordDto[]) {
    return stubFetch((url) => {
      if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions });
      if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
      if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [] });
      if (url.includes('/api/memory/reviews/flight-')) return jsonResponse([]);
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

  // ── サブタブ切替の実効性（属性ではなく描画で検査する） ──
  //
  // `[hidden]` は UA スタイル由来のため、author スタイルで `display` を宣言した器には負ける。
  // 属性の有無だけを見るアサーションはこの破れを素通りさせ、Bug Fixed タブを開いても
  // 指示のフィルタバーと一覧が上に残る状態が実機でだけ現れた。
  it('サブタブを切り替えると非表示側の器が実際に描画されない', async () => {
    stubList([record()]);
    const handle = await mountAndSettle([record()]);

    const displayOf = (selector: string): string => {
      const el = container.querySelector<HTMLElement>(selector);
      if (el === null) throw new Error(`${selector} が見つからない`);
      return globalThis.getComputedStyle(el).display;
    };

    // 指示タブ: バグ / Review / Drift の器は描画されない
    expect(displayOf('[data-am-flight-bugfix]')).toBe('none');
    expect(displayOf('[data-am-flight-drift]')).toBe('none');

    container.querySelector<HTMLButtonElement>('[data-am-flight-tab="bugfix"]')?.click();
    await settle();

    // Bug Fixed タブ: 指示のフィルタバーと一覧・詳細の器は描画されない
    expect(displayOf('[data-am-flight-toolbar]')).toBe('none');
    expect(displayOf('[data-am-flight-body]')).toBe('none');
    expect(displayOf('[data-am-flight-bugfix]')).not.toBe('none');

    container.querySelector<HTMLButtonElement>('[data-am-flight-tab="review"]')?.click();
    await settle();

    expect(displayOf('[data-am-flight-toolbar]')).toBe('none');
    expect(displayOf('[data-am-flight-body]')).toBe('none');
    expect(displayOf('[data-am-flight-bugfix]')).toBe('none');
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

    // ネイティブ `<select>` の popup は OS 既定の配色で描かれる。要素側の color は option の
    // 文字色にだけ効くため、ダークテーマでは白背景 × 白文字になり選択肢が読めない。
    // popup の描画色は jsdom では測れないので、症状ではなく原因（生の `<select>` が
    // DOM に無いこと）を検査する。
    it('フィルタに生の <select> を使わない（ダークテーマで popup が白地に白文字になる）', async () => {
      stubList([record()]);
      const handle = await mountAndSettle([]);

      expect(container.querySelectorAll('select')).toHaveLength(0);
      expect(container.querySelector('[data-am-flight-filter-outcome] [role="combobox"]')).not.toBeNull();
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

      chooseOption(container.querySelector('[data-am-flight-filter-outcome]'), '達成');
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

      chooseOption(container.querySelector('[data-am-retro-outcome-select]'), '達成');
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
        findingStore: findingStore!,
        serverUrl: '',
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
        findingStore: findingStore!,
        serverUrl: '',
      });
      await settle();

      chooseOption(container.querySelector('[data-am-flight-filter-outcome]'), '部分達成');
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

  // ── レビュー指摘（Flight Record へ畳んだ memory_reviews の session 経路） ──
  describe('レビュー指摘', () => {
    const FINDING = {
      id: 'rf-1',
      reviewId: 'rev-1',
      instructionId: 'inst-0001-abcd',
      sessionId: 'sess-0001-abcd',
      title: 'Session review sess-0001',
      reviewer: 'pr-review-toolkit:code-reviewer',
      reviewedAt: '2026-08-05T02:00:00.000Z',
      workspace: 'anytime-markdown',
      targetFilePath: 'packages/trail-viewer/src/a.ts',
      targetRepo: 'anytime-markdown',
      category: 'logic',
      severity: 'error',
      findingText: '条件が反転している',
      addressedCommitSha: null,
      addressedAt: null,
    };

    /** 指摘つきの応答。件数と一覧の両方を返す。 */
    function stubWithFindings(instructions: InstructionRecordDto[]) {
      return stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions });
        if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [] });
        if (url.includes('flight-counts')) {
          return jsonResponse([{ instructionId: 'inst-0001-abcd', error: 1, warn: 2, info: 0, total: 3 }]);
        }
        if (url.includes('flight-findings')) return jsonResponse([FINDING]);
        return jsonResponse({});
      });
    }

    async function mountWithFindings(overrides: Partial<FlightRecordPanelProps> = {}) {
      stubWithFindings([record()]);
      store = createInstructionStore('http://x');
      reviewStore = createFlightReviewStore('http://x');
      const handle = mountWith(store, reviewStore, overrides);
      await settle();
      return handle;
    }

    it('サブタブで指示と Review を切り替える', async () => {
      const handle = await mountWithFindings();

      const tabs = container.querySelectorAll('[data-am-flight-tabs] button');
      expect(tabs).toHaveLength(4); // 指示 / Bug Fixed / Review / Drift
      expect(container.querySelector('[data-am-flight-review]')?.hasAttribute('hidden')).toBe(true);

      container.querySelector<HTMLButtonElement>('[data-am-flight-tab="review"]')?.click();
      await settle();

      expect(container.querySelector('[data-am-flight-review]')?.hasAttribute('hidden')).toBe(false);
      expect(container.querySelector('[data-am-flight-body]')?.hasAttribute('hidden')).toBe(true);
      expect(container.querySelectorAll('[data-am-finding-row]')).toHaveLength(1);
      handle.destroy();
    });

    it('一覧に severity 別の件数列を出す', async () => {
      const handle = await mountWithFindings();

      const cell = container.querySelector('[data-am-finding-count-cell]');
      expect(cell?.querySelector('[data-state="error"]')?.textContent).toBe('1');
      expect(cell?.querySelector('[data-state="warn"]')?.textContent).toBe('2');
      handle.destroy();
    });

    it('件数が取得できないときは 0 件と別の表示にする', async () => {
      stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions: [record()] });
        if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [] });
        if (url.includes('/api/memory/reviews/flight-')) return jsonResponse(null, 500);
        return jsonResponse({});
      });
      store = createInstructionStore('http://x');
      reviewStore = createFlightReviewStore('http://x');
      const handle = mountWith(store, reviewStore);
      await settle();

      const cell = container.querySelector('[data-am-finding-count-cell]');
      expect(cell?.querySelector('[data-state="unknown"]')).not.toBeNull();
      expect(cell?.querySelector('[data-state="none"]')).toBeNull();
      handle.destroy();
    });

    it('詳細ペインに当該指示の指摘を出す', async () => {
      const handle = await mountWithFindings();
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      const items = container.querySelectorAll('[data-am-finding-item]');
      expect(items).toHaveLength(1);
      expect(items[0].querySelector('[data-am-finding-text]')?.textContent).toContain('条件が反転している');
      expect(items[0].querySelector('[data-am-finding-severity]')?.textContent).toBe('error');
      handle.destroy();
    });

    it('対象ファイルのリンクを押すと onOpenFile が呼ばれる', async () => {
      const onOpenFile = jest.fn();
      const handle = await mountWithFindings({ onOpenFile });
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      container.querySelector<HTMLButtonElement>('[data-am-finding-open]')?.click();

      expect(onOpenFile).toHaveBeenCalledWith('packages/trail-viewer/src/a.ts');
      handle.destroy();
    });

    it('onOpenFile が無ければ押せないボタンを出さずテキストで示す', async () => {
      const handle = await mountWithFindings();
      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      expect(container.querySelector('[data-am-finding-open]')).toBeNull();
      expect(container.querySelector('[data-am-finding-target]')?.textContent).toBe(
        'packages/trail-viewer/src/a.ts',
      );
      handle.destroy();
    });

    it('Review タブの行を押すと指示タブへ戻り、その指示を選択する', async () => {
      const handle = await mountWithFindings();
      container.querySelector<HTMLButtonElement>('[data-am-flight-tab="review"]')?.click();
      await settle();

      container.querySelector<HTMLElement>('[data-am-finding-row]')?.click();
      await settle();

      expect(container.querySelector('[data-am-flight-review]')?.hasAttribute('hidden')).toBe(true);
      expect(
        container.querySelector('[data-am-flight-table] tbody tr')?.getAttribute('aria-selected'),
      ).toBe('true');
      handle.destroy();
    });
  });
  // ── Bug Fixed サブタブ（2026-08-05 に Memory から移設） ──
  describe('Bug Fixed', () => {
    function bugRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'bugfix-1',
        commitSha: '89754a1c0abcdef',
        bugEntityId: 'bug:89754a1',
        package: 'trail-viewer',
        category: 'logic',
        subjectSummary: 'テーマ変数の解決順を直す',
        sessionId: 'sess-0001-abcd',
        committedAt: '2026-08-05T02:00:00.000Z',
        precededByFindingIds: [],
        ...overrides,
      };
    }

    /** memory-core 側も応答する stub。バグ履歴は sessionIds の有無で出し分ける。 */
    function stubWithBugs(options: { bugs?: unknown[]; historyFails?: boolean } = {}) {
      const bugs = options.bugs ?? [bugRow()];
      return stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions: [record()] });
        if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [] });
        if (url.includes('/api/memory/reviews/flight-')) return jsonResponse([]);
        if (url.includes('/api/memory/bugs/recurring')) return jsonResponse([]);
        if (url.includes('/api/memory/bugs/history')) {
          return options.historyFails ? jsonResponse(null, 500) : jsonResponse(bugs);
        }
        return jsonResponse({});
      });
    }

    async function mountWithBugs(options: { bugs?: unknown[]; historyFails?: boolean } = {}) {
      const stub = stubWithBugs(options);
      store = createInstructionStore('http://x');
      reviewStore = createFlightReviewStore('http://x');
      const handle = mountWith(store, reviewStore, { serverUrl: 'http://mem' });
      await settle();
      return { handle, stub };
    }

    it('サブタブを開くとバグ履歴パネルがマウントされる', async () => {
      const { handle } = await mountWithBugs();

      expect(container.querySelector('[data-am-flight-bugfix]')?.hasAttribute('hidden')).toBe(true);
      container.querySelector<HTMLButtonElement>('[data-am-flight-tab="bugfix"]')?.click();
      await settle();

      expect(container.querySelector('[data-am-flight-bugfix]')?.hasAttribute('hidden')).toBe(false);
      expect(container.querySelector('[data-am-flight-body]')?.hasAttribute('hidden')).toBe(true);
      expect(container.querySelector('[aria-label="bug-history"]')).not.toBeNull();
      handle.destroy();
    });

    it('詳細ペインに当該指示のバグ修正を出し、絞り込みはサーバへ渡す', async () => {
      const { handle, stub } = await mountWithBugs();

      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      const rows = container.querySelectorAll('[data-am-bugfix-row]');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('テーマ変数の解決順を直す');
      expect(rows[0]?.textContent).toContain('89754a1');

      // 一覧の上限で欠けさせないため、絞り込みはクライアントでなくサーバで行う
      const historyCall = stub.calls.find((c) => c.url.includes('/api/memory/bugs/history'));
      expect(historyCall?.url).toContain('sessionIds=inst-0001-abcd');
      handle.destroy();
    });

    it('詳細の行を押すと Bug Fixed タブへ移り、そのバグだけに絞る', async () => {
      const { handle } = await mountWithBugs({
        bugs: [bugRow(), bugRow({ id: 'bugfix-2', bugEntityId: 'bug:other', subjectSummary: '別のバグ' })],
      });

      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();
      container.querySelector<HTMLButtonElement>('[data-am-bugfix-row]')?.click();
      await settle();

      expect(container.querySelector('[data-am-flight-bugfix]')?.hasAttribute('hidden')).toBe(false);
      const bugTableRows = container.querySelectorAll('[aria-label="bug-history-table"] tbody tr');
      expect(bugTableRows).toHaveLength(1);
      expect(bugTableRows[0]?.textContent).toContain('テーマ変数の解決順を直す');
      handle.destroy();
    });

    it('バグ履歴が取得できないときは 0 件と別の表示にする', async () => {
      const { handle } = await mountWithBugs({ historyFails: true });

      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      expect(container.querySelector('[data-am-finding-load-failed]')).not.toBeNull();
      expect(container.querySelectorAll('[data-am-bugfix-row]')).toHaveLength(0);
      handle.destroy();
    });

    it('serverUrl が無ければ memory-core を叩かず空のまま出す', async () => {
      const stub = stubWithBugs();
      store = createInstructionStore('http://x');
      reviewStore = createFlightReviewStore('http://x');
      const handle = mountWith(store, reviewStore);
      await settle();

      container.querySelector<HTMLElement>('[data-am-flight-table] tbody tr')?.click();
      await settle();

      expect(stub.calls.some((c) => c.url.includes('/api/memory/bugs/'))).toBe(false);
      expect(container.querySelectorAll('[data-am-bugfix-row]')).toHaveLength(0);
      handle.destroy();
    });
  });
  // -------------------------------------------------------------------------
  // Drift サブタブ（2026-08-05 に Memory タブから移設）
  // -------------------------------------------------------------------------
  describe('Drift サブタブ', () => {
    const DRIFT_ROW = {
      id: 'drift:entity/foo:implements:spec_vs_code',
      subjectEntityId: 'entity/foo',
      subjectDisplayName: 'Foo',
      predicate: 'implements',
      driftType: 'spec_vs_code',
      severity: 'error',
      conversationValue: null,
      specValue: 'a',
      codeValue: 'b',
      detectedAt: '2026-08-01T00:00:00.000Z',
      resolvedAt: null,
      resolutionNote: '',
    };

    /** drift 系エンドポイントだけ実データを返す stub。他は空応答。 */
    function stubWithDrift() {
      return stubFetch((url) => {
        if (url.includes('/api/trail/instructions?')) return jsonResponse({ instructions: [record()] });
        if (url.includes('/sessions')) return jsonResponse({ sessions: [] });
        if (url.includes('/api/trail/flight-reviews')) return jsonResponse({ flightReviews: [] });
        if (url.includes('/api/memory/drift/by-day')) return jsonResponse({ points: [] });
        if (url.includes('/api/memory/drift/events')) return jsonResponse([DRIFT_ROW]);
        return jsonResponse([]);
      });
    }

    async function mountForDrift() {
      stubWithDrift();
      store = createInstructionStore('http://x');
      reviewStore = createFlightReviewStore('http://x');
      const handle = mountWith(store, reviewStore, { serverUrl: 'http://mem' });
      await settle();
      return handle;
    }

    it('Drift タブのボタンがある', async () => {
      const handle = await mountForDrift();
      expect(container.querySelector('[data-am-flight-tab="drift"]')).not.toBeNull();
      handle.destroy();
    });

    it('開くまで drift をマウントせず memory-core の drift API も叩かない', async () => {
      const { calls } = stubWithDrift();
      store = createInstructionStore('http://x');
      reviewStore = createFlightReviewStore('http://x');
      const handle = mountWith(store, reviewStore, { serverUrl: 'http://mem' });
      await settle();

      expect(container.querySelector('[data-am-flight-drift]')?.hasAttribute('hidden')).toBe(true);
      expect(calls.some((c) => c.url.includes('/api/memory/drift/'))).toBe(false);
      handle.destroy();
    });

    it('Drift タブを開くと後から届いた行が表示される（空のまま固まらない）', async () => {
      const handle = await mountForDrift();

      container.querySelector<HTMLButtonElement>('[data-am-flight-tab="drift"]')?.click();
      await settle();

      const driftRegion = container.querySelector<HTMLElement>('[data-am-flight-drift]');
      // 属性ではなく描画結果で見る（インライン display は [hidden] の打ち消しに勝つため、
      // hasAttribute だけでは「隠したはずの器が残る」破れを素通りさせる）。
      expect(driftRegion === null ? 'none' : globalThis.getComputedStyle(driftRegion).display).not.toBe('none');
      const bodyEl = container.querySelector<HTMLElement>('[data-am-flight-body]');
      expect(bodyEl === null ? 'none' : globalThis.getComputedStyle(bodyEl).display).toBe('none');
      expect(driftRegion?.textContent).toContain('Foo');
      expect(driftRegion?.textContent).toContain('spec_vs_code');
      handle.destroy();
    });

    it('指示タブへ戻しても drift は破棄されない（再取得しない）', async () => {
      const handle = await mountForDrift();
      container.querySelector<HTMLButtonElement>('[data-am-flight-tab="drift"]')?.click();
      await settle();
      container.querySelector<HTMLButtonElement>('[data-am-flight-tab="instruction"]')?.click();
      await settle();

      const driftRegion = container.querySelector<HTMLElement>('[data-am-flight-drift]');
      expect(driftRegion === null ? '' : globalThis.getComputedStyle(driftRegion).display).toBe('none');
      expect(driftRegion?.textContent).toContain('Foo');
      handle.destroy();
    });
  });
});
