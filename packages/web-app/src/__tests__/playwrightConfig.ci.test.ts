/**
 * @jest-environment node
 */
/**
 * What: CI の Playwright 構成で、a11y ratchet（e2e/a11y.spec.ts）は chromium だけで走らせる。
 *
 * 基線 `e2e/a11y-baseline.json` は chromium の走査結果に固定された値で、firefox / webkit は同じページでも
 * 別の違反（`select-name` / `aria-prohibited-attr` 等）を報告し、master の Daily Build Check を
 * 2026-09-29 以降連日赤くした（https://github.com/anytime-trial/anytime-markdown/actions/runs/36645792190）。
 * VR 基準（visual-baseline / chart-fence-vr）と同じく、基線を持つ spec は基線を取ったブラウザだけで判定する。
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import type { PlaywrightTestConfig, Project } from "@playwright/test";

const A11Y_SPEC = "e2e/a11y.spec.ts";
const UNRELATED_SPEC = "e2e/toolbar.spec.ts";
/** 基線を持つ spec（chromium 以外では判定しない）。増やすときは基線の取り方を先に決める */
const CHROMIUM_ONLY_SPECS = ["a11y.spec.ts", "chart-fence-vr.spec.ts", "visual-baseline.spec.ts"];
const E2E_DIR = join(__dirname, "..", "..", "e2e");

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

  it("firefox / webkit が除外する spec は e2e/ の実ファイルのうち基線を持つ 3 件と一致する", () => {
    const specs = readdirSync(E2E_DIR).filter((f) => f.endsWith(".spec.ts"));
    expect(specs.length).toBeGreaterThan(CHROMIUM_ONLY_SPECS.length);
    for (const name of ["firefox", "webkit"]) {
      const project = projectNamed(config, name);
      const ignored = specs.filter((f) => ignores(project, join(E2E_DIR, f))).sort();
      expect(ignored).toEqual(CHROMIUM_ONLY_SPECS);
    }
  });
});
