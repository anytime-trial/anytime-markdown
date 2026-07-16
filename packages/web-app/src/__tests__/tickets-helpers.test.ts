// helpers.ts は next/server（NextResponse）を import するが sanitizeExtras 自体は純関数。
// テスト環境に Request グローバルが無いため、他 API テストと同様に next/server をモックする。
jest.mock("next/server", () => ({ NextResponse: { json: jest.fn() } }));

import { sanitizeExtras } from "../app/api/github/tickets/helpers";

describe("sanitizeExtras", () => {
  it("正常なキー/値はそのまま通す", () => {
    expect(sanitizeExtras({ custom_field: "keep", tags: ["a", "b"], n: 3 })).toEqual({
      custom_field: "keep",
      tags: ["a", "b"],
      n: 3,
    });
  });

  it("frontmatter 記法に使えないキー（改行・記号）を除外する", () => {
    const out = sanitizeExtras({
      "foo\nupdated_at": "poison",
      "bad key": "x",
      "id:injected": "y",
      good_key: "ok",
    });
    expect(out).toEqual({ good_key: "ok" });
  });

  it("値に制御文字（改行等）を含む extras を除外する", () => {
    const out = sanitizeExtras({
      note: "a\nstatus: completed",
      arr: ["ok", "bad\rinjected"],
      clean: "value",
    });
    expect(out).toEqual({ clean: "value" });
  });

  it("object/null/非対象型は空を返す", () => {
    expect(sanitizeExtras(null)).toEqual({});
    expect(sanitizeExtras("str")).toEqual({});
  });
});
