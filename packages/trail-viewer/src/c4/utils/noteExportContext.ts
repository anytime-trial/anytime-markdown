import type { C4Element } from '@anytime-markdown/trail-core/c4';

/** Markdown テーブルセル用に値を無害化する（パイプのエスケープ・改行の畳み込み） */
export function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
}

/**
 * 「Agent Note に出力」で送る要素情報表（Markdown）を組み立てる。
 * 出力仕様は note-page-export.ja.md §3.2 のコンテキスト節。
 */
export function buildElementContextMarkdown(elem: C4Element, c4Id: string, repo: string | null): string {
  const rows = [
    '| 項目 | 値 |',
    '| --- | --- |',
    `| 要素 ID | \`${c4Id}\` |`,
    `| 名前 | ${escapeTableCell(elem.name)} |`,
    `| 種別 | ${elem.type} |`,
  ];
  if (elem.description) rows.push(`| 説明 | ${escapeTableCell(elem.description)} |`);
  if (repo) rows.push(`| リポジトリ | ${escapeTableCell(repo)} |`);
  return rows.join('\n');
}
