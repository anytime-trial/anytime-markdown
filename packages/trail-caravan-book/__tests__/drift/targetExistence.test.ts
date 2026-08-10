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
    detail: {
      file_path: 'packages/foo/src/a.ts',
      category: 'logic',
      cnt: 2,
      target_repo: 'anytime-markdown',
    },
    ...overrides,
  };
}

const resolveRepoRoot = (repo: string) => (repo === 'anytime-markdown' ? '/repo' : null);

describe('partitionByTargetExistence', () => {
  it('target_repo のルート解決可・ファイル実在 → kept', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate()],
      resolveRepoRoot,
      fileExists: (p) => p === '/repo/packages/foo/src/a.ts',
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.missingTarget).toHaveLength(0);
  });

  it('target_repo のルート解決可・ファイル消滅 → missingTarget', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate()],
      resolveRepoRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(0);
    expect(result.missingTarget).toHaveLength(1);
  });

  it('target_repo のルートが解決できない（別リポジトリ）→ fail-open で kept', () => {
    const result = partitionByTargetExistence({
      candidates: [makeCandidate({ detail: { file_path: 'a.md', target_repo: 'anytime-markdown-docs' } })],
      resolveRepoRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(1);
    expect(result.missingTarget).toHaveLength(0);
  });

  it('target_repo が null / 欠落 → workspace が一致していても fail-open で kept', () => {
    // workspace は「レビューが行われたリポジトリ」であり対象の所在ではない。
    // target_repo 未解決時に workspace へフォールバックすると、docs リポジトリの
    // レビューが code リポジトリを指摘するケースで誤って「消滅」判定になる。
    const result = partitionByTargetExistence({
      candidates: [
        makeCandidate({ detail: { file_path: 'packages/foo/src/a.ts', target_repo: null } }),
        makeCandidate({ detail: { file_path: 'packages/foo/src/a.ts' } }),
      ],
      resolveRepoRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.kept).toHaveLength(2);
    expect(result.missingTarget).toHaveLength(0);
  });

  it('file path を持たない候補 → fail-open で kept', () => {
    const result = partitionByTargetExistence({
      candidates: [
        makeCandidate({ detail: { finding_id: 'x', target_file_path: null, target_repo: 'anytime-markdown' } }),
        makeCandidate({ detail: {} }),
      ],
      resolveRepoRoot,
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
          detail: { finding_id: 'f1', target_file_path: 'packages/gone.ts', target_repo: 'anytime-markdown' },
        }),
      ],
      resolveRepoRoot,
      fileExists: () => false,
      logger: silentLogger,
    });
    expect(result.missingTarget).toHaveLength(1);
  });

  it('絶対パスの file_path はルートを連結せずそのまま判定する', () => {
    const seen: string[] = [];
    partitionByTargetExistence({
      candidates: [makeCandidate({ detail: { file_path: '/abs/b.ts', target_repo: 'anytime-markdown' } })],
      resolveRepoRoot,
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
      resolveRepoRoot,
      fileExists: () => {
        throw new Error('EACCES');
      },
      logger,
    });
    expect(result.kept).toHaveLength(1);
    expect(errors.length).toBeGreaterThan(0);
  });
});
