/**
 * usePlantUmlRender から抽出した同期 seam のユニットテスト。
 *
 * native NodeView（反転アーキテクチャ）が hook を介さず直接呼ぶ純関数の
 * 契約を固定する。buildPlantUmlImageUrl は同期・キャッシュ付き、
 * getPlantUmlConsent は sessionStorage を読む SSR 安全な getter。
 */

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  buildPlantUmlUrl: jest.fn().mockImplementation((encoded: string) => `https://www.plantuml.com/plantuml/svg/${encoded}`),
  PLANTUML_CONSENT_KEY: "plantuml-external-consent",
  PLANTUML_DARK_SKINPARAMS: "skinparam backgroundColor #1E1E1E",
  PLANTUML_LIGHT_SKINPARAMS: "skinparam backgroundColor #FFFFFF",
}));

jest.mock("plantuml-encoder", () => ({
  __esModule: true,
  default: { encode: jest.fn().mockReturnValue("ENCODED") },
}));

jest.mock("../utils/BoundedMap", () => ({
  BoundedMap: jest.fn().mockImplementation(() => {
    const map = new Map<string, string>();
    return {
      get: (key: string) => map.get(key),
      set: (key: string, val: string) => map.set(key, val),
    };
  }),
}));

import { buildPlantUmlImageUrl, getPlantUmlConsent } from "../hooks/usePlantUmlRender";

describe("buildPlantUmlImageUrl", () => {
  it("空コードは空文字を返す", () => {
    expect(buildPlantUmlImageUrl("  ", false)).toBe("");
  });

  it("encode 結果から PlantUML サーバ URL を構築する", () => {
    const url = buildPlantUmlImageUrl("@startuml\nA -> B\n@enduml", false);
    expect(url).toBe("https://www.plantuml.com/plantuml/svg/ENCODED");
  });

  it("同一コードはキャッシュから返す（encode は 1 回のみ）", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const encoder = require("plantuml-encoder").default as { encode: jest.Mock };
    encoder.encode.mockClear();
    const code = "@startuml\nX -> Y\n@enduml";
    buildPlantUmlImageUrl(code, true);
    buildPlantUmlImageUrl(code, true);
    expect(encoder.encode).toHaveBeenCalledTimes(1);
  });
});

describe("getPlantUmlConsent", () => {
  beforeEach(() => sessionStorage.clear());

  it("未設定は pending", () => {
    expect(getPlantUmlConsent()).toBe("pending");
  });

  it("accepted / rejected を読み出す", () => {
    sessionStorage.setItem("plantuml-external-consent", "accepted");
    expect(getPlantUmlConsent()).toBe("accepted");
    sessionStorage.setItem("plantuml-external-consent", "rejected");
    expect(getPlantUmlConsent()).toBe("rejected");
  });

  it("不正値は pending にフォールバック", () => {
    sessionStorage.setItem("plantuml-external-consent", "garbage");
    expect(getPlantUmlConsent()).toBe("pending");
  });
});
