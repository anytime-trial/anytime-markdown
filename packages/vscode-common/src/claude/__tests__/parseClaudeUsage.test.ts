import { collectUnknownLimitKinds, parseClaudeUsage } from '../parseClaudeUsage';

describe('parseClaudeUsage', () => {
  it('parses known limits and labels scoped weekly rows', () => {
    const rows = parseClaudeUsage({
      limits: [
        {
          kind: 'session',
          percent: 29,
          severity: 'normal',
          resets_at: '2026-07-12T14:19:59.534078+00:00',
        },
        {
          kind: 'weekly_all',
          percent: 17,
          severity: 'normal',
          resets_at: '2026-07-18T09:59:59.534100+00:00',
        },
        {
          kind: 'weekly_scoped',
          percent: 7,
          severity: 'normal',
          resets_at: '2026-07-18T09:59:59.534404+00:00',
          scope: { model: { display_name: 'Fable' } },
        },
      ],
    });

    expect(rows).toEqual([
      {
        key: 'session',
        label: 'Session (5h)',
        percent: 29,
        severity: 'normal',
        resetsAt: '2026-07-12T14:19:59.534Z',
      },
      {
        key: 'weekly_all',
        label: 'Weekly (all)',
        percent: 17,
        severity: 'normal',
        resetsAt: '2026-07-18T09:59:59.534Z',
      },
      {
        key: 'weekly_scoped:Fable',
        label: 'Weekly (Fable)',
        percent: 7,
        severity: 'normal',
        resetsAt: '2026-07-18T09:59:59.534Z',
      },
    ]);
  });

  it('falls back to five_hour and seven_day utilization when limits are absent', () => {
    const rows = parseClaudeUsage({
      five_hour: { utilization: 33.2, resets_at: '2026-07-12T14:19:59Z' },
      seven_day: { utilization: 44.8, resets_at: '2026-07-18T09:59:59Z' },
    });

    expect(rows).toEqual([
      {
        key: 'session',
        label: 'Session (5h)',
        percent: 33,
        severity: 'normal',
        resetsAt: '2026-07-12T14:19:59.000Z',
      },
      {
        key: 'weekly_all',
        label: 'Weekly (all)',
        percent: 45,
        severity: 'normal',
        resetsAt: '2026-07-18T09:59:59.000Z',
      },
    ]);
  });

  it('ignores unknown limit kinds', () => {
    const rows = parseClaudeUsage({
      limits: [
        { kind: 'mystery', percent: 100, severity: 'normal', resets_at: '2026-07-12T00:00:00Z' },
        { kind: 'session', percent: 10, severity: 'normal', resets_at: '2026-07-12T00:00:00Z' },
      ],
    });

    expect(rows?.map(row => row.key)).toEqual(['session']);
  });

  it('clamps percent values to the display range', () => {
    const rows = parseClaudeUsage({
      limits: [
        { kind: 'session', percent: -5, severity: 'normal', resets_at: '2026-07-12T00:00:00Z' },
        { kind: 'weekly_all', percent: 120, severity: 'normal', resets_at: '2026-07-12T00:00:00Z' },
      ],
    });

    expect(rows?.map(row => row.percent)).toEqual([0, 100]);
  });

  it('uses the stricter severity from response and percent thresholds', () => {
    const rows = parseClaudeUsage({
      limits: [
        { kind: 'session', percent: 50, severity: 'limited', resets_at: '2026-07-12T00:00:00Z' },
        { kind: 'weekly_all', percent: 80, severity: 'normal', resets_at: '2026-07-12T00:00:00Z' },
        { kind: 'weekly_scoped', percent: 95, severity: 'normal', resets_at: '2026-07-12T00:00:00Z' },
      ],
    });

    expect(rows?.map(row => row.severity)).toEqual(['warn', 'warn', 'critical']);
  });

  it('returns null for invalid structures with no usable usage data', () => {
    expect(parseClaudeUsage(null)).toBeNull();
    expect(parseClaudeUsage({})).toBeNull();
    expect(parseClaudeUsage({ limits: [{ kind: 'mystery' }] })).toBeNull();
  });

  // モデル名はレスポンスの scope.model.display_name 由来であり、ラベルに焼き込まない。
  // 既定モデルが変われば次回取得でラベルも追随する。
  it('derives the scoped label from the response model name, whatever it is', () => {
    const rows = parseClaudeUsage({
      limits: [
        {
          kind: 'weekly_scoped',
          percent: 12,
          severity: 'normal',
          resets_at: '2026-07-18T09:59:59Z',
          scope: { model: { display_name: 'Opus 4.8' } },
        },
        {
          kind: 'weekly_scoped',
          percent: 3,
          severity: 'normal',
          resets_at: '2026-07-18T09:59:59Z',
          scope: { model: { display_name: 'Haiku 4.5' } },
        },
      ],
    });

    expect(rows?.map(row => row.label)).toEqual(['Weekly (Opus 4.8)', 'Weekly (Haiku 4.5)']);
    expect(rows?.map(row => row.key)).toEqual(['weekly_scoped:Opus 4.8', 'weekly_scoped:Haiku 4.5']);
  });

  // kind が改名・新種追加された将来を想定する。limits を 1 行も解釈できなくても、
  // five_hour / seven_day が生きているなら Usage を消さずに劣化表示で残す。
  it('falls back to five_hour / seven_day when no limits entry is recognized', () => {
    const rows = parseClaudeUsage({
      limits: [{ kind: 'mystery' }],
      five_hour: { utilization: 33, resets_at: '2026-07-12T14:19:59Z' },
      seven_day: { utilization: 12, resets_at: '2026-07-18T09:59:59Z' },
    });

    expect(rows?.map(row => row.label)).toEqual(['Session (5h)', 'Weekly (all)']);
    expect(rows?.map(row => row.percent)).toEqual([33, 12]);
  });

  // 未知 kind は表示から落とすが、黙って捨てると新しい枠の追加に気づけない。
  // 呼び出し側がログに出せるよう、落とした kind をデータとして返す。
  it('collects unknown limit kinds so the caller can surface them', () => {
    const unknown = collectUnknownLimitKinds({
      limits: [
        { kind: 'session', percent: 10 },
        { kind: 'monthly', percent: 40 },
        { kind: 'weekly_scoped', percent: 5, scope: { model: { display_name: 'Fable' } } },
        { kind: 'monthly', percent: 41 },
      ],
    });

    expect(unknown).toEqual(['monthly']);
  });

  it('returns no unknown kinds for a fully recognized or absent limits array', () => {
    expect(collectUnknownLimitKinds({
      limits: [{ kind: 'session', percent: 10 }, { kind: 'weekly_all', percent: 20 }],
    })).toEqual([]);
    expect(collectUnknownLimitKinds({ five_hour: { utilization: 33 } })).toEqual([]);
    expect(collectUnknownLimitKinds(null)).toEqual([]);
  });

  it('sets resetsAt to null for invalid timestamps', () => {
    const rows = parseClaudeUsage({
      limits: [
        { kind: 'session', percent: 10, severity: 'normal', resets_at: 'not-a-date' },
      ],
    });

    expect(rows?.[0]?.resetsAt).toBeNull();
  });
});
