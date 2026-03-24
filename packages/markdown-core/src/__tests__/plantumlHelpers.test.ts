import {
  PLANTUML_SERVER,
  PLANTUML_CONSENT_KEY,
  PLANTUML_DARK_SKINPARAMS,
  buildPlantUmlUrl,
} from "../utils/plantumlHelpers";

describe("plantumlHelpers", () => {
  test("PLANTUML_SERVER が有効な URL", () => {
    expect(PLANTUML_SERVER).toMatch(/^https?:\/\//);
  });

  test("PLANTUML_CONSENT_KEY が非空文字列", () => {
    expect(typeof PLANTUML_CONSENT_KEY).toBe("string");
    expect(PLANTUML_CONSENT_KEY.length).toBeGreaterThan(0);
  });

  test("PLANTUML_DARK_SKINPARAMS が skinparam 行を含む", () => {
    const lines = PLANTUML_DARK_SKINPARAMS.split("\n");
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.every((l) => l.startsWith("skinparam"))).toBe(true);
  });

  test("標準要素の BorderColor/BackgroundColor/FontColor が含まれる", () => {
    const stdElements = ["actor", "class", "note", "participant", "database"];
    for (const el of stdElements) {
      expect(PLANTUML_DARK_SKINPARAMS).toContain(`skinparam ${el}BorderColor`);
      expect(PLANTUML_DARK_SKINPARAMS).toContain(`skinparam ${el}BackgroundColor`);
      expect(PLANTUML_DARK_SKINPARAMS).toContain(`skinparam ${el}FontColor`);
    }
  });

  test("コンテナ要素の BackgroundColor が surface 色を使用", () => {
    const surface = "#1E1E1E";
    const containers = ["rectangle", "package", "partition", "node"];
    for (const el of containers) {
      expect(PLANTUML_DARK_SKINPARAMS).toContain(
        `skinparam ${el}BackgroundColor ${surface}`,
      );
    }
  });

  test("シーケンス図パラメータが含まれる", () => {
    expect(PLANTUML_DARK_SKINPARAMS).toContain("skinparam sequenceArrowColor");
    expect(PLANTUML_DARK_SKINPARAMS).toContain("skinparam sequenceLifeLineBorderColor");
    expect(PLANTUML_DARK_SKINPARAMS).toContain("skinparam sequenceGroupBorderColor");
    expect(PLANTUML_DARK_SKINPARAMS).toContain("skinparam sequenceMessageAlignment");
  });

  describe("buildPlantUmlUrl", () => {
    test("PLANTUML_SERVER オリジンで始まる URL を返す", () => {
      const url = buildPlantUmlUrl("SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKi1IW80");
      expect(url).toBe(`${PLANTUML_SERVER}/svg/SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKi1IW80`);
    });

    test("空文字列のエンコード値でも正しい URL を返す", () => {
      const url = buildPlantUmlUrl("");
      expect(url).toBe(`${PLANTUML_SERVER}/svg/`);
    });
  });
});
