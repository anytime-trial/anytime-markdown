import type { ReportMeta } from '../types/report';

/** frontmatter の YAML ブロックを解析する軽量パーサー */
export function parseFrontmatter(markdown: string): { data: Record<string, string>; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) return { data: {}, content: markdown };

  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    // 引用符を除去
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, content: match[2] };
}

/** ReportMeta[] を日付降順でソートする */
export function sortByDateDesc(reports: ReportMeta[]): ReportMeta[] {
  return [...reports].sort((a, b) => b.date.localeCompare(a.date));
}

/** ページネーション */
export function paginate<T>(items: T[], page: number, perPage: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * perPage;
  return { items: items.slice(start, start + perPage), totalPages };
}

/** 月別アーカイブを構築する（降順） */
export function buildArchiveMonths(reports: ReportMeta[]): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of reports) {
    // date: "2026-03-27" → "2026-03"
    const month = r.date.slice(0, 7);
    if (month.length === 7) {
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, count]) => ({ month, count }));
}

/** 前後の記事を取得する */
export function buildNavigation(
  reports: ReportMeta[],
  currentSlug: string,
): { prev: ReportMeta | null; next: ReportMeta | null } {
  const sorted = sortByDateDesc(reports);
  const idx = sorted.findIndex((r) => r.slug === currentSlug);
  if (idx === -1) return { prev: null, next: null };
  // 降順リストなので: prev = 古い方（idx+1）、next = 新しい方（idx-1）
  return {
    prev: sorted[idx + 1] ?? null,
    next: sorted[idx - 1] ?? null,
  };
}
