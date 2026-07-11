import { resolveConnectedProviders } from "../lib/connectedProviders";

describe("resolveConnectedProviders", () => {
  it("session が null なら何も接続されていない", () => {
    expect(resolveConnectedProviders(null)).toEqual({ github: false, google: false });
  });

  it("Google のみサインインした session を GitHub 接続済みと誤判定しない", () => {
    const session = { user: { name: "test" }, googleAccessToken: "ya29.token" };
    expect(resolveConnectedProviders(session)).toEqual({ github: false, google: true });
  });

  it("GitHub の access token を持つ session は github: true", () => {
    const session = { user: { name: "test" }, accessToken: "gho_token" };
    expect(resolveConnectedProviders(session)).toEqual({ github: true, google: false });
  });

  it("両方のトークンを持つ session は両方 true", () => {
    const session = { accessToken: "gho_token", googleAccessToken: "ya29.token" };
    expect(resolveConnectedProviders(session)).toEqual({ github: true, google: true });
  });

  it("空文字のトークンは未接続として扱う", () => {
    expect(resolveConnectedProviders({ accessToken: "", googleAccessToken: "" })).toEqual({
      github: false,
      google: false,
    });
  });

  it("トークンが文字列以外でも例外を投げない", () => {
    expect(resolveConnectedProviders({ accessToken: 1, googleAccessToken: {} })).toEqual({
      github: false,
      google: false,
    });
    expect(resolveConnectedProviders("not-an-object")).toEqual({ github: false, google: false });
  });
});
