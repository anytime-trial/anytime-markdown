/**
 * samples 定数のユニットテスト
 */

import { MERMAID_SAMPLES, PLANTUML_SAMPLES, MATH_SAMPLES } from "../constants/samples";

describe("DiagramSamples", () => {
  it.each([
    ["MERMAID_SAMPLES", MERMAID_SAMPLES],
    ["PLANTUML_SAMPLES", PLANTUML_SAMPLES],
    ["MATH_SAMPLES", MATH_SAMPLES],
  ])("%s が正しい構造を持つ", (_, samples) => {
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.label).toBeTruthy();
      expect(sample.i18nKey).toBeTruthy();
      expect(sample.code).toBeTruthy();
      expect(typeof sample.enabled).toBe("boolean");
    }
  });
});
