import { evaluateCoverageGate, type CoverageGateInput } from '../../doctrine/coverageGate';
import type { OddResolution } from '@anytime-markdown/trail-core';

const ODD: OddResolution = {
  kind: 'derived',
  registry: {
    version: 1,
    roots: ['/anytime-markdown', '/Shared/anytime-markdown-docs'],
    restricted: [
      { kind: 'prefix', value: '/home/user/.claude' },
      { kind: 'prefix', value: '/home/user/.config' },
      { kind: 'pattern', value: '/.github/workflows/' },
      { kind: 'pattern', value: '/.env' },
    ],
    languages: null,
    operations: {},
    narrowing: 'normal',
    godNodePercentile: 5,
  },
};

function input(overrides: Partial<CoverageGateInput> = {}): CoverageGateInput {
  return {
    coverage: 'covered',
    citations: [{ resolved: true, approval: 'canon' }],
    targetPaths: ['/anytime-markdown/packages/mcp-trail/src/server.ts'],
    severity: 'low',
    operationKind: 'code_change',
    odd: ODD,
    ...overrides,
  };
}

describe('evaluateCoverageGate', () => {
  it('ODD 内・低重大度・covered・canon 引用ありは delegable', () => {
    expect(evaluateCoverageGate(input())).toEqual({ verdict: 'delegable', reasons: [] });
  });

  it('operationKind 未指定は operation_kind_unknown で escalate（fail-closed）', () => {
    const result = evaluateCoverageGate(input({ operationKind: undefined }));
    expect(result).toEqual({ verdict: 'escalate', reasons: ['operation_kind_unknown'] });
  });

  it.each([
    'dependency_change',
    'destructive_git',
    'remote_push',
    'production_release',
    'persistent_data_write',
  ] as const)('%s は他の条件を満たしても always_human_operation で escalate', (kind) => {
    // パスに現れない操作種別。targetPaths の判定を通っても代行させない
    const result = evaluateCoverageGate(input({ operationKind: kind }));
    expect(result).toEqual({ verdict: 'escalate', reasons: ['always_human_operation'] });
  });

  it('targetPaths 未指定は odd_unknown で escalate（fail-closed）', () => {
    const result = evaluateCoverageGate(input({ targetPaths: undefined }));
    expect(result).toEqual({ verdict: 'escalate', reasons: ['odd_unknown'] });
  });

  it('targetPaths が空配列でも odd_unknown で escalate', () => {
    expect(evaluateCoverageGate(input({ targetPaths: [] })).reasons).toEqual(['odd_unknown']);
  });

  it('空文字列のパス申告は odd_unknown で escalate（cwd へ解決してすり抜けさせない）', () => {
    expect(evaluateCoverageGate(input({ targetPaths: [''] })).reasons).toEqual(['odd_unknown']);
    expect(
      evaluateCoverageGate(input({ targetPaths: ['/anytime-markdown/a.ts', '  '] })).reasons,
    ).toEqual(['odd_unknown']);
  });

  it('ODD 外のパスを含むと odd_out で escalate', () => {
    const result = evaluateCoverageGate(input({ targetPaths: ['/other-repo/src/index.ts'] }));
    expect(result).toEqual({ verdict: 'escalate', reasons: ['odd_out'] });
  });

  it('制限領域（永続データ領域）は ODD 判定より優先して restricted_area', () => {
    const result = evaluateCoverageGate(input({ targetPaths: ['/home/user/.claude/CLAUDE.md'] }));
    expect(result).toEqual({ verdict: 'escalate', reasons: ['restricted_area'] });
  });

  it('制限領域（CI 定義・シークレット）も restricted_area', () => {
    expect(
      evaluateCoverageGate(input({ targetPaths: ['/anytime-markdown/.github/workflows/ci.yml'] }))
        .reasons,
    ).toEqual(['restricted_area']);
    expect(
      evaluateCoverageGate(input({ targetPaths: ['/anytime-markdown/.env.local'] })).reasons,
    ).toEqual(['restricted_area']);
  });

  it('相対要素（..）は正規化してから判定する（境界のすり抜け防止）', () => {
    const result = evaluateCoverageGate(
      input({ targetPaths: ['/anytime-markdown/packages/../../etc/passwd'] }),
    );
    expect(result).toEqual({ verdict: 'escalate', reasons: ['odd_out'] });
  });

  it('severity 未指定は severity_unknown で escalate（fail-closed）', () => {
    const result = evaluateCoverageGate(input({ severity: undefined }));
    expect(result).toEqual({ verdict: 'escalate', reasons: ['severity_unknown'] });
  });

  it('severity=high は severity_high で escalate', () => {
    expect(evaluateCoverageGate(input({ severity: 'high' })).reasons).toEqual(['severity_high']);
  });

  it('coverage=conflict は doctrine_conflict で escalate（DCT-11）', () => {
    expect(evaluateCoverageGate(input({ coverage: 'conflict' })).reasons).toEqual([
      'doctrine_conflict',
    ]);
  });

  it('coverage=silent は doctrine_silent で escalate（DCT-10）', () => {
    expect(evaluateCoverageGate(input({ coverage: 'silent' })).reasons).toEqual(['doctrine_silent']);
  });

  it('coverage=odd_out は odd_out で escalate（DCT-12）', () => {
    expect(evaluateCoverageGate(input({ coverage: 'odd_out' })).reasons).toEqual(['odd_out']);
  });

  it('covered でも canon 引用が 0 件なら no_canon_citation で escalate（DCT-3 接続）', () => {
    const result = evaluateCoverageGate(
      input({ citations: [{ resolved: true, approval: 'draft' }] }),
    );
    expect(result).toEqual({ verdict: 'escalate', reasons: ['no_canon_citation'] });
  });

  it('明文規約（canon_by_document）の引用は canon 接地として扱う', () => {
    const result = evaluateCoverageGate(
      input({ citations: [{ resolved: true, approval: 'canon_by_document' }] }),
    );
    expect(result.verdict).toBe('delegable');
  });

  it('未解決（幻覚）の canon 引用は canon 接地として数えない', () => {
    const result = evaluateCoverageGate(
      input({ citations: [{ resolved: false, approval: 'canon' }] }),
    );
    expect(result.reasons).toEqual(['no_canon_citation']);
  });

  it('ODD 判定は重大度より先に評価する（規則の順序）', () => {
    const result = evaluateCoverageGate(
      input({ targetPaths: ['/other-repo/a.ts'], severity: 'high' }),
    );
    expect(result.reasons).toEqual(['odd_out']);
  });
});
