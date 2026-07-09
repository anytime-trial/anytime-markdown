/**
 * githubAuth のユニットテスト (next-auth v5)
 *
 * NextAuth() に渡された config の callbacks を抽出してテストする。
 * getGitHubToken は auth() に依存し、モックの _setSession で制御する。
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextAuthMock = require("next-auth") as {
  _getCapturedConfig: () => { callbacks?: { jwt?: (args: Record<string, unknown>) => unknown; session?: (args: Record<string, unknown>) => unknown } };
  _setSession: (session: unknown) => void;
  _resetSession: () => void;
};

// githubAuth を import すると NextAuth() がモジュール初期化時に呼ばれ、
// config が nextAuthMock._getCapturedConfig() で取得できる
import { getGitHubToken } from "../lib/githubAuth";

describe("auth config callbacks", () => {
  const config = nextAuthMock._getCapturedConfig();

  it("callbacks.jwt が account の access_token をトークンに保存する", async () => {
    const jwt = config.callbacks?.jwt;
    expect(jwt).toBeDefined();

    const result = await jwt!({
      token: { sub: "1" },
      account: { access_token: "ghp_abc", provider: "github", type: "oauth", providerAccountId: "1" },
    });
    expect(result).toEqual({ sub: "1", accessToken: "ghp_abc" });
  });

  it("callbacks.jwt が account なしの場合はトークンをそのまま返す", async () => {
    const jwt = config.callbacks?.jwt;

    const result = await jwt!({
      token: { sub: "1", accessToken: "existing" },
    });
    expect(result).toEqual({ sub: "1", accessToken: "existing" });
  });

  it("callbacks.session が session に accessToken を追加する", () => {
    const sessionCb = config.callbacks?.session;
    expect(sessionCb).toBeDefined();

    const result = sessionCb!({
      session: { user: { name: "test" }, expires: "2026-12-31" },
      token: { sub: "1", accessToken: "ghp_xyz" },
    }) as { accessToken?: string };
    expect(result.accessToken).toBe("ghp_xyz");
  });
});

describe("getGitHubToken", () => {
  afterEach(() => {
    nextAuthMock._resetSession();
  });

  it("セッションがない場合は null を返す", async () => {
    const token = await getGitHubToken();
    expect(token).toBeNull();
  });

  it("セッションから accessToken を取得する", async () => {
    nextAuthMock._setSession({ user: { name: "test" }, accessToken: "ghp_token123" });
    const token = await getGitHubToken();
    expect(token).toBe("ghp_token123");
  });

  it("セッションに accessToken がない場合は null を返す", async () => {
    nextAuthMock._setSession({ user: { name: "test" } });
    const token = await getGitHubToken();
    expect(token).toBeNull();
  });
});
