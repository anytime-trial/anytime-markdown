import ja from "../i18n/ja.json";
import en from "../i18n/en.json";

const REQUIRED_KEYS = [
  "anytimeGraph",
  "anytimeGraphHint",
  "slashThinkFishbone",
  "slashThinkCausalLoop",
  "slashThinkPyramid",
  "slashThinkMindmap",
  "slashThinkDoubleDiamond",
  "slashThinkLogicTree",
  "slashThinkWhyChain",
  "slashThinkSwot",
  "slashThinkMorphBox",
  "slashThinkAffinity",
] as const;

describe("anytime-graph i18n keys", () => {
  const jaMap = (ja as { MarkdownEditor: Record<string, string> }).MarkdownEditor;
  const enMap = (en as { MarkdownEditor: Record<string, string> }).MarkdownEditor;

  it.each(REQUIRED_KEYS)("ja に %s が存在し空でない", (key) => {
    expect(typeof jaMap[key]).toBe("string");
    expect(jaMap[key].length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_KEYS)("en に %s が存在し空でない", (key) => {
    expect(typeof enMap[key]).toBe("string");
    expect(enMap[key].length).toBeGreaterThan(0);
  });
});
