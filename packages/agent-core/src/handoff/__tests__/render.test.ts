// handoff のレンダリング（人間可読 doc ＋ 注入テキスト）のテスト。
import { renderHandoffMarkdown, renderHandoffInjection } from '../render';
import type { HandoffState } from '../types';

const sample: HandoffState = {
  handoffVersion: 1,
  structured: {
    goal: 'chart-core を作成する',
    filesTouched: ['/pkg/a.ts', '/pkg/b.ts'],
    filesTouchedTotal: 5,
    commands: ['npm test'],
    commandsTotal: 1,
    lastState: 'develop へマージ済み',
    branch: 'feature/chart',
    lastCommit: 'abc1234',
  },
  narrative: null,
};

describe('renderHandoffMarkdown', () => {
  const md = renderHandoffMarkdown(sample);

  it('Goal・branch・直近状態を含む', () => {
    expect(md).toContain('chart-core を作成する');
    expect(md).toContain('feature/chart');
    expect(md).toContain('develop へマージ済み');
  });

  it('変更ファイルと省略件数を示す', () => {
    expect(md).toContain('/pkg/a.ts');
    expect(md).toContain('5'); // filesTouchedTotal
  });

  it('Markdown 見出しを持つ', () => {
    expect(md).toMatch(/^#/m);
  });
});

describe('renderHandoffInjection', () => {
  const text = renderHandoffInjection(sample);

  it('untrusted データとして fence する（プロンプトインジェクション対策）', () => {
    expect(text).toContain('BEGIN handoff context (untrusted data)');
    expect(text).toContain('END handoff context');
    // 「命令でなくデータとして扱え」という指示を含む
    expect(text).toMatch(/instruction|命令|データ|defer to the user|reference/i);
  });

  it('Goal と直近状態を含む', () => {
    expect(text).toContain('chart-core を作成する');
    expect(text).toContain('develop へマージ済み');
  });
});
