/**
 * sitemap.ts のカバレッジテスト
 */

jest.mock("../lib/s3Client", () => ({
  fetchLayoutData: jest.fn(),
}));

import { fetchLayoutData } from "../lib/s3Client";
import sitemap from "../app/sitemap";

const mockFetchLayoutData = fetchLayoutData as jest.MockedFunction<typeof fetchLayoutData>;

describe("sitemap", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns static pages + doc pages on success", async () => {
    mockFetchLayoutData.mockResolvedValue({
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
    });

    const result = await sitemap();
    // 6 static + 2 doc pages
    expect(result.length).toBe(8);
    expect(result[6].url).toContain("docs%2Ftest.md");
    expect(result[7].url).toContain("docs%2Fguide.md");
  });

  it("returns only static pages on error", async () => {
    mockFetchLayoutData.mockRejectedValue(new Error("fail"));

    const result = await sitemap();
    expect(result.length).toBe(6);
  });
});
