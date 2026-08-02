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

const mockFetchLayoutData = fetchLayoutData as jest.MockedFunction<typeof fetchLayoutData>;
const mockListReports = listReports as jest.MockedFunction<typeof listReports>;

/** 静的ページ数（/ /markdown /report /privacy /privacy/services） */
const STATIC_PAGE_COUNT = 5;

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
    expect(result.length).toBe(STATIC_PAGE_COUNT + 2 + 2);

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
    expect(result.length).toBe(STATIC_PAGE_COUNT + 2);
    expect(result.some((entry) => entry.url.endsWith("/report/first-post"))).toBe(true);
  });

  it("keeps doc pages when the report listing fails", async () => {
    mockFetchLayoutData.mockResolvedValue(LAYOUT_FIXTURE);
    mockListReports.mockRejectedValue(new Error("report fail"));

    const result = await sitemap();
    expect(result.length).toBe(STATIC_PAGE_COUNT + 2);
    expect(result.some((entry) => entry.url.includes("docs%2Ftest.md"))).toBe(true);
  });

  it("returns only static pages when both sources fail", async () => {
    mockFetchLayoutData.mockRejectedValue(new Error("layout fail"));
    mockListReports.mockRejectedValue(new Error("report fail"));

    const result = await sitemap();
    expect(result.length).toBe(STATIC_PAGE_COUNT);
  });
});
