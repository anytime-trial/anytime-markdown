const { authorize, assertFitsContext, resolveNumCtx } = require('./ollama-delegate.cjs');

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
    const { model, entry } = authorize({ profile, taskId: 'summarize-long' });

    expect(model.name).toBe('qwen2.5:7b');
    expect(entry.verdict).toBe('allow');
  });

  it('deny のタスクは実行前に拒否する（ollama へ送らない）', () => {
    expect(() => authorize({ profile, taskId: 'embedding', explicitModel: 'qwen2.5:7b' })).toThrow(/委譲できません/);
  });

  it('conditional は既定で拒否する', () => {
    expect(() => authorize({ profile, taskId: 'agentic-multi-tool', explicitModel: 'qwen2.5:7b' })).toThrow(
      /conditional/,
    );
  });

  it('conditional は --allow-conditional があれば通す', () => {
    const { entry } = authorize({ profile, taskId: 'agentic-multi-tool', explicitModel: 'qwen2.5:7b', allowConditional: true });
    expect(entry.verdict).toBe('conditional');
  });

  it('どのモデルでも実行できないタスクは、委譲対象外として拒否する', () => {
    expect(() => authorize({ profile, taskId: 'code-implementation' })).toThrow(
      /Claude \/ Codex で実施/,
    );
  });

  it('未知のタスク ID は拒否する', () => {
    expect(() => authorize({ profile, taskId: 'nonexistent-task', explicitModel: 'qwen2.5:7b' })).toThrow(/未知のタスク/);
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
    // num_ctx=1024 → 予算 512 tok。日本語は 1 文字 1 tok として数えるので 512 字が上限。
    expect(() => assertFitsContext('あ'.repeat(510), 1024)).not.toThrow();
    expect(() => assertFitsContext('あ'.repeat(520), 1024)).toThrow();
  });

  it('日本語を 1 文字 1 トークンとして数える（少なく見積もって切り詰めを見逃さない）', () => {
    // 文字数 / 2.2 で見積もっていた頃は、日本語 1000 字を 455 tok と過小評価し、
    // 実際には 1000 tok 前後あるため num_ctx を超えて黙って切り詰められていた。
    expect(() => assertFitsContext('あ'.repeat(1000), 1024)).toThrow(/推定 1000 tok/);
  });

  it('ASCII は 4 文字 1 トークンとして数える（過剰に弾かない）', () => {
    // 英文 2000 字 ≈ 500 tok。num_ctx=2048（予算 1536）には収まる。
    expect(() => assertFitsContext('a'.repeat(2000), 2048)).not.toThrow();
  });

  it('埋め込みタスクの入力も同じ検査にかけられる（ガードから漏らさない）', () => {
    // embedding 経路が assertFitsContext を通らないと、切り詰められた文書の埋め込みが
    // 静かに下流へ流れる。切り詰めは例外にならないので実行時には気づけない。
    const longDoc = 'あ'.repeat(100000);
    expect(() => assertFitsContext(longDoc, 8192)).toThrow(/収まりません/);
  });
});

describe('resolveNumCtx', () => {
  const model = { name: 'qwen2.5:7b', maxUsableCtx: 16384 };

  it('明示指定を最優先する', () => {
    expect(resolveNumCtx({ 'num-ctx': '32768' }, model)).toBe(32768);
  });

  it('指定が無ければプロファイルの実測上限を使う（100% GPU を維持できる範囲）', () => {
    expect(resolveNumCtx({}, model)).toBe(16384);
  });

  it('実測上限も無ければ ollama 既定の 4096 に落とす', () => {
    expect(resolveNumCtx({}, { name: 'unmeasured:1b' })).toBe(4096);
  });
});
