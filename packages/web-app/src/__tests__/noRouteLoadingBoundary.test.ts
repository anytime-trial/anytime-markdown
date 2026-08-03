/**
 * `app/[locale]/` 配下にルート単位の `loading.tsx` を置かないことを固定する。
 *
 * `loading.tsx` は自分より下の**全ルート**を Suspense 境界で包む。境界があると、サーバーは
 * 本文が決まる前にシェルをステータス 200 で送り出すため、配下のどこかで `notFound()` を
 * 呼んでも**ステータスだけが 200 のまま**になる（ソフト 404）。404 ページの HTML は
 * 正しく出るので、画面を見ても DOM を見ても気づけない。
 *
 * 実測（2026-08-03）: `app/[locale]/loading.tsx` があると `/markdown/unknown` が 200、
 * 外すと 404 になった。`generateMetadata` 側で `notFound()` を呼ぶ回避は効かない
 * （Next 16 はメタデータもストリーミングするため）。
 *
 * ローディング表示が要るページは、ルート単位の `loading.tsx` ではなく**ページの内側**へ
 * `<Suspense>` を置く（`report/page.tsx` / `docs/view/page.tsx` / `report/trace/page.tsx` /
 * `report/trace/[file]/page.tsx` がその形）。内側に閉じれば、`notFound()` の判定は
 * 描画開始より前に済むためステータスが正しく返る。
 *
 * ステータスそのものの検証は `e2e/http-status.spec.ts`（実サーバーへの HTTP 要求）が担う。
 * 本テストは「原因となる構造を作らせない」側の固定。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(__dirname, "../app");
const LOCALE_DIR = join(APP_DIR, "[locale]");

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else {
      found.push(full);
    }
  }
  return found;
}

describe("ルート単位の loading.tsx", () => {
  const files = walk(LOCALE_DIR);

  it("探索対象が空でない", () => {
    // 走査に失敗して空配列になると、下の検査は「空 === 空」で通る（fail-open）
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith("page.tsx"))).toBe(true);
  });

  it("[locale] 配下に loading.tsx を置かない", () => {
    const loadings = files
      .filter((f) => f.endsWith("/loading.tsx"))
      .map((f) => f.slice(APP_DIR.length + 1));

    expect(loadings).toEqual([]);
  });

  it("データ取得を待つページはページの内側に Suspense を持つ", () => {
    // 境界を外した代わりの受け皿。ここが空になると、待ち時間に何も出ない画面へ退行する
    const pagesNeedingSuspense = [
      "[locale]/report/page.tsx",
      "[locale]/docs/view/page.tsx",
      "[locale]/report/trace/page.tsx",
      "[locale]/report/trace/[file]/page.tsx",
    ];

    for (const rel of pagesNeedingSuspense) {
      const source = readFileSync(join(APP_DIR, rel), "utf8");
      expect(source).toContain("<Suspense");
    }
  });
});
