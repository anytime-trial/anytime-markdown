import { expect, type Locator, type Page, test } from '@playwright/test';
import { localePath } from "./helpers";

const TRAIL_URL = localePath('/trail');
const COLD_RUNS = 3;
const WARM_RUNS = 5;

function tabByNames(page: Page, names: readonly string[]): Locator {
  return page.getByRole('tab', { name: new RegExp(`^(${names.join('|')})$`) });
}

function summarize(label: string, kind: 'COLD' | 'WARM', samples: readonly number[]): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  console.log(
    `[PERF-${kind}] tab=${label} min=${min} median=${median} max=${max} samples=${samples.join(',')}`,
  );
}

async function selectAndAwait(tab: Locator): Promise<void> {
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
}

test.describe('trail-viewer prefetch effect', () => {
  test('cold tab switch (各 run で fresh page、初回切替の時間)', async ({ page, context }) => {
    test.setTimeout(180_000);
    const candidateTabs = [
      ['Activity', 'Analytics'],
      ['Messages'],
      ['C4 Model', 'Model'],
      ['Releases'],
    ];

    const results: Record<string, number[]> = {};

    for (let run = 0; run < COLD_RUNS; run++) {
      await context.clearCookies();
      await page.goto(TRAIL_URL, { waitUntil: 'domcontentloaded' });
      await expect(tabByNames(page, ['Activity', 'Analytics'])).toBeVisible({ timeout: 15_000 });

      for (const names of candidateTabs) {
        const tab = tabByNames(page, names);
        if ((await tab.count()) === 0) continue;
        const label = ((await tab.first().textContent()) ?? names[0]).trim();
        const start = Date.now();
        await selectAndAwait(tab.first());
        const ms = Date.now() - start;
        (results[label] ??= []).push(ms);
      }
    }

    for (const [label, samples] of Object.entries(results)) {
      summarize(label, 'COLD', samples);
    }
  });

  test('warm tab switch with hover preload', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(TRAIL_URL, { waitUntil: 'domcontentloaded' });
    await expect(tabByNames(page, ['Activity', 'Analytics'])).toBeVisible({ timeout: 15_000 });

    const candidateTabs = [
      ['Activity', 'Analytics'],
      ['Messages'],
      ['C4 Model', 'Model'],
    ];

    const results: Record<string, number[]> = {};

    for (let run = 0; run < WARM_RUNS; run++) {
      const homeTab = tabByNames(page, ['Releases']);
      if ((await homeTab.count()) > 0) {
        await selectAndAwait(homeTab.first());
      }

      for (const names of candidateTabs) {
        const tab = tabByNames(page, names);
        if ((await tab.count()) === 0) continue;
        const label = ((await tab.first().textContent()) ?? names[0]).trim();
        await tab.first().hover();
        await page.waitForTimeout(150);

        const start = Date.now();
        await selectAndAwait(tab.first());
        const ms = Date.now() - start;
        (results[label] ??= []).push(ms);
      }
    }

    for (const [label, samples] of Object.entries(results)) {
      summarize(label, 'WARM', samples);
    }
  });
});
