import { fileOriginFor, nextExternalSaveKind } from "../utils/externalSaveKind";

describe("nextExternalSaveKind", () => {
  it("ローカルへ保存先が移ったら種別は消える（上書き保存表記へ戻す）", () => {
    expect(nextExternalSaveKind("local", "github")).toBeUndefined();
    expect(nextExternalSaveKind("local", "drive")).toBeUndefined();
  });

  it("外部保存のままならホストの最新値へ追従する（GitHub → Drive の新規保存）", () => {
    expect(nextExternalSaveKind("external", "drive")).toBe("drive");
    expect(nextExternalSaveKind("external", "github")).toBe("github");
  });

  it("保存先が無くなってもホストの種別を保つ（外部保存の配線自体は残る）", () => {
    expect(nextExternalSaveKind(null, "github")).toBe("github");
  });

  it("ホストが種別を持たなければ undefined", () => {
    expect(nextExternalSaveKind("external", undefined)).toBeUndefined();
  });
});

describe("fileOriginFor", () => {
  it("外部保存の種別がそのままファイルの所在になる", () => {
    expect(fileOriginFor("spec.md", "github")).toBe("github");
    expect(fileOriginFor("memo.md", "drive")).toBe("drive");
  });

  it("外部保存の種別が無ければローカルファイル", () => {
    expect(fileOriginFor("README.md", undefined)).toBe("local");
  });

  it("ファイル名が無ければ所在も無い（新規未保存）", () => {
    expect(fileOriginFor(null, undefined)).toBeNull();
    expect(fileOriginFor(undefined, "github")).toBeNull();
    expect(fileOriginFor("", "drive")).toBeNull();
  });
});
