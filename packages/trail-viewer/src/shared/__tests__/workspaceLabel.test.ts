/**
 * workspaceLabel — 一覧の「ワークスペース」列の表示判定。
 *
 * null / undefined まで見るのは、行データの型が `workspace: string` でも、`CaravanReader` が
 * 応答を検証せず `as` で被せているため。列を落としたサーバー・旧サーバーが相手だと、型に
 * 反して欠けた値が実行時に届く。
 */
import { workspaceLabel, WORKSPACE_UNRESOLVED_LABEL } from '../workspaceLabel';

describe('workspaceLabel', () => {
  it('解決済みのワークスペース名はそのまま返す', () => {
    expect(workspaceLabel('anytime-markdown')).toBe('anytime-markdown');
  });

  it('空文字は未解決としてダッシュにする', () => {
    // 空セルにすると「ワークスペースの概念が無い行」と見分けが付かない。
    expect(workspaceLabel('')).toBe(WORKSPACE_UNRESOLVED_LABEL);
  });

  it('欠けた値（null / undefined）も未解決として扱う', () => {
    expect(workspaceLabel(null)).toBe(WORKSPACE_UNRESOLVED_LABEL);
    expect(workspaceLabel(undefined)).toBe(WORKSPACE_UNRESOLVED_LABEL);
  });

  it('ダッシュは空白や空文字ではない（列が消えたと読めないこと）', () => {
    expect(WORKSPACE_UNRESOLVED_LABEL.trim()).not.toBe('');
  });
});
