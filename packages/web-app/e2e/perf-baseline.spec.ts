import { expect, type Locator, type Page, test } from '@playwright/test';

const TRAIL_URL = '/trail';
const RUNS = 5;

interface RunResult {
  label: string;
  ms: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tabByNames(page: Page, names: readonly string[]): Locator {
  return page.getByRole('tab', { name: new RegExp(`^(${names.join('|')})$`) });
}

async function openTrail(page: Page): Promise<void> {
  await page.goto(TRAIL_URL);
  // TrailViewer は dynamic(ssr:false) + WASM sql.js 初期化 + データ取得で初回マウントが重く、
  // 既定 expect timeout(5s) を超えることがある。タブ出現は明示的に長めに待つ（perf 計測本体は別途）。
  await expect(tabByNames(page, ['Activity', 'Analytics'])).toBeVisible({ timeout: 30_000 });
}

async function selectTab(page: Page, names: readonly string[]): Promise<string | null> {
  const tab = tabByNames(page, names);
  if (await tab.count() === 0) return null;
  const label = (await tab.first().textContent())?.trim() ?? names[0];
  await tab.first().click();
  await expect(tab.first()).toHaveAttribute('aria-selected', 'true');
  return label;
}

test.describe('trail-viewer perf baseline', () => {
  test.describe.configure({ timeout: 120_000 });

  test('tab switch: Activity ↔ Messages ↔ Releases ↔ C4 Model', async ({ page }) => {
    await openTrail(page);

    const candidateTabs = [
      ['Messages'],
      ['Releases'],
      ['C4 Model', 'Model'],
      ['Activity', 'Analytics'],
    ];
    const tabs: string[][] = [];
    for (const names of candidateTabs) {
      if (await tabByNames(page, names).count()) tabs.push(names);
    }

    const results: RunResult[] = [];
    for (let run = 0; run < RUNS; run++) {
      for (const tabNames of tabs) {
        const start = performance.now();
        const label = await selectTab(page, tabNames);
        if (!label) continue;
        results.push({ label: `tab:${label}:run${run}`, ms: Math.round(performance.now() - start) });
      }
    }

    for (const tab of [...new Set(results.map((r) => r.label.split(':')[1]))]) {
      const times = results
        .filter((r) => r.label.startsWith(`tab:${tab}:`))
        .map((r) => r.ms);
      console.log(`[PERF] tab=${tab} median=${median(times)}ms samples=${times.join(',')}`);
    }
  });

  test('session select -> MessageTimeline render', async ({ page }) => {
    await openTrail(page);

    const times: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      await selectTab(page, ['Messages']);

      const firstSession = page.locator('[data-testid="session-row"]').first();
      const hasSession = await firstSession.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
      test.skip(!hasSession, 'No session rows were available; check Supabase/API connectivity.');

      const start = performance.now();
      await firstSession.click();
      await page.waitForSelector('[data-testid="message-timeline"]', { state: 'visible' });
      times.push(Math.round(performance.now() - start));
    }

    console.log(`[PERF] sessionSelect median=${median(times)}ms samples=${times.join(',')}`);
  });

  test('chart switch: CombinedCharts kinds', async ({ page }) => {
    await openTrail(page);
    await selectTab(page, ['Activity', 'Analytics']);

    const hasCharts = await page.locator('[data-chart-kind]').first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    test.skip(!hasCharts, 'Combined chart controls were not available; check analytics API connectivity.');

    const charts = ['commits', 'tools', 'errors', 'models', 'agents', 'skills', 'repos', 'leadTime'];
    const results: RunResult[] = [];

    for (let run = 0; run < RUNS; run++) {
      for (const kind of charts) {
        if (kind === 'leadTime') {
          await page.locator('[data-chart-kind="commits"]').click();
          await page.waitForTimeout(50);
        }

        const btn = page.locator(`[data-chart-kind="${kind}"]`);
        if (await btn.count() === 0) continue;

        const start = performance.now();
        await btn.click();
        await page.waitForTimeout(50);
        results.push({ label: `chart:${kind}:run${run}`, ms: Math.round(performance.now() - start) });
      }
    }

    for (const kind of charts) {
      const times = results
        .filter((r) => r.label.startsWith(`chart:${kind}:`))
        .map((r) => r.ms);
      if (times.length === 0) continue;
      console.log(`[PERF] chart=${kind} median=${median(times)}ms samples=${times.join(',')}`);
    }
  });
});
