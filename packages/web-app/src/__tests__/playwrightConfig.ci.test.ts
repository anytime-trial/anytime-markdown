/**
 * @jest-environment node
 */
/**
 * What: CI の Playwright 構成で、a11y ratchet（e2e/a11y.spec.ts）は chromium だけで走らせる。
 *
 * 基線 `e2e/a11y-baseline.json` は chromium の走査で seed したブラウザ非依存の値で、
 * firefox / webkit は同じページでも別の違反（`select-name` / `aria-prohibited-attr` 等）を報告し、
 * master の Daily Build Check を 2026-09-29 以降連日赤くした。VR 基準（visual-baseline /
 * chart-fence-vr）と同じく、基線を持つ spec は基線を取ったブラウザだけで判定する。
 */
import type { PlaywrightTestConfig, Project } from "@playwright/test";

const A11Y_SPEC = "e2e/a11y.spec.ts";
const UNRELATED_SPEC = "e2e/toolbar.spec.ts";

function loadCiConfig(): PlaywrightTestConfig {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("../../playwright.config") as { default: PlaywrightTestConfig }).default;
}

function projectNamed(config: PlaywrightTestConfig, name: string): Project {
  const project = config.projects?.find((p) => p.name === name);
  if (!project) throw new Error(`project ${name} が CI 構成に無い`);
  return project;
}

function ignores(project: Project, file: string): boolean {
  const raw = project.testIgnore;
  const patterns = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return patterns.some((p) => (p instanceof RegExp ? p.test(file) : p === file));
}

describe("playwright.config（CI）", () => {
  const originalCi = process.env.CI;
  let config: PlaywrightTestConfig;

  beforeAll(() => {
    process.env.CI = "1";
    config = loadCiConfig();
  });

  afterAll(() => {
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
  });

  it("firefox / webkit は a11y ratchet を走らせない", () => {
    expect(ignores(projectNamed(config, "firefox"), A11Y_SPEC)).toBe(true);
    expect(ignores(projectNamed(config, "webkit"), A11Y_SPEC)).toBe(true);
  });

  it("chromium は a11y ratchet を走らせる", () => {
    expect(ignores(projectNamed(config, "chromium"), A11Y_SPEC)).toBe(false);
  });

  it("除外は基線を持つ spec に限り、他の spec は 3 ブラウザとも走る", () => {
    for (const name of ["chromium", "firefox", "webkit"]) {
      expect(ignores(projectNamed(config, name), UNRELATED_SPEC)).toBe(false);
    }
  });
});
