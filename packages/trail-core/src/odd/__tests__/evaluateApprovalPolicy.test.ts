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
    const result = evaluateApprovalPolicy(resolved(), request({ operationKind: 'remote_push' }));
    expect(result).toEqual({
      verdict: 'confirm',
      reasons: ['policy_unspecified'],
      declaredVerdict: null,
      source: 'registry',
    });
  });

  it('deny 指定は deny を返す', () => {
    const result = evaluateApprovalPolicy(
      resolved(),
      request({ operationKind: 'persistent_data_write' }),
    );
    expect(result.verdict).toBe('deny');
    expect(result.reasons).toEqual(['policy_deny']);
  });

  it('deny 指定が上位規則で confirm に上書きされても declaredVerdict に残る', () => {
    const result = evaluateApprovalPolicy(
      resolved(),
      request({ operationKind: 'persistent_data_write', targetPaths: ['/etc/hosts'] }),
    );
    expect(result.verdict).toBe('confirm');
    expect(result.reasons).toEqual(['odd_out']);
    expect(result.declaredVerdict).toBe('deny');
  });

  describe('動的 ODD 縮小', () => {
    it.each(['remote_push', 'production_release', 'dependency_change'] as const)(
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

    it('release_freeze は code_change を落とさない', () => {
      const result = evaluateApprovalPolicy(resolved({ narrowing: 'release_freeze' }), request());
      expect(result.verdict).toBe('allow');
    });

    it('incident はすべての種別を confirm へ落とす', () => {
      const result = evaluateApprovalPolicy(resolved({ narrowing: 'incident' }), request());
      expect(result.verdict).toBe('confirm');
      expect(result.reasons).toEqual(['narrowed_incident']);
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
