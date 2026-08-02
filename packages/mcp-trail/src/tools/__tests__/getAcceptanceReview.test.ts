import BetterSqlite3 from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  GetAcceptanceReviewInputSchema,
  handleGetAcceptanceReview,
} from '../getAcceptanceReview';
import {
  ensureDoctrineJudgmentsTable,
  recordDoctrineJudgmentDirect,
} from '../../sqlite/doctrineJudgments';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

describe('handleGetAcceptanceReview', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'acceptance-review-ws-'));
    const dbDir = path.join(workspace, '.anytime', 'trail', 'db');
    mkdirSync(dbDir, { recursive: true });
    const db = new BetterSqlite3(path.join(dbDir, 'trail.db'));
    ensureDoctrineJudgmentsTable(db);
    recordDoctrineJudgmentDirect(db, {
      sessionId: 'session-1',
      subject: '機能仕様書の What 承認',
      judgment: 'approve',
      coverage: 'covered',
      citations: [
        {
          docPath: '/docs/spec/92.doctrine/conventions.ja.md',
          section: 'ゲート',
          quote: 'fail-open で継続する。',
          resolved: true,
          reason: 'ok',
          approval: 'draft',
        },
      ],
      gate: { verdict: 'escalate', reasons: ['no_canon_citation'] },
    });
    db.close();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('判断・引用・エスカレーション・差分を 1 回の呼び出しで返す', async () => {
    git(workspace, 'init', '-b', 'develop');
    writeFileSync(path.join(workspace, 'base.txt'), 'base\n', 'utf8');
    git(workspace, 'add', 'base.txt');
    git(workspace, 'commit', '-m', 'base');
    git(workspace, 'checkout', '-b', 'feature/x');
    writeFileSync(path.join(workspace, 'added.txt'), 'added\n', 'utf8');
    git(workspace, 'add', 'added.txt');
    git(workspace, 'commit', '-m', 'feat: add');

    const review = await handleGetAcceptanceReview({ session_id: 'session-1', workspacePath: workspace });

    expect(review.summary.judgmentCount).toBe(1);
    expect(review.summary.escalationCount).toBe(1);
    expect(review.summary.draftGroundedCount).toBe(1);
    expect(review.diff.available).toBe(true);
    expect(review.diff.files.map((f) => f.path)).toEqual(['added.txt']);
    expect(review.markdown).toContain('## 受け入れ確認');
  });

  it('include_diff=false では git を実行せず縮退理由を残す', async () => {
    // git リポジトリではないワークスペースでも成功する＝git を呼んでいない
    const review = await handleGetAcceptanceReview({
      session_id: 'session-1',
      include_diff: false,
      workspacePath: workspace,
    });

    expect(review.diff.available).toBe(false);
    expect(review.diff.degradedReason).toContain('include_diff=false');
    expect(review.summary.judgmentCount).toBe(1);
  });

  it('既定の base_ref / head_ref は develop / HEAD', async () => {
    const review = await handleGetAcceptanceReview({
      session_id: 'session-1',
      include_diff: false,
      workspacePath: workspace,
    });

    expect(review.baseRef).toBe('develop');
    expect(review.headRef).toBe('HEAD');
  });

  it('判断が 0 件のセッションでもエラーにならない', async () => {
    const review = await handleGetAcceptanceReview({
      session_id: 'session-none',
      include_diff: false,
      workspacePath: workspace,
    });

    expect(review.judgments).toEqual([]);
    expect(review.markdown).toContain('代行判断なし');
  });

  it('入力スキーマは session_id を必須にする', () => {
    expect(GetAcceptanceReviewInputSchema.safeParse({}).success).toBe(false);
    expect(GetAcceptanceReviewInputSchema.safeParse({ session_id: '' }).success).toBe(false);
    expect(GetAcceptanceReviewInputSchema.safeParse({ session_id: 's' }).success).toBe(true);
  });
});
