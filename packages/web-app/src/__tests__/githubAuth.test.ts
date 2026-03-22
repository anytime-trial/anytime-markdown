/**
 * githubAuth のユニットテスト
 *
 * authOptions の callbacks を直接テストする。
 * getGitHubToken は next-auth の getServerSession に依存し、
 * moduleNameMapper で __mocks__/next-auth.js にマップされるため、
 * モック内の getServerSession（常に null を返す）を前提にテストする。
 */

jest.mock("next-auth/providers/github", () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: "github", name: "GitHub", type: "oauth" })),
}));

import { authOptions, getGitHubToken } from "../lib/githubAuth";

// getGitHubToken は next-auth の getServerSession に依存するが、
// moduleNameMapper で __mocks__/next-auth.js にマップされており、
// CommonJS → ESM named import の互換性問題でモック差し替えが困難なため、
// callbacks のテストに集中する。

describe("authOptions", () => {
  it("providers に GitHub プロバイダーが含まれる", () => {
    expect(authOptions.providers).toHaveLength(1);
  });

  it("callbacks.jwt が account の access_token をトークンに保存する", async () => {
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error("jwt callback not defined");

    const result = await jwt({
      token: { sub: "1" },
      account: { access_token: "ghp_abc", provider: "github", type: "oauth", providerAccountId: "1" },
      user: { id: "1" },
      trigger: "signIn",
    });
    expect(result).toEqual({ sub: "1", accessToken: "ghp_abc" });
  });

  it("callbacks.jwt が account なしの場合はトークンをそのまま返す", async () => {
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error("jwt callback not defined");

    const result = await jwt({
      token: { sub: "1", accessToken: "existing" },
      user: { id: "1" },
      trigger: "update",
    });
    expect(result).toEqual({ sub: "1", accessToken: "existing" });
  });

  it("callbacks.session が session に accessToken を追加する", async () => {
    const session = authOptions.callbacks?.session;
    if (!session) throw new Error("session callback not defined");

    const result = await session({
      session: { user: { name: "test" }, expires: "2026-12-31" },
      token: { sub: "1", accessToken: "ghp_xyz" },
      trigger: "update",
      newSession: undefined,
    });
    expect((result as unknown as { accessToken: string }).accessToken).toBe("ghp_xyz");
  });
});
