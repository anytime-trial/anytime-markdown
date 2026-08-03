/**
 * robots.txt と sitemap の静的ルートが 1 対 1 で対応することを固定する。
 *
 * 両者は同じ「公開ルート一覧」を主張する。片方だけ更新しても**どちらも壊れない**ため、
 * 乖離は失敗として現れない（`allow` は `disallow` に対してのみ意味を持つので、
 * robots へ書き忘れたパスもクロール自体はされ続ける）。実際 2026-08-03 に記法別 LP 5 本を
 * sitemap へ足したとき robots.ts の一覧が取り残され、既存テストは全部通ったままだった。
 */

jest.mock("../lib/s3Client", () => ({ fetchLayoutData: jest.fn() }));
jest.mock("../lib/reportClient", () => ({ listReports: jest.fn() }));

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { routing } from "../i18n/routing";
import { localeHref } from "../lib/localeAlternates";
import { fetchLayoutData } from "../lib/s3Client";
import { listReports } from "../lib/reportClient";
import { STATIC_ROUTE_PATHS } from "../lib/staticRoutes";

const mockFetchLayoutData = fetchLayoutData as jest.MockedFunction<typeof fetchLayoutData>;
const mockListReports = listReports as jest.MockedFunction<typeof listReports>;

const BASE_URL = "https://www.anytime-trial.com";

describe("robots.txt と sitemap の対応", () => {
  beforeEach(() => {
    // 動的ページ（記事・ドキュメント）は対応関係の対象外なので空で足りる
    mockFetchLayoutData.mockResolvedValue({ categories: [], siteDescription: "" });
    mockListReports.mockResolvedValue([]);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("robots の allow が静的ルートを全ロケール分そのまま並べる", () => {
    const rules = robots().rules as { allow: string[] };
    const expected = STATIC_ROUTE_PATHS.flatMap((path) =>
      routing.locales.map((locale) => localeHref(path, locale)),
    );

    expect([...rules.allow].sort()).toEqual([...expected].sort());
  });

  it("sitemap の静的エントリと robots の allow が同じ URL 集合を指す", async () => {
    const rules = robots().rules as { allow: string[] };
    const entries = await sitemap();

    // sitemap は絶対 URL、robots は相対パス。robots 側を絶対化して突き合わせる
    const fromRobots = new Set(
      rules.allow.map((path) => (path === "/" ? BASE_URL : `${BASE_URL}${path}`)),
    );
    const fromSitemap = new Set(entries.map((entry) => entry.url));

    const missingInRobots = [...fromSitemap].filter((url) => !fromRobots.has(url));
    const missingInSitemap = [...fromRobots].filter((url) => !fromSitemap.has(url));

    // 件数ではなく双方向の集合差分で見る（同数のまま入れ替わる乖離を見逃さない）
    expect({ missingInRobots, missingInSitemap }).toEqual({
      missingInRobots: [],
      missingInSitemap: [],
    });
  });

  it("公開ルート一覧が空でない", () => {
    // 一覧の取得に失敗して空になると、上の 2 件は「空 === 空」で通る（fail-open）
    expect(STATIC_ROUTE_PATHS.length).toBeGreaterThan(0);
    expect(STATIC_ROUTE_PATHS).toContain("/markdown");
  });
});
