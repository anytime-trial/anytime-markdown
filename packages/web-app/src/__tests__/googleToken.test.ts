import { isGoogleTokenExpired, parseRefreshedToken } from "../lib/googleToken";

describe("isGoogleTokenExpired", () => {
  const now = 1_700_000_000_000;
  it("expiresAt 未設定なら期限切れ扱い", () => {
    expect(isGoogleTokenExpired(undefined, now)).toBe(true);
  });
  it("期限まで 60 秒超あれば有効", () => {
    expect(isGoogleTokenExpired(now + 120_000, now)).toBe(false);
  });
  it("期限まで 60 秒未満なら期限切れ扱い（先読みマージン）", () => {
    expect(isGoogleTokenExpired(now + 30_000, now)).toBe(true);
  });
});

describe("parseRefreshedToken", () => {
  const now = 1_700_000_000_000;
  it("access_token と expires_in を { accessToken, expiresAt } に変換する", () => {
    expect(
      parseRefreshedToken({ access_token: "ya29.new", expires_in: 3600 }, now),
    ).toEqual({ accessToken: "ya29.new", expiresAt: now + 3_600_000 });
  });
  it("access_token 欠落なら null", () => {
    expect(parseRefreshedToken({ expires_in: 3600 }, now)).toBeNull();
  });
});
