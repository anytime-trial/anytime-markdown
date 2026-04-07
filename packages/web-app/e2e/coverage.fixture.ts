import { test as base } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Playwright transforms TS to CJS, so __dirname is available at runtime
const V8_COV_DIR = join(__dirname, "..", ".v8-coverage");

interface CoverageEntry {
  url: string;
  source?: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{
      startOffset: number;
      endOffset: number;
      count: number;
    }>;
    isBlockCoverage: boolean;
  }>;
}

interface CoverageWithSourceMap extends CoverageEntry {
  sourceMapJson?: string;
}

/** Include only project source chunks from Turbopack */
function shouldFetchSourceMap(url: string): boolean {
  if (!url.includes("_next/static/chunks/packages_")) return false;
  if (url.includes("node_modules")) return false;
  return true;
}

export const test = base.extend<object>({
  page: async ({ page, browserName }, use, testInfo) => {
    const isChromium = browserName === "chromium";
    if (isChromium) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }
    await use(page);
    if (isChromium) {
      const coverage = await page.coverage.stopJSCoverage();
      if (coverage.length === 0) return;

      // Fetch source maps while dev server is still running
      const enriched: CoverageWithSourceMap[] = [];
      for (const entry of coverage as CoverageEntry[]) {
        const enrichedEntry: CoverageWithSourceMap = { ...entry };
        if (
          shouldFetchSourceMap(entry.url) &&
          entry.source &&
          entry.source.length >= 500
        ) {
          try {
            const res = await page.evaluate(
              (url) =>
                fetch(`${url}.map`)
                  .then((r) => (r.ok ? r.text() : null))
                  .catch(() => null),
              entry.url,
            );
            if (res) enrichedEntry.sourceMapJson = res;
          } catch {
            // Page may have navigated
          }
        }
        enriched.push(enrichedEntry);
      }

      await mkdir(V8_COV_DIR, { recursive: true });
      const fileName = `${testInfo.testId}.json`;
      await writeFile(join(V8_COV_DIR, fileName), JSON.stringify(enriched));
    }
  },
});

export { expect } from "@playwright/test";
