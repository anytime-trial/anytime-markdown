import { measureToCssMaxWidth, MEASURE_PRESETS } from "../utils/measurePreset";

describe("measureToCssMaxWidth", () => {
  it("各プリセットを CSS max-width 値へマップする", () => {
    expect(measureToCssMaxWidth("focus")).toBe("40em");
    expect(measureToCssMaxWidth("standard")).toBe("46em");
    expect(measureToCssMaxWidth("wide")).toBe("60em");
    expect(measureToCssMaxWidth("full")).toBe("none");
  });

  it("未知値・undefined は既定（standard = 46em）へフォールバックする", () => {
    expect(measureToCssMaxWidth("bogus")).toBe("46em");
    expect(measureToCssMaxWidth("")).toBe("46em");
    expect(measureToCssMaxWidth(undefined)).toBe("46em");
  });

  it("MEASURE_PRESETS は集中→標準→広い→画面幅いっぱいの順で全プリセットを列挙する", () => {
    expect(MEASURE_PRESETS).toEqual(["focus", "standard", "wide", "full"]);
  });
});
