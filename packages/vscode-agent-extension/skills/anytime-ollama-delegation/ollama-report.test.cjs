const { renderReport, diffEligibility } = require('./ollama-report.cjs');

const profile = {
  generatedAt: '2026-07-12T04:30:00.000Z',
  endpoint: 'http://host.docker.internal:11434',
  usableVramGb: 6.03,
  vramBounded: true,
  verified: true,
  models: [
    {
      name: 'qwen2.5:7b',
      parameterSize: '7.6B',
      quantization: 'Q4_K_M',
      capabilities: ['completion', 'tools'],
      declaredCtx: 32768,
      maxUsableCtx: 16384,
      benchmarks: { ifeval: 71.2, toolF1: 0.753 },
      verify: {
        'summarize-ja': { passed: true, detail: '3/3 合格' },
        'json-strict': { passed: true, detail: '5/5 成功' },
      },
      eligibility: [
        { taskId: 'summarize-long', label: '長文要約（> 4K tok）', verdict: 'allow', reason: '実証テスト合格' },
        { taskId: 'agentic-multi-tool', label: '多段 agentic ループ', verdict: 'conditional', reason: 'ベンチ下限割れ: toolF1=0.753 < 0.95' },
        { taskId: 'embedding', label: '埋め込み生成', verdict: 'deny', reason: "capability 'embedding' を持たない" },
      ],
    },
  ],
};

describe('renderReport', () => {
  it('anytime-doc-authoring 準拠のフロントマターを持つ（type: report）', () => {
    const md = renderReport(profile);

    expect(md).toMatch(/^---\n/);
    expect(md).toContain('type: "report"');
    expect(md).toContain('lang: "ja"');
    expect(md).toContain('date: "2026-07-12"');
    expect(md).toContain('excerpt:');
  });

  it('実効 VRAM を「総量ではなく実行時の空き」と明記して載せる', () => {
    const md = renderReport(profile);

    expect(md).toContain('6.03');
    expect(md).toMatch(/実行時の空き|実効/);
  });

  it('モデルごとの実証テスト結果を pass/fail 表で出す', () => {
    const md = renderReport(profile);

    expect(md).toContain('qwen2.5:7b');
    expect(md).toContain('summarize-ja');
    expect(md).toContain('3/3 合格');
  });

  it('委譲可否を verdict 別に並べ、deny の理由を残す', () => {
    const md = renderReport(profile);

    expect(md).toContain('長文要約');
    expect(md).toContain("capability 'embedding' を持たない");
  });

  it('未検証プロファイルは警告を本文に含める', () => {
    const md = renderReport({ ...profile, verified: false });

    expect(md).toMatch(/未検証/);
  });

  it('ベンチ値が未取得のモデルは、Web 取得が必要である旨を書く', () => {
    const md = renderReport({
      ...profile,
      models: [{ ...profile.models[0], benchmarks: {} }],
    });

    expect(md).toMatch(/ベンチ値未取得|Web/);
  });
});

describe('diffEligibility', () => {
  const before = [
    { taskId: 'toolcall-single', verdict: 'conditional' },
    { taskId: 'summarize-long', verdict: 'allow' },
    { taskId: 'agentic-multi-tool', verdict: 'deny' },
  ];

  it('モデル入替で昇格したタスクを検出する', () => {
    const after = [
      { taskId: 'toolcall-single', verdict: 'allow' },
      { taskId: 'summarize-long', verdict: 'allow' },
      { taskId: 'agentic-multi-tool', verdict: 'deny' },
    ];
    const diff = diffEligibility(before, after);

    expect(diff.promoted).toEqual([
      { taskId: 'toolcall-single', from: 'conditional', to: 'allow' },
    ]);
    expect(diff.demoted).toEqual([]);
  });

  it('降格したタスクを検出する（新モデルで失われた能力）', () => {
    const after = [
      { taskId: 'toolcall-single', verdict: 'conditional' },
      { taskId: 'summarize-long', verdict: 'deny' },
      { taskId: 'agentic-multi-tool', verdict: 'deny' },
    ];
    const diff = diffEligibility(before, after);

    expect(diff.demoted).toEqual([{ taskId: 'summarize-long', from: 'allow', to: 'deny' }]);
    expect(diff.promoted).toEqual([]);
  });

  it('前回が無ければ全件を新規として扱う', () => {
    const diff = diffEligibility(null, before);

    expect(diff.promoted).toEqual([]);
    expect(diff.demoted).toEqual([]);
    expect(diff.isFirstRun).toBe(true);
  });

  it('モデルが違えば同じ taskId でも別エントリとして比較する', () => {
    // 全モデルの eligibility を平坦化して taskId だけで突き合わせると、モデル A の
    // 判定をモデル B の前回値と比較してしまい、ありもしない昇格/降格が量産される。
    const prev = [
      { modelName: 'qwen2.5:7b', taskId: 'summarize-short', verdict: 'allow' },
      { modelName: 'bge-m3:latest', taskId: 'summarize-short', verdict: 'deny' },
    ];
    const curr = [
      { modelName: 'qwen2.5:7b', taskId: 'summarize-short', verdict: 'allow' },
      { modelName: 'bge-m3:latest', taskId: 'summarize-short', verdict: 'deny' },
    ];

    const diff = diffEligibility(prev, curr);

    expect(diff.promoted).toEqual([]);
    expect(diff.demoted).toEqual([]);
  });

  it('変化したモデルだけを、モデル名付きで報告する', () => {
    const prev = [
      { modelName: 'qwen2.5:7b', taskId: 'toolcall-single', verdict: 'conditional' },
      { modelName: 'qwen3:8b', taskId: 'toolcall-single', verdict: 'conditional' },
    ];
    const curr = [
      { modelName: 'qwen2.5:7b', taskId: 'toolcall-single', verdict: 'conditional' },
      { modelName: 'qwen3:8b', taskId: 'toolcall-single', verdict: 'allow' },
    ];

    const diff = diffEligibility(prev, curr);

    expect(diff.promoted).toEqual([
      { modelName: 'qwen3:8b', taskId: 'toolcall-single', from: 'conditional', to: 'allow' },
    ]);
  });
});

describe('renderReport のデルタ表示', () => {
  it('同じタスクをモデルごとに 1 回だけ報告する（重複させない）', () => {
    const prev = {
      ...profile,
      models: [
        { ...profile.models[0], eligibility: [{ taskId: 'embedding', label: '埋め込み生成', verdict: 'deny', reason: 'x' }] },
        { name: 'bge-m3:latest', capabilities: ['embedding'], eligibility: [{ taskId: 'embedding', label: '埋め込み生成', verdict: 'deny', reason: 'x' }] },
      ],
    };
    const curr = {
      ...profile,
      models: [
        { ...profile.models[0], eligibility: [{ taskId: 'embedding', label: '埋め込み生成', verdict: 'deny', reason: 'x' }] },
        { name: 'bge-m3:latest', capabilities: ['embedding'], eligibility: [{ taskId: 'embedding', label: '埋め込み生成', verdict: 'allow', reason: 'y' }] },
      ],
    };

    const md = renderReport(curr, prev);
    const promotionLines = md.split('\n').filter((l) => l.includes('昇格'));

    expect(promotionLines).toHaveLength(1);
    expect(promotionLines[0]).toContain('bge-m3:latest');
  });
});
