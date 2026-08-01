import { DEFAULT_SETTINGS } from "../editorSettings";
import { diffLivePatch } from "../host/liveUpdateDiff";

describe("diffLivePatch", () => {
  it("全キー同値なら空 patch を返す", () => {
    const prev = { readOnly: false, autoReload: true, themeMode: "light" as const };
    const next = { readOnly: false, autoReload: true, themeMode: "light" as const };
    expect(diffLivePatch(prev, next)).toEqual({});
  });

  it("autoReload のみ変化したらそのキーだけ返す", () => {
    const prev = { autoReload: true, themeMode: "light" as const };
    const next = { autoReload: false, themeMode: "light" as const };
    expect(diffLivePatch(prev, next)).toEqual({ autoReload: false });
  });

  it("settings の内容が変われば settings を含む", () => {
    const prev = { settings: DEFAULT_SETTINGS };
    const next = { settings: { ...DEFAULT_SETTINGS, fontSize: 20 } };
    expect(diffLivePatch(prev, next)).toEqual({ settings: next.settings });
  });

  it("settings が同値（別インスタンス）なら含まない", () => {
    const prev = { settings: DEFAULT_SETTINGS };
    const next = { settings: { ...DEFAULT_SETTINGS } };
    expect(diffLivePatch(prev, next)).toEqual({});
  });

  it("externalCompareContent の null / string を区別する", () => {
    expect(
      diffLivePatch({ externalCompareContent: null }, { externalCompareContent: "x" }),
    ).toEqual({ externalCompareContent: "x" });
    expect(
      diffLivePatch({ externalCompareContent: "x" }, { externalCompareContent: "x" }),
    ).toEqual({});
  });
});
