/**
 * lib/githubAuth.ts の OAuth スコープのリグレッションテスト。
 *
 * private リポジトリの一覧取得（`GET /user/repos`）と本文取得（`GET /repos/.../contents`）には
 * `repo` スコープが要る。`public_repo` へ戻すと、サインインは成功するのに private リポジトリが
 * 一覧に出ない（エラーにならず静かに消える）ため、設定値そのものを固定する。
 *
 * NextAuth のプロバイダ設定は jest の moduleNameMapper が `next-auth/*` を静的モックへ差し替える
 * ため呼び出しを捕捉できない。そこでスコープを名前付き定数として公開し、それを検証する。
 */
import { GITHUB_OAUTH_SCOPE } from "../lib/githubOAuthScope";

describe("GitHub OAuth スコープ", () => {
  it("private リポジトリを扱えるよう repo スコープを要求する", () => {
    expect(GITHUB_OAUTH_SCOPE).toBe("repo");
  });

  it("public_repo では private リポジトリが一覧に出ないため使わない", () => {
    expect(GITHUB_OAUTH_SCOPE).not.toBe("public_repo");
  });
});
