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

describe("sanitizeExtras: プロトタイプ差し替えにならないこと", () => {
  // SAFE_EXTRA_KEY_RE（^[A-Za-z_][\w-]*$）は `__proto__` を通す。素のオブジェクト
  // リテラルへ代入すると「そのキーの値」ではなくプロトタイプの差し替えになり、
  // 未知キーが自身のプロパティとして残らない＝往復保存で黙って消える。
  // tickets-core の parseTicketMarkdown 側は Object.create(null) 化済みなので、
  // ここだけ literal のままだと API 経由の更新でキーが失われ、経路で挙動が食い違う。
  it("__proto__ キーを自身のプロパティとして保持する", () => {
    // オブジェクトリテラルの `__proto__:` は入力側のプロトタイプ差し替えになり、
    // own key にならない。JSON.parse は setter を通さず自身のプロパティとして作る。
    const out = sanitizeExtras(JSON.parse('{"__proto__":["polluted"]}'));
    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(out["__proto__"]).toEqual(["polluted"]);
    expect(Array.isArray(Object.getPrototypeOf(out))).toBe(false);
  });

  // 注意: このアサーションは修正前でも通る（恒真）。`obj["__proto__"] = v` は
  // setter 経由の prototype 差し替えであって Object.prototype への書き込みではない。
  // 回帰ガードは上の「__proto__ を自身のプロパティとして保持する」側だけが担う。
  // ここは「この経路はグローバル汚染には至らない」という到達範囲の明文化として残す。
  it("Object.prototype には到達しない（範囲の明文化・恒真）", () => {
    sanitizeExtras(JSON.parse('{"__proto__":{"polluted":"yes"}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
