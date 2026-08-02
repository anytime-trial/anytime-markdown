/**
 * @jest-environment node
 */

/**
 * `ensureStyle` の SSR 縮退分岐（`document` 未定義）の回帰テスト。
 *
 * 既定の jsdom 環境では `globalThis.document` が non-configurable な getter のため
 * `delete` でも `jest.spyOn` でも未定義にできない。node 環境なら `document` が
 * 実際に存在しないので、本番の SSR と同じ条件をそのまま再現できる。
 *
 * このガードは database-viewer / spreadsheet-viewer が自前で持っていた
 * `if (typeof document === "undefined") return;` を ui-core へ移したものなので、
 * 落とすと Next.js の SSR で初めて ReferenceError として顕在化する。
 */

import { ensureStyle } from "../dom";

describe("ensureStyle（SSR / node 環境）", () => {
  it("document が存在しない環境では何もせず throw もしない", () => {
    expect(typeof document).toBe("undefined");
    expect(() => ensureStyle("probe-ssr", ".x {}")).not.toThrow();
  });

  it("doc を明示すれば document 不在でも注入できる", () => {
    const fakeHead: Node[] = [];
    const fakeDoc = {
      getElementById: () => null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (n: Node) => fakeHead.push(n) },
    } as unknown as Document;

    ensureStyle("probe-ssr-doc", ".y {}", fakeDoc);

    expect(fakeHead).toHaveLength(1);
    expect(fakeHead[0]).toMatchObject({ id: "probe-ssr-doc", textContent: ".y {}" });
  });
});
