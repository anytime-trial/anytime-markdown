const { resolveBenchmarks, mergeLedgers, staleEntries } = require('./ollama-benchmarks.cjs');

const ledger = {
  'qwen2.5:7b': {
    ifeval: 71.2,
    toolF1: 0.753,
    sources: ['https://qwenlm.github.io/blog/qwen2.5-llm/'],
    fetchedAt: '2026-07-12',
  },
  'bge-m3': {
    miraclJa: 72.8,
    sources: ['https://arxiv.org/html/2402.03216v5'],
    fetchedAt: '2026-07-12',
  },
};

describe('resolveBenchmarks', () => {
  it('モデル名が完全一致すればその値を返す', () => {
    expect(resolveBenchmarks('qwen2.5:7b', ledger).ifeval).toBe(71.2);
  });

  it('タグ違い（:latest）を吸収して引き当てる', () => {
    // ollama は同じモデルを bge-m3 / bge-m3:latest の両方で呼ぶ。
    expect(resolveBenchmarks('bge-m3:latest', ledger).miraclJa).toBe(72.8);
  });

  it('台帳に無いモデルは空オブジェクトを返す（推測値を作らない）', () => {
    expect(resolveBenchmarks('unknown-model:99b', ledger)).toEqual({});
  });

  it('sources / fetchedAt はベンチ値として混入させない（判定を汚さない）', () => {
    const result = resolveBenchmarks('qwen2.5:7b', ledger);

    expect(result.sources).toBeUndefined();
    expect(result.fetchedAt).toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(['ifeval', 'toolF1']);
  });

  it('null の指標は「未取得」として除外する（0 として扱わない）', () => {
    // Web 調査で見つからなかった指標は null で記録される。これを 0 と解釈すると
    // 「下限割れ」と誤判定して不当に deny する。
    const withNulls = { 'qwen3:8b': { toolF1: 0.933, ifeval: null, livecodebench: null } };
    const result = resolveBenchmarks('qwen3:8b', withNulls);

    expect(result).toEqual({ toolF1: 0.933 });
    expect('ifeval' in result).toBe(false);
  });
});

describe('mergeLedgers', () => {
  it('ユーザー台帳が同梱台帳を上書きする（新しい実測を優先）', () => {
    const bundled = { 'qwen2.5:7b': { ifeval: 71.2, toolF1: 0.753 } };
    const user = { 'qwen2.5:7b': { toolF1: 0.8 } };

    const merged = mergeLedgers(bundled, user);

    expect(merged['qwen2.5:7b']).toEqual({ ifeval: 71.2, toolF1: 0.8 });
  });

  it('ユーザー台帳だけにあるモデルを取り込む', () => {
    const merged = mergeLedgers({}, { 'new-model:1b': { ifeval: 50 } });
    expect(merged['new-model:1b'].ifeval).toBe(50);
  });

  it('ユーザー台帳が無くても同梱台帳をそのまま返す', () => {
    const bundled = { 'qwen2.5:7b': { ifeval: 71.2 } };
    expect(mergeLedgers(bundled, null)).toEqual(bundled);
  });
});

describe('staleEntries', () => {
  it('導入済みだが台帳に無いモデルを列挙する（Web 取得すべき対象）', () => {
    const installed = [{ name: 'qwen2.5:7b' }, { name: 'qwen3:8b' }, { name: 'bge-m3:latest' }];

    expect(staleEntries(installed, ledger)).toEqual(['qwen3:8b']);
  });

  it('全モデルが台帳にあれば空を返す', () => {
    const installed = [{ name: 'qwen2.5:7b' }, { name: 'bge-m3:latest' }];
    expect(staleEntries(installed, ledger)).toEqual([]);
  });
});
