/**
 * /report/[slug] の構造化データ（Article / BreadcrumbList）と metadata の検証
 */

import { render } from "@testing-library/react";
import React from "react";

jest.mock("../lib/reportClient", () => ({
  getReportBySlug: jest.fn(),
  listReports: jest.fn(),
}));

jest.mock("../app/[locale]/report/[slug]/ReportDetailBody", () => ({
  __esModule: true,
  default: () => <div data-testid="report-body" />,
}));

import { getReportBySlug, listReports } from "../lib/reportClient";
import ReportDetailPage, { generateMetadata } from "../app/[locale]/report/[slug]/page";

const mockGetReportBySlug = getReportBySlug as jest.MockedFunction<typeof getReportBySlug>;
const mockListReports = listReports as jest.MockedFunction<typeof listReports>;

const REPORT = {
  meta: {
    slug: "my-post",
    key: "reports/my-post.md",
    title: "My Post",
    date: "2026-07-01",
    author: "Kiyotaka Ueda",
    category: "engineering",
    excerpt: "An article about something.",
  },
  content: "# body",
};

/** レンダリング結果から ld+json を型別に取り出す */
function readJsonLd(container: HTMLElement, type: string): Record<string, unknown> | undefined {
  const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'));
  return scripts
    .map((s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>)
    .find((data) => data["@type"] === type);
}

async function renderPage() {
  const element = await ReportDetailPage({ params: Promise.resolve({ locale: "ja", slug: "my-post" }) });
  return render(element);
}

describe("/report/[slug] structured data", () => {
  beforeEach(() => {
    mockGetReportBySlug.mockReset();
    mockListReports.mockReset();
    mockGetReportBySlug.mockResolvedValue(REPORT);
    mockListReports.mockResolvedValue([REPORT.meta]);
  });

  it("emits Article JSON-LD with the article's own fields", async () => {
    const { container } = await renderPage();
    const article = readJsonLd(container, "Article");

    expect(article).toBeDefined();
    expect(article?.headline).toBe("My Post");
    expect(article?.datePublished).toBe("2026-07-01");
    expect(article?.description).toBe("An article about something.");
    expect(article?.author).toEqual({ "@type": "Person", name: "Kiyotaka Ueda" });
    expect(article?.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": "https://www.anytime-trial.com/report/my-post",
    });
  });

  it("falls back to the site OG image when the thumbnail is not an absolute URL", async () => {
    const { container } = await renderPage();
    expect(readJsonLd(container, "Article")?.image).toBe(
      "https://www.anytime-trial.com/opengraph-image",
    );
  });

  it("uses an absolute thumbnail when the article provides one", async () => {
    mockGetReportBySlug.mockResolvedValue({
      ...REPORT,
      meta: { ...REPORT.meta, thumbnail: "https://cdn.example.com/thumb.png" },
    });

    const { container } = await renderPage();
    expect(readJsonLd(container, "Article")?.image).toBe("https://cdn.example.com/thumb.png");
  });

  it("emits a BreadcrumbList from home to the article", async () => {
    const { container } = await renderPage();
    const breadcrumb = readJsonLd(container, "BreadcrumbList");

    expect(breadcrumb).toBeDefined();
    expect(breadcrumb?.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.anytime-trial.com" },
      { "@type": "ListItem", position: 2, name: "Report", item: "https://www.anytime-trial.com/report" },
      {
        "@type": "ListItem",
        position: 3,
        name: "My Post",
        item: "https://www.anytime-trial.com/report/my-post",
      },
    ]);
  });

  it("emits no structured data when the article is missing", async () => {
    mockGetReportBySlug.mockResolvedValue(null);

    const { container } = await renderPage();
    expect(container.querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
  });
});

describe("/report/[slug] metadata", () => {
  beforeEach(() => {
    mockGetReportBySlug.mockReset();
    mockGetReportBySlug.mockResolvedValue(REPORT);
  });

  it("uses the bare article title so the root template adds the suffix once", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "ja", slug: "my-post" }) });
    expect(meta.title).toBe("My Post");
    expect(meta.alternates?.canonical).toBe("/report/my-post");
  });

  it("marks a missing article as noindex", async () => {
    mockGetReportBySlug.mockResolvedValue(null);

    const meta = await generateMetadata({ params: Promise.resolve({ locale: "ja", slug: "nope" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
