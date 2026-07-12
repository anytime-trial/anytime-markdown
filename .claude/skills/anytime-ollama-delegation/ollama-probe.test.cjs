const {
  TASK_CRITERIA,
  MODEL_CATALOG,
  classifyTaskEligibility,
  estimateUsableVram,
  needsRevalidation,
  recommendModels,
  selectModelForTask,
  modelSignature,
} = require('./ollama-probe.cjs');

/** completion + tools を持ち、実証テストに全通したモデルのプロファイル断片。 */
function passingChatModel(overrides = {}) {
  return {
    name: 'qwen2.5:7b',
    capabilities: ['completion', 'tools'],
    verify: {
      'json-strict': { passed: true },
      classify: { passed: true },
      'summarize-ja': { passed: true },
      'long-ctx': { passed: true },
      'toolcall-single': { passed: true },
      'toolcall-multi': { passed: true },
    },
    benchmarks: {},
    ...overrides,
  };
}

describe('classifyTaskEligibility', () => {
  it('capability が欠けているタスクは実証テストの結果によらず deny する', () => {
    // embedding capability を持たないチャットモデルに埋め込み生成は投げられない。
    const model = passingChatModel();
    const result = classifyTaskEligibility(model);
    const embed = result.find((r) => r.taskId === 'embedding');

    expect(embed.verdict).toBe('deny');
    expect(embed.reason).toMatch(/capability/);
  });

  it('実証テストが落ちたタスクは deny する（ベンチ値が高くても実測を優先）', () => {
    const model = passingChatModel({
      verify: {
        ...passingChatModel().verify,
        'json-strict': { passed: false, detail: '5 回中 2 回 JSON parse 失敗' },
      },
      benchmarks: { ifeval: 95 },
    });
    const result = classifyTaskEligibility(model);
    const extract = result.find((r) => r.taskId === 'structured-extraction');

    expect(extract.verdict).toBe('deny');
    expect(extract.reason).toContain('json-strict');
  });

  it('実証テストは通ったがベンチ閾値を割る場合は conditional にする', () => {
    // テストは 5 サンプルしか見ていない。ベンチが低いモデルは本番入力で崩れうる。
    const model = passingChatModel({ benchmarks: { ifeval: 40 } });
    const result = classifyTaskEligibility(model);
    const extract = result.find((r) => r.taskId === 'structured-extraction');

    expect(extract.verdict).toBe('conditional');
    expect(extract.reason).toMatch(/ifeval/i);
  });

  it('実証テスト通過かつベンチ閾値クリアなら allow する', () => {
    const model = passingChatModel({ benchmarks: { ifeval: 71.2 } });
    const result = classifyTaskEligibility(model);
    const extract = result.find((r) => r.taskId === 'structured-extraction');

    expect(extract.verdict).toBe('allow');
  });

  it('ベンチ値が未知でも実証テストに通っていれば allow する（実測を根拠にする）', () => {
    const model = passingChatModel({ benchmarks: {} });
    const result = classifyTaskEligibility(model);
    const summarize = result.find((r) => r.taskId === 'summarize-short');

    expect(summarize.verdict).toBe('allow');
  });

  it('多段ツール呼び出しは toolF1 が閾値を割ると conditional 止まりになる', () => {
    // qwen2.5:7b の実測 F1 0.753 では 3 段ループの成功率が 0.43 まで落ちる。
    const model = passingChatModel({ benchmarks: { toolF1: 0.753 } });
    const result = classifyTaskEligibility(model);
    const agentic = result.find((r) => r.taskId === 'agentic-multi-tool');

    expect(agentic.verdict).toBe('conditional');
  });

  it('toolF1 が閾値を超えたモデルでは多段ツール呼び出しが allow に昇格する', () => {
    // モデル入替で判定が自動更新されること（本スキルの中核要件）。
    const model = passingChatModel({ name: 'qwen3:14b', benchmarks: { toolF1: 0.971 } });
    const result = classifyTaskEligibility(model);
    const agentic = result.find((r) => r.taskId === 'agentic-multi-tool');

    expect(agentic.verdict).toBe('allow');
  });

  it('コード実装は現行ローカルモデルの水準では deny だが、閾値超えで解禁されうる', () => {
    const weak = passingChatModel({ benchmarks: { livecodebench: 28.7, humaneval: 84.8 } });
    const weakVerdict = classifyTaskEligibility(weak).find((r) => r.taskId === 'code-implementation');
    expect(weakVerdict.verdict).toBe('deny');

    const strong = passingChatModel({
      name: 'future-coder:32b',
      benchmarks: { livecodebench: 65, humaneval: 93 },
    });
    const strongVerdict = classifyTaskEligibility(strong).find(
      (r) => r.taskId === 'code-implementation',
    );
    expect(strongVerdict.verdict).toBe('allow');
  });

  it('実証テストで裏取りできないタスクは、ベンチ未取得なら deny する（判定不能を allow にしない）', () => {
    // code-implementation / code-review は機械採点できず tests: [] のため、ベンチだけが
    // 唯一のガードになる。「ベンチ未知は実測を信じて allow」を適用すると、Web 未取得の
    // 初回 probe で実装委譲が解禁されてしまう。
    const model = passingChatModel({ benchmarks: {} });
    const result = classifyTaskEligibility(model);

    expect(result.find((r) => r.taskId === 'code-implementation').verdict).toBe('deny');
    expect(result.find((r) => r.taskId === 'code-implementation').reason).toMatch(/ベンチ未取得/);
    expect(result.find((r) => r.taskId === 'code-review').verdict).toBe('deny');
  });

  it('必要ベンチが一部でも欠けていれば deny する（部分的な根拠で解禁しない）', () => {
    const model = passingChatModel({ benchmarks: { humaneval: 95 } }); // livecodebench が無い
    const impl = classifyTaskEligibility(model).find((r) => r.taskId === 'code-implementation');

    expect(impl.verdict).toBe('deny');
    expect(impl.reason).toMatch(/livecodebench/);
  });

  it('実証テストがあるタスクは、ベンチ未取得でも実測を根拠に allow する', () => {
    // tests があるものは実走で裏が取れているので、ベンチ欠落を理由に禁じない。
    const model = passingChatModel({ benchmarks: {} });
    const result = classifyTaskEligibility(model);

    expect(result.find((r) => r.taskId === 'structured-extraction').verdict).toBe('allow');
    expect(result.find((r) => r.taskId === 'toolcall-single').verdict).toBe('allow');
  });

  it('長文要約は 100% GPU を維持できる ctx を超えると conditional に落とす（速度劣化の警告）', () => {
    // long-ctx テストは CPU へ溢れても「動けば」PASS する。実測 16K を GPU で回せない
    // モデルに長文を投げると数分の一の速度になるため、allow のままにしない。
    const spilling = passingChatModel({ maxUsableCtx: 4096 });
    const long = classifyTaskEligibility(spilling).find((r) => r.taskId === 'summarize-long');

    expect(long.verdict).toBe('conditional');
    expect(long.reason).toMatch(/GPU/);

    const fits = passingChatModel({ maxUsableCtx: 16384 });
    expect(classifyTaskEligibility(fits).find((r) => r.taskId === 'summarize-long').verdict).toBe(
      'allow',
    );
  });

  it('埋め込みモデルには chat タスクを割り当てない', () => {
    const embedder = {
      name: 'bge-m3:latest',
      capabilities: ['embedding'],
      verify: { embed: { passed: true } },
      benchmarks: { miraclJa: 72.8 },
    };
    const result = classifyTaskEligibility(embedder);

    expect(result.find((r) => r.taskId === 'embedding').verdict).toBe('allow');
    expect(result.find((r) => r.taskId === 'summarize-short').verdict).toBe('deny');
  });

  it('全タスクが TASK_CRITERIA と 1:1 対応する', () => {
    const result = classifyTaskEligibility(passingChatModel());
    expect(result.map((r) => r.taskId).sort()).toEqual(TASK_CRITERIA.map((t) => t.id).sort());
  });
});

