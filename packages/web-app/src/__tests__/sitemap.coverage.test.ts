/**
 * sitemap.ts のカバレッジテスト
 */

jest.mock("../lib/s3Client", () => ({
  fetchLayoutData: jest.fn(),
}));

jest.mock("../lib/reportClient", () => ({
  listReports: jest.fn(),
}));

import { fetchLayoutData } from "../lib/s3Client";
import { listReports } from "../lib/reportClient";
import sitemap from "../app/sitemap";
import { TOPIC_SLUGS, topicPath } from "../app/[locale]/markdown/topics";
import { SINGLE_SOURCE_ROUTE_PATHS } from "../lib/staticRoutes";

const mockFetchLayoutData = fetchLayoutData as jest.MockedFunction<typeof fetchLayoutData>;
const mockListReports = listReports as jest.MockedFunction<typeof listReports>;

/** 静的ルート数（/ /markdown /report /privacy /privacy/services ＋ 記法別 LP） */
const STATIC_ROUTE_COUNT = 5 + TOPIC_SLUGS.length;
/** 対応ロケール数（ja / en）。各ルートはロケール分だけ URL を持つ */
const LOCALE_COUNT = 2;
/**
 * 本文が日本語のみの静的ルート（/timeline 等）は ja の 1 URL しか載せないので、
 * ロケール数を掛けずに足す。掛けてしまうと「en 版がある」と申告する形に戻る
 */
const STATIC_PAGE_COUNT =
  STATIC_ROUTE_COUNT * LOCALE_COUNT + SINGLE_SOURCE_ROUTE_PATHS.length;
/**
 * 記事・ドキュメントは本文が単一ソース（ja）なので 1 URL だけ掲載する。
 * 両ロケールを載せると 1 本の記事を 2 URL で重複申告することになる。
 */
const SINGLE_SOURCE_URL_COUNT = 1;

const LAYOUT_FIXTURE = {
  categories: [
    {
      id: "cat-1",
      title: "Cat",
      description: "",
      order: 0,
      items: [
        { docKey: "docs/test.md", displayName: "Test" },
        { docKey: "docs/guide.md", displayName: "Guide" },
      ],
    },
  ],
  siteDescription: "",
};

const REPORT_FIXTURE = [
  { slug: "first-post", key: "reports/first-post.md", title: "First", date: "2026-07-01" },
  { slug: "second-post", key: "reports/second-post.md", title: "Second", date: "2026-07-15" },
];

describe("sitemap", () => {
  beforeEach(() => {
    mockFetchLayoutData.mockReset();
    mockListReports.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns static pages + doc pages + report pages on success", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    expect(result.length).toBe(STATIC_PAGE_COUNT + (2 + 2) * SINGLE_SOURCE_URL_COUNT);

    const urls = result.map((entry) => entry.url);
    expect(urls.some((url) => url.includes("docs%2Ftest.md"))).toBe(true);
    expect(urls.some((url) => url.includes("docs%2Fguide.md"))).toBe(true);
  });

  it("lists every report article under its own URL", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/report/first-post"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/report/second-post"))).toBe(true);
  });

  it("lists every locale for translated routes", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);
    // 既定ロケール(ja)は非プレフィックス、en は /en 配下
    expect(urls).toContain("https://www.anytime-trial.com");
    expect(urls).toContain("https://www.anytime-trial.com/en");
    expect(urls).toContain("https://www.anytime-trial.com/markdown");
    expect(urls).toContain("https://www.anytime-trial.com/en/markdown");
  });

  it("lists every topic landing page in both locales", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);
    // ページを足して sitemap を忘れると、クロールの経路が内部リンクだけになる
    for (const slug of TOPIC_SLUGS) {
      expect(urls).toContain(`https://www.anytime-trial.com${topicPath(slug)}`);
      expect(urls).toContain(`https://www.anytime-trial.com/en${topicPath(slug)}`);
    }
  });

  it("lists single-source content under one URL only", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);
    // 記事本文は S3 上の単一ソース。/en 版を掲載すると同じ記事を 2 URL で申告することになる
    expect(urls).toContain("https://www.anytime-trial.com/report/first-post");
    expect(urls).not.toContain("https://www.anytime-trial.com/en/report/first-post");
    expect(urls.some((url) => url.startsWith("https://www.anytime-trial.com/en/docs/view"))).toBe(
      false,
    );
  });

  it("cross-links locales through alternates on translated entries", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const entry = result.find((e) => e.url === "https://www.anytime-trial.com/markdown");
    // x-default は HTML 側の alternates（lib/localeAlternates）と同じ集合にする
    expect(entry?.alternates?.languages).toEqual({
      ja: "https://www.anytime-trial.com/markdown",
      en: "https://www.anytime-trial.com/en/markdown",
      "x-default": "https://www.anytime-trial.com/markdown",
    });
    // 記事・ドキュメントに加え、本文が日本語のみの静的ルートも単一ソース側に数える
    const isSingleSource = (url: string) =>
      url.includes("/report/") ||
      url.includes("/docs/view") ||
      SINGLE_SOURCE_ROUTE_PATHS.some((path) => url.endsWith(path));
    // 翻訳のあるルートは全て対応関係を持つ（片方だけ欠けると検索エンジンが別ページ扱いする）
    const translated = result.filter((e) => !isSingleSource(e.url));
    expect(translated.every((e) => !!e.alternates?.languages)).toBe(true);
    // 単一ソースのページは languages を持たない（翻訳版があると申告しない）
    const singleSource = result.filter((e) => isSingleSource(e.url));
    expect(singleSource.length).toBeGreaterThan(0);
    expect(singleSource.every((e) => !e.alternates?.languages)).toBe(true);
  });

  it("uses the article date as lastModified", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const entry = result.find((e) => e.url.endsWith("/report/second-post"));
    expect(entry?.lastModified).toEqual(new Date("2026-07-15"));
  });

  it("omits routes that have no page or are noindex", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    const paths = result.map((entry) => entry.url.replace(/^https?:\/\/[^/]+/, ""));
    // app/docs/ に page.tsx が無い（404 を申告していた）
    expect(paths).not.toContain("/docs");
    // /trail は noindex にしたため、サイトマップ掲載は矛盾シグナルになる
    expect(paths).not.toContain("/trail");
  });

  it("keeps report pages when the docs layout fails", async () => {
    mockFetchLayoutData.mockRejectedValue(new Error("layout fail"));
    mockListReports.mockResolvedValue(REPORT_FIXTURE);

    const result = await sitemap();
    expect(result.length).toBe(STATIC_PAGE_COUNT + 2 * SINGLE_SOURCE_URL_COUNT);
    expect(result.some((entry) => entry.url.endsWith("/report/first-post"))).toBe(true);
  });

  it("keeps doc pages when the report listing fails", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockRejectedValue(new Error("report fail"));

    const result = await sitemap();
    expect(result.length).toBe(STATIC_PAGE_COUNT + 2 * SINGLE_SOURCE_URL_COUNT);
    expect(result.some((entry) => entry.url.includes("docs%2Ftest.md"))).toBe(true);
  });

  it("returns only static pages when both sources fail", async () => {
    mockFetchLayoutData.mockRejectedValue(new Error("layout fail"));
    mockListReports.mockRejectedValue(new Error("report fail"));

    const result = await sitemap();
    expect(result.length).toBe(STATIC_PAGE_COUNT);
  });
});
