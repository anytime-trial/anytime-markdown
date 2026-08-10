import { partitionByTargetExistence } from '../../src/drift/targetExistence';
import type { DriftEventInput } from '../../src/drift/report';
import type { CaravanLogger } from '../../src/logger';

const silentLogger: CaravanLogger = { info: () => {}, error: () => {} };

function makeCandidate(overrides: Partial<DriftEventInput> = {}): DriftEventInput {
  return {
    subject_entity_id: 'file:packages/foo/src/a.ts',
    predicate: 'review_finding:logic',
    conversation_value: null,
    spec_value: null,
    code_value: null,
    drift_type: 'recurring_review_finding',
    severity: 'warn',
    workspace: 'anytime-markdown',
    detail: { file_path: 'packages/foo/src/a.ts', category: 'logic', cnt: 2 },
    ...overrides,
  };
}

const resolveRoot = (ws: string) => (ws === 'anytime-markdown' ? '/repo' : null);

describe('partitionByTargetExistence', () => {
  it('ルート解決可・ファイル実在 → kept', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate()],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: (p) => p === '/repo/packages/foo/src/a.ts',
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.missingTarget).toHaveLength(0);
  });

  it('ルート解決可・ファイル消滅 → missingTarget', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate()],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(0);
    expect(result.missingTarget).toHaveLength(1);
  });

  it('ワークスペースのルートが解決できない → fail-open で kept', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate({ workspace: 'anytime-trade' })],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.missingTarget).toHaveLength(0);
  });

  it('workspace 空文字 → fail-open で kept', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate({ workspace: '' })],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(1);
  });

  it('file path を持たない候補 → fail-open で kept', () => {
    const result = partitionByTargetExistence({
      candidates: [
        makeCandidate({ detail: { finding_id: 'x', target_file_path: null } }),
        makeCandidate({ detail: {} }),
      ],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(2);
    expect(result.missingTarget).toHaveLength(0);
  });

  it('detail.target_file_path（review_unfixed 系）も実在チェック対象', () => {
    const result = partitionByTargetExistence({
      candidates: [
        makeCandidate({
          drift_type: 'review_unfixed',
          predicate: 'review_finding',
          detail: { finding_id: 'f1', target_file_path: 'packages/gone.ts' },
        }),
      ],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.missingTarget).toHaveLength(1);
  });

  it('絶対パスの file_path はルートを連結せずそのまま判定する', () => {
    const seen: string[] = [];
    partitionByTargetExistence({
      candidates: [makeCandidate({ detail: { file_path: '/abs/b.ts' } })],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: (p) => {
        seen.push(p);
        return true;
      },
      logger: silentLogger,
    });
    expect(seen).toEqual(['/abs/b.ts']);
  });

  it('fileExists が throw したら fail-open で kept しエラーログを残す', () => {
    const errors: string[] = [];
    const logger: CaravanLogger = { info: () => {}, error: (m) => errors.push(m) };
    const result = partitionByTargetExistence({
      candidates: [makeCandidate()],
      resolveWorkspaceRoot: resolveRoot,
      fileExists: () => {
        throw new Error('EACCES');
      },
      logger,
    });
    expect(result.kept).toHaveLength(1);
    expect(errors.length).toBeGreaterThan(0);
  });
});
