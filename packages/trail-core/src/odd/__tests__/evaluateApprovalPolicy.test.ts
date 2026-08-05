import { evaluateApprovalPolicy } from '../evaluateApprovalPolicy';
import type { ApprovalRequest, OddRegistry, OddResolution } from '../types';

function registry(overrides: Partial<OddRegistry> = {}): OddRegistry {
  return {
    version: 1,
    roots: ['/anytime-markdown', '/Shared/anytime-markdown-docs'],
    restricted: [
      { kind: 'prefix', value: '/home/user/.claude' },
      { kind: 'pattern', value: '/package.json' },
    ],
    languages: null,
    operations: { code_change: 'allow', persistent_data_write: 'deny' },
    narrowing: 'normal',
    godNodePercentile: 5,
    ...overrides,
  };
}

function resolved(overrides: Partial<OddRegistry> = {}): OddResolution {
  return { kind: 'registry', registry: registry(overrides) };
}

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    operationKind: 'code_change',
    targetPaths: ['/anytime-markdown/packages/trail-core/src/index.ts'],
    language: null,
    isGodNode: false,
    ...overrides,
  };
}

describe('evaluateApprovalPolicy', () => {
  it('ODD 内・allow 指定・God Node でないなら allow', () => {
    expect(evaluateApprovalPolicy(resolved(), request())).toEqual({
      verdict: 'allow',
      reasons: ['policy_allow'],
      declaredVerdict: 'allow',
      source: 'registry',
    });
  });

  it('レジストリが invalid なら既定へ戻さず confirm（壊れた設定で ODD を広げない）', () => {
    const result = evaluateApprovalPolicy(
      { kind: 'invalid', reason: 'invalid JSON' },
      request(),
    );
    expect(result).toEqual({
      verdict: 'confirm',
      reasons: ['registry_invalid'],
      declaredVerdict: null,
      source: 'invalid',
    });
  });

  it.each([
    ['ODD 外', ['/etc/passwd'], 'odd_out'],
    ['制限領域（前置）', ['/home/user/.claude/settings.json'], 'restricted_area'],
    ['制限領域（断片）', ['/anytime-markdown/package.json'], 'restricted_area'],
    ['申告なし', [], 'odd_unknown'],
    ['空文字列', [''], 'odd_unknown'],
  ])('%s は confirm（理由 %s）', (_label, targetPaths, reason) => {
    const result = evaluateApprovalPolicy(resolved(), request({ targetPaths }));
    expect(result.verdict).toBe('confirm');
    expect(result.reasons).toEqual([reason]);
  });

  it('ODD レジストリ自身は restricted が空でも常に制限領域（承認境界の自己保護）', () => {
    // レジストリを代行で書き換えられると、以降のあらゆる制限を自分で外せる
    const result = evaluateApprovalPolicy(
      resolved({ restricted: [] }),
      request({ targetPaths: ['/anytime-markdown/.anytime/trail/odd.json'] }),
    );
    expect(result.verdict).toBe('confirm');
    expect(result.reasons).toEqual(['restricted_area']);
  });

  it('`..` を含むパスは正規化してから境界を判定する', () => {
    const result = evaluateApprovalPolicy(
      resolved(),
      request({ targetPaths: ['/anytime-markdown/../etc/passwd'] }),
    );
    expect(result.reasons).toEqual(['odd_out']);
  });

  it('languages 指定時に対象外の言語は confirm', () => {
    const result = evaluateApprovalPolicy(
      resolved({ languages: ['typescript'] }),
      request({ language: 'python' }),
    );
    expect(result.reasons).toEqual(['language_out_of_odd']);
  });

  it('languages が空配列なら「許容言語なし」としてすべて confirm', () => {
    const result = evaluateApprovalPolicy(
      resolved({ languages: [] }),
      request({ language: 'typescript' }),
    );
    expect(result.reasons).toEqual(['language_out_of_odd']);
  });

  it('未定義の操作種別は allow ではなく confirm（fail-closed）', () => {
    const result = evaluateApprovalPolicy(
      resolved({ operations: {} }),
      request({ operationKind: 'code_change' }),
    );
    expect(result).toEqual({
      verdict: 'confirm',
      reasons: ['policy_unspecified'],
      declaredVerdict: null,
      source: 'registry',
    });
  });

  it('deny 指定は deny を返す', () => {
    const result = evaluateApprovalPolicy(
      resolved({ operations: { code_change: 'deny' } }),
      request({ operationKind: 'code_change' }),
    );
    expect(result.verdict).toBe('deny');
    expect(result.reasons).toEqual(['policy_deny']);
  });

  it('deny 指定が上位規則で confirm に上書きされても declaredVerdict に残る', () => {
    const result = evaluateApprovalPolicy(
      resolved({ operations: { code_change: 'deny' } }),
      request({ operationKind: 'code_change', targetPaths: ['/etc/hosts'] }),
    );
    expect(result.verdict).toBe('confirm');
    expect(result.reasons).toEqual(['odd_out']);
    expect(result.declaredVerdict).toBe('deny');
  });

  describe('常に人へ聞く操作（ALWAYS_HUMAN_OPERATIONS）', () => {
    it.each([
      'dependency_change',
      'destructive_git',
      'remote_push',
      'production_release',
      'persistent_data_write',
    ] as const)('%s は allow を宣言しても confirm へ倒す', (kind) => {
      // カバレッジゲート（代行可否）と同じ集合を見る。片方にしか無いと、機体が
      // もう片方を信じたときに「常に人へ聞く」規約が機構上バイパスされる
      const result = evaluateApprovalPolicy(
        resolved({ operations: { [kind]: 'allow' } }),
        request({ operationKind: kind }),
      );
      expect(result.verdict).toBe('confirm');
      expect(result.reasons).toEqual(['always_human_operation']);
      expect(result.declaredVerdict).toBe('allow');
    });
  });

  describe('動的 ODD 縮小', () => {
    it.each(['code_change', 'remote_push', 'production_release', 'dependency_change'] as const)(
      'release_freeze は %s を confirm へ落とす',
      (kind) => {
        const result = evaluateApprovalPolicy(
          resolved({ narrowing: 'release_freeze', operations: { [kind]: 'allow' } }),
          request({ operationKind: kind }),
        );
        expect(result.verdict).toBe('confirm');
        expect(result.reasons).toEqual(['narrowed_release_freeze']);
        expect(result.declaredVerdict).toBe('allow');
      },
    );

    it('normal では code_change が宣言どおり allow になる（凍結の対照）', () => {
      const result = evaluateApprovalPolicy(resolved({ narrowing: 'normal' }), request());
      expect(result.verdict).toBe('allow');
    });

    it('incident はすべての種別を confirm へ落とす', () => {
      const result = evaluateApprovalPolicy(resolved({ narrowing: 'incident' }), request());
      expect(result.verdict).toBe('confirm');
      expect(result.reasons).toEqual(['narrowed_incident']);
    });

    it('縮小の理由コードは release_freeze と incident を区別する（監査のため）', () => {
      const freeze = evaluateApprovalPolicy(resolved({ narrowing: 'release_freeze' }), request());
      const incident = evaluateApprovalPolicy(resolved({ narrowing: 'incident' }), request());
      expect(freeze.reasons).not.toEqual(incident.reasons);
    });
  });

  describe('言語の判定', () => {
    it('languages 指定時に言語が未申告なら confirm へ倒す（省略で無効化させない）', () => {
      // 省略可能な入力を省くだけで言語 ODD を無効化できる経路を塞ぐ
      const result = evaluateApprovalPolicy(
        resolved({ languages: [] }),
        request({ language: null }),
      );
      expect(result.verdict).toBe('confirm');
      expect(result.reasons).toEqual(['language_unknown']);
    });

    it('languages が未指定（制限しない）なら言語未申告でも通過する', () => {
      const result = evaluateApprovalPolicy(resolved({ languages: null }), request({ language: null }));
      expect(result.verdict).toBe('allow');
    });
  });

  describe('影響度ベース承認', () => {
    it('God Node への編集は allow 指定でも confirm へ落とす', () => {
      const result = evaluateApprovalPolicy(resolved(), request({ isGodNode: true }));
      expect(result.verdict).toBe('confirm');
      expect(result.reasons).toEqual(['god_node_impact']);
      expect(result.declaredVerdict).toBe('allow');
    });

    it('中心性データが無い（null）ときは抑止せず、理由に impact_unknown を残す', () => {
      // 設定の誤りは自律を止める側へ、データの不在は止めない側へ倒す（非対称は意図的）
      const result = evaluateApprovalPolicy(resolved(), request({ isGodNode: null }));
      expect(result.verdict).toBe('allow');
      expect(result.reasons).toEqual(['policy_allow', 'impact_unknown']);
    });
  });
});