describe('estimateUsableVram', () => {
  it('全サンプルが 100% オフロードなら最大サンプルを下限として返す（上限は未確定）', () => {
    const samples = [
      { numCtx: 4096, sizeBytes: 4.75e9, vramBytes: 4.75e9 },
      { numCtx: 8192, sizeBytes: 4.99e9, vramBytes: 4.99e9 },
    ];
    const result = estimateUsableVram(samples);

    expect(result.usableGb).toBeCloseTo(4.99, 1);
    expect(result.bounded).toBe(false); // 上限に到達していない
  });

  it('CPU にはみ出したサンプルが出たらそこを上限として実効 VRAM を確定する', () => {
    // 実測: num_ctx=32768 で 6.82GB 必要 → 6.03GB しか載らず 88%。
    const samples = [
      { numCtx: 16384, sizeBytes: 5.47e9, vramBytes: 5.47e9 },
      { numCtx: 32768, sizeBytes: 6.82e9, vramBytes: 6.03e9 },
    ];
    const result = estimateUsableVram(samples);

    expect(result.usableGb).toBeCloseTo(6.03, 1);
    expect(result.bounded).toBe(true);
  });

  it('サンプルが空なら null を返す（不明を捏造しない）', () => {
    expect(estimateUsableVram([])).toBeNull();
  });
});

