const { authorize, assertFitsContext } = require('./ollama-delegate.cjs');

const profile = {
  verified: true,
  endpoint: 'http://localhost:11434',
  models: [
    {
      name: 'qwen2.5:7b',
      maxUsableCtx: 16384,
      eligibility: [
        { taskId: 'summarize-long', verdict: 'allow', reason: '実証テスト合格' },
        { taskId: 'agentic-multi-tool', verdict: 'conditional', reason: 'ベンチ下限割れ: toolF1=0.753 < 0.95' },
        { taskId: 'embedding', verdict: 'deny', reason: "capability 'embedding' を持たない" },
      ],
    },
    {
      name: 'qwen3:8b',
      maxUsableCtx: 8192,
      eligibility: [{ taskId: 'summarize-long', verdict: 'conditional', reason: 'ベンチ下限割れ' }],
    },
  ],
};

describe('authorize', () => {
  it('allow のタスクは通し、allow を持つモデルを選ぶ', () => {
    const { model, entry } = authorize(profile, 'summarize-long', undefined, false);

    expect(model.name).toBe('qwen2.5:7b');
    expect(entry.verdict).toBe('allow');
  });

  it('deny のタスクは実行前に拒否する（ollama へ送らない）', () => {
    expect(() => authorize(profile, 'embedding', 'qwen2.5:7b', false)).toThrow(/委譲できません/);
  });

  it('conditional は既定で拒否する', () => {
    expect(() => authorize(profile, 'agentic-multi-tool', 'qwen2.5:7b', false)).toThrow(
      /conditional/,
    );
  });

  it('conditional は --allow-conditional があれば通す', () => {
    const { entry } = authorize(profile, 'agentic-multi-tool', 'qwen2.5:7b', true);
    expect(entry.verdict).toBe('conditional');
  });

  it('どのモデルでも実行できないタスクは、委譲対象外として拒否する', () => {
    expect(() => authorize(profile, 'code-implementation', undefined, false)).toThrow(
      /Claude \/ Codex で実施/,
    );
  });

  it('未知のタスク ID は拒否する', () => {
    expect(() => authorize(profile, 'nonexistent-task', 'qwen2.5:7b', false)).toThrow(/未知のタスク/);
  });
});

describe('assertFitsContext', () => {
  it('num_ctx に収まる入力は通す', () => {
    expect(() => assertFitsContext('a'.repeat(1000), 8192)).not.toThrow();
  });

  it('num_ctx を超える入力は実行前に止める（ollama は黙って切り詰めるため）', () => {
    // 既定 num_ctx=4096 に対し、10 万字（推定 45,455 tok）は明らかに超過する。
    expect(() => assertFitsContext('あ'.repeat(100000), 4096)).toThrow(/収まりません/);
  });

  it('エラーメッセージに推定トークン数と上限を含める', () => {
    expect(() => assertFitsContext('あ'.repeat(100000), 4096)).toThrow(/推定 \d+ tok > 上限 \d+ tok/);
  });

  it('出力と system の余白 512 tok を差し引いた予算で判定する', () => {
    // num_ctx=1024 → 予算 512 tok → 上限 1126 字（512 * 2.2）。
    expect(() => assertFitsContext('あ'.repeat(1100), 1024)).not.toThrow();
    expect(() => assertFitsContext('あ'.repeat(1200), 1024)).toThrow();
  });
});
