/**
 * Additional coverage for s3Client.ts - fetchFromCdn, fetchLayoutData
 */

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((params) => params),
}));

// Set env vars before import
process.env.CLOUDFRONT_DOCS_URL = "https://cdn.example.com/docs";
process.env.S3_DOCS_BUCKET = "test-bucket";
process.env.S3_DOCS_PREFIX = "docs/";

import { fetchFromCdn, fetchLayoutData, CLOUDFRONT_URL, DOCS_BUCKET } from "../lib/s3Client";

describe("s3Client", () => {
  describe("fetchFromCdn", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = jest.fn();
    });

    it("returns text on successful fetch", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("file content"),
      });

      const result = await fetchFromCdn("docs/test.md");
      expect(result).toBe("file content");
    });

    it("returns null for non-ok response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await fetchFromCdn("docs/test.md");
      expect(result).toBeNull();
    });

    it("rejects path traversal attempts", async () => {
      const result = await fetchFromCdn("../secret.md");
      expect(result).toBeNull();
    });

    it("rejects protocol injection", async () => {
      const result = await fetchFromCdn("http://evil.com/bad");
      expect(result).toBeNull();
    });

    it("rejects null bytes", async () => {
      const result = await fetchFromCdn("test\0.md");
      expect(result).toBeNull();
    });
  });

  describe("fetchLayoutData", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns categories from S3", async () => {
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToString: () =>
            Promise.resolve(JSON.stringify({
              categories: [
                { title: "Cat2", order: 2 },
                { title: "Cat1", order: 1 },
              ],
            })),
        },
      });

      const result = await fetchLayoutData();
      expect(result.categories.length).toBe(2);
      expect(result.categories[0].title).toBe("Cat1");
      expect(result.categories[1].title).toBe("Cat2");
    });

    it("returns empty categories when body is empty", async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: () => Promise.resolve("") },
      });

      const result = await fetchLayoutData();
      expect(result.categories).toEqual([]);
    });

    it("returns empty categories when Body is null", async () => {
      mockSend.mockResolvedValueOnce({ Body: null });

      const result = await fetchLayoutData();
      expect(result.categories).toEqual([]);
    });

    it("returns empty categories on NoSuchKey error", async () => {
      const err = new Error("NoSuchKey");
      err.name = "NoSuchKey";
      mockSend.mockRejectedValueOnce(err);

      const result = await fetchLayoutData();
      expect(result.categories).toEqual([]);
    });

    it("throws on other errors", async () => {
      mockSend.mockRejectedValueOnce(new Error("NetworkError"));

      await expect(fetchLayoutData()).rejects.toThrow("NetworkError");
    });
  });
});
