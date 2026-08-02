import { fetchAndConvert } from "../webImport/importWebPage";
import type { WebImportProvider } from "../webImport/webImportProvider";

const now = new Date("2026-06-27T00:00:00.000Z");

describe("fetchAndConvert", () => {
  it("fetches through provider and returns WebImportResult", async () => {
    const provider: WebImportProvider = {
      fetch: jest.fn().mockResolvedValue({
        html: "<html><head><title>Fetched</title></head><body><article><h1>Fetched</h1><p>Body text.</p></article></body></html>",
        finalUrl: "https://example.com/final",
      }),
    };

    const result = await fetchAndConvert("example.com/source", provider, now);

    expect(provider.fetch).toHaveBeenCalledWith("https://example.com/source");
    expect(result).toEqual(
      expect.objectContaining({
        title: "Fetched",
        sourceUrl: "https://example.com/final",
        fetchedAt: "2026-06-27T00:00:00.000Z",
      }),
    );
    expect(result.markdownBody).toContain("Body text.");
  });

  it("rejects invalid URLs", async () => {
    const provider: WebImportProvider = {
      fetch: jest.fn(),
    };

    await expect(fetchAndConvert("not a url", provider, now)).rejects.toThrow(
      "invalid url: not a url",
    );
    expect(provider.fetch).not.toHaveBeenCalled();
  });

  it("propagates provider fetch failures", async () => {
    const error = new Error("network failed");
    const provider: WebImportProvider = {
      fetch: jest.fn().mockRejectedValue(error),
    };

    await expect(fetchAndConvert("https://example.com", provider, now)).rejects.toBe(error);
  });
});
