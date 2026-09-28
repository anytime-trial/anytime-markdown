/**
 * axe 違反の ratchet（逆戻り防止）判定。
 *
 * design.md 11.4「開発サイクルでの検証」の実行時検査に対応する純粋関数。
 * 基線（ページ × ルール → 許容ノード数）と今回の走査結果を突き合わせ、
 * 許容を超えた違反を回帰、減った違反を改善として返す。次の基線は「現状と基線の
 * 小さい方」だけを取り、回帰を取り込まない（基線を手で増やさない原則）。
 *
 * Playwright の spec（e2e/a11y.spec.ts）と jest の両方から使うため DOM / axe に依存しない。
 */

/** ページ（パス）→ ルール id → 許容する違反ノード数 */
export type A11yBaseline = Record<string, Record<string, number>>;

export interface A11yViolationSummary {
  readonly id: string;
  /** axe の impact（minor / moderate / serious / critical）。無い場合は null */
  readonly impact: string | null;
  /** 違反ノード数 */
  readonly nodes: number;
}

export interface A11yScanResult {
  readonly page: string;
  readonly violations: readonly A11yViolationSummary[];
}

export interface A11yRegression {
  readonly page: string;
  readonly id: string;
  readonly impact: string | null;
  readonly nodes: number;
  readonly allowed: number;
}

export interface A11yImprovement {
  readonly page: string;
  readonly id: string;
  readonly nodes: number;
  readonly allowed: number;
}

export interface A11yRatchetResult {
  /** 回帰が 0 件なら true */
  readonly ok: boolean;
  readonly regressions: readonly A11yRegression[];
  readonly improvements: readonly A11yImprovement[];
  /**
   * 改善分だけ縮めた基線。回帰と 0 件のルールは含まない。
   * 走査したページは違反 0 でもキー（空オブジェクト）を残す。キーの有無が「既知のページか」を
   * 表し、seedBaselineForNewPages が既存ページを新ページとして取り込み直すのを防ぐ。
   */
  readonly nextBaseline: A11yBaseline;
}

const byKey = <T extends { page: string; id: string }>(a: T, b: T): number =>
  a.page.localeCompare(b.page) || a.id.localeCompare(b.id);

export function ratchetA11y(baseline: A11yBaseline, scans: readonly A11yScanResult[]): A11yRatchetResult {
  const regressions: A11yRegression[] = [];
  const improvements: A11yImprovement[] = [];
  const nextBaseline: A11yBaseline = {};

  // 走査しなかったページの基線は判定できないので、そのまま引き継ぐ
  const scannedPages = new Set(scans.map((s) => s.page));
  for (const [page, rules] of Object.entries(baseline)) {
    if (!scannedPages.has(page)) nextBaseline[page] = { ...rules };
  }

  for (const scan of scans) {
    const allowedRules = baseline[scan.page] ?? {};
    const current = new Map<string, A11yViolationSummary>();
    for (const v of scan.violations) {
      const prev = current.get(v.id);
      current.set(v.id, prev ? { ...prev, nodes: prev.nodes + v.nodes } : v);
    }

    const next: Record<string, number> = {};
    for (const v of current.values()) {
      const allowed = allowedRules[v.id] ?? 0;
      if (v.nodes > allowed) {
        regressions.push({ page: scan.page, id: v.id, impact: v.impact, nodes: v.nodes, allowed });
        if (allowed > 0) next[v.id] = allowed;
      } else {
        if (v.nodes < allowed) improvements.push({ page: scan.page, id: v.id, nodes: v.nodes, allowed });
        if (v.nodes > 0) next[v.id] = v.nodes;
      }
    }
    for (const [id, allowed] of Object.entries(allowedRules)) {
      if (!current.has(id) && allowed > 0) {
        improvements.push({ page: scan.page, id, nodes: 0, allowed });
      }
    }
    nextBaseline[scan.page] = next;
  }

  regressions.sort(byKey);
  improvements.sort(byKey);
  return { ok: regressions.length === 0, regressions, improvements, nextBaseline };
}

export function formatRatchetReport(result: A11yRatchetResult): string {
  const lines: string[] = [];
  lines.push(`a11y ratchet: regressions: ${result.regressions.length}, improvements: ${result.improvements.length}`);
  if (result.regressions.length === 0 && result.improvements.length === 0) {
    lines.push("clean (no change against baseline)");
  }
  for (const r of result.regressions) {
    lines.push(`- ${r.page} ${r.id} (${r.impact ?? "unknown"}): ${r.nodes} nodes, allowed ${r.allowed}`);
  }
  for (const i of result.improvements) {
    lines.push(`- ${i.page} ${i.id}: ${i.nodes} nodes, allowed ${i.allowed}`);
  }
  return lines.join("\n");
}

/**
 * 基線に無いページの現状を取り込む（走査対象へページを足した時の 1 回だけの初期化）。
 * 既存ページ（違反 0 で空オブジェクトになったページを含む）のエントリは増やさない。
 * 基線を手で増やさない原則の唯一の入口。
 */
export function seedBaselineForNewPages(baseline: A11yBaseline, scans: readonly A11yScanResult[]): A11yBaseline {
  const seeded: A11yBaseline = { ...baseline };
  for (const scan of scans) {
    if (scan.page in seeded) continue;
    const rules: Record<string, number> = {};
    for (const v of scan.violations) {
      if (v.nodes > 0) rules[v.id] = (rules[v.id] ?? 0) + v.nodes;
    }
    seeded[scan.page] = rules;
  }
  return seeded;
}
