import { parseHeadingTarget } from "../host/chrome/agentEdits";

const LEGACY = /^(#{1,6})\s+(.*?)\s*$/;

describe("parseHeadingTarget", () => {
  const cases = [
    "# A",
    "## Title  ",
    "###   spaced  title \t",
    "####### too deep",
    "#NoSpace",
    "#",
    "# ",
    "#  ",
    "## a\nb",
    "## a\n",
    "##\nfoo",
    "not a heading",
    "",
    "###### 見出し **bold**",
  ];
  it.each(cases)("旧正規表現と同値: %j", (input) => {
    const legacy = LEGACY.exec(input);
    const actual = parseHeadingTarget(input);
    if (!legacy) {
      expect(actual).toBeNull();
    } else {
      expect(actual).toEqual({ hashes: legacy[1], text: legacy[2] });
    }
  });
});
