import { measureToEm, MEASURE_PRESETS } from "../utils/measurePreset";

describe("measureToEm", () => {
  it("各プリセットを CSS max-width 値へマップする", () => {
    expect(measureToEm("focus")).toBe("40em");
    expect(measureToEm("standard")).toBe("46em");
    expect(measureToEm("wide")).toBe("60em");
    expect(measureToEm("full")).toBe("none");
  });

  it("未知値・undefined は既定（standard = 46em）へフォールバックする", () => {
    expect(measureToEm("bogus")).toBe("46em");
    expect(measureToEm("")).toBe("46em");
    expect(measureToEm(undefined)).toBe("46em");
  });

  it("MEASURE_PRESETS は集中→標準→広い→画面幅いっぱいの順で全プリセットを列挙する", () => {
    expect(MEASURE_PRESETS).toEqual(["focus", "standard", "wide", "full"]);
  });
});