describe('recommendModels', () => {
  it('実効 VRAM に収まらないモデルは候補から外す', () => {
    // 6.0GB 環境では qwen3:14b(約 9GB) は載らない。
    const result = recommendModels(6.03, MODEL_CATALOG);

    expect(result.fits.map((m) => m.name)).not.toContain('qwen3:14b');
    expect(result.tooLarge.map((m) => m.name)).toContain('qwen3:14b');
  });

  it('VRAM に収まる中で最もツール呼び出し精度が高いモデルを最優先で薦める', () => {
    const result = recommendModels(6.03, MODEL_CATALOG);

    expect(result.fits[0].name).toBe('qwen3:8b');
  });

  it('VRAM が増えれば推奨が入れ替わる（スペック追従）', () => {
    const result = recommendModels(12, MODEL_CATALOG);

    expect(result.fits[0].name).toBe('qwen3:14b');
  });

  it('VRAM 不明(null)なら推奨を出さず、判断保留を返す', () => {
    const result = recommendModels(null, MODEL_CATALOG);

    expect(result.fits).toEqual([]);
    expect(result.unknown).toBe(true);
  });
});

describe('needsRevalidation', () => {
  const profile = {
    models: [
      { name: 'qwen2.5:7b', digest: 'abc123' },
      { name: 'bge-m3:latest', digest: 'def456' },
    ],
  };

  it('モデル署名が一致していれば再検証不要', () => {
    const current = [
      { name: 'bge-m3:latest', digest: 'def456' },
      { name: 'qwen2.5:7b', digest: 'abc123' },
    ];
    expect(needsRevalidation(profile, current)).toBe(false);
  });

  it('モデルが追加されたら再検証が必要', () => {
    const current = [
      { name: 'qwen2.5:7b', digest: 'abc123' },
      { name: 'bge-m3:latest', digest: 'def456' },
      { name: 'qwen3:8b', digest: 'ghi789' },
    ];
    expect(needsRevalidation(profile, current)).toBe(true);
  });

  it('同名でも digest が変われば再検証が必要（タグ更新の追従）', () => {
    const current = [
      { name: 'qwen2.5:7b', digest: 'CHANGED' },
      { name: 'bge-m3:latest', digest: 'def456' },
    ];
    expect(needsRevalidation(profile, current)).toBe(true);
  });

  it('プロファイルが無ければ再検証が必要', () => {
    expect(needsRevalidation(null, [])).toBe(true);
  });
});

describe('modelSignature', () => {
  it('digest を短縮しモデル名でソートした安定署名を返す', () => {
    const sig = modelSignature([
      { name: 'zeta:1b', digest: '1111111111112222' },
      { name: 'alpha:1b', digest: '3333333333334444' },
    ]);

    expect(sig).toEqual([
      { name: 'alpha:1b', digest: '333333333333' },
      { name: 'zeta:1b', digest: '111111111111' },
    ]);
  });
});

describe('selectModelForTask', () => {
  const profile = {
    models: [
      {
        name: 'qwen2.5:7b',
        eligibility: [
          { taskId: 'summarize-long', verdict: 'allow' },
          { taskId: 'toolcall-single', verdict: 'conditional' },
        ],
        maxUsableCtx: 16384,
      },
      {
        name: 'qwen3:8b',
        eligibility: [
          { taskId: 'summarize-long', verdict: 'conditional' },
          { taskId: 'toolcall-single', verdict: 'allow' },
        ],
        maxUsableCtx: 8192,
      },
    ],
  };

  it('allow のモデルを conditional より優先して選ぶ', () => {
    expect(selectModelForTask('toolcall-single', profile).name).toBe('qwen3:8b');
    expect(selectModelForTask('summarize-long', profile).name).toBe('qwen2.5:7b');
  });

  it('deny しかないタスクは null を返す（呼び出し側が委譲を中止する）', () => {
    expect(selectModelForTask('code-implementation', profile)).toBeNull();
  });
});
