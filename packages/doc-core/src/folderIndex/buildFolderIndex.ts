/**
 * フォルダ索引（index.<lang>.md）の markdown を組み立てる純粋関数。
 *
 * 出力書式は `scripts/gen-spec-index.mjs` から移設したものと 1 バイトも変えない。
 * 既存の全索引に対して再生成しても差分が出ないことが移設の受け入れ条件のため
 * （要件書 NFR-1）、行の組み立て順・空行・記号を安易に整形し直さない。
 */

import { RELATION_TYPES, DEFAULT_RELATION_TYPE, type RelationType } from '../relations';

/** 索引に載せる 1 文書分のエントリ。 */
export interface FolderIndexEntry {
  /** ファイル名（リンク先。フォルダ相対） */
  readonly name: string;
  readonly title: string;
  /** 未指定は空文字（索引ではバッククォート表示を省く） */
  readonly category: string;
  /** 未指定は空文字（索引では行ごと省く） */
  readonly excerpt: string;
  readonly related: readonly { readonly to: string; readonly type: RelationType }[];
}

/** 直下サブフォルダ（再帰 md 件数つき）。 */
export interface FolderIndexChild {
  readonly name: string;
  readonly count: number;
}

export interface BuildFolderIndexInput {
  /** 表示用のパス（例: 設計書/80.manual） */
  readonly titlePath: string;
  readonly lang: string;
  /** frontmatter に埋める生成日（YYYY-MM-DD） */
  readonly date: string;
  readonly entries: readonly FolderIndexEntry[];
  readonly children: readonly FolderIndexChild[];
}

/** 索引を走査しやすく保つため excerpt を 1 行・上限長へ切り詰める。 */
export function truncateExcerpt(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1).trimEnd() + '…' : oneLine;
}

/** related を `type→target` の短い列挙へ整形する。既定型は型名を省く。 */
export function formatRelated(
  related: readonly { readonly to: string; readonly type: RelationType }[],
): string {
  if (!related.length) return '';
  return related
    .map((r) => (r.type === DEFAULT_RELATION_TYPE ? r.to : `${r.type} → ${r.to}`))
    .join('; ');
}

/** 1 フォルダの索引 markdown を生成する（末尾改行は呼び出し側が付ける）。 */
export function buildFolderIndexMarkdown({
  titlePath,
  lang,
  date,
  entries,
  children,
}: BuildFolderIndexInput): string {
  const total = entries.length + children.reduce((s, c) => s + c.count, 0);
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: "${titlePath} 索引（自動生成）"`);
  lines.push(`date: "${date}"`);
  lines.push('type: "reference"');
  lines.push(`lang: "${lang}"`);
  lines.push('graph: false');
  lines.push(
    `excerpt: "${titlePath} 配下の frontmatter から自動生成したフォルダ索引（OKF 段階開示）。サブフォルダ索引と直下文書への入口。"`,
  );
  lines.push('---');
  lines.push('');
  lines.push(`# ${titlePath} 索引（自動生成）`);
  lines.push('');
  lines.push('> このファイルは `scripts/gen-spec-index.mjs` が frontmatter から生成する。手で編集しない。');
  lines.push(
    `> 関係は各ファイルの frontmatter \`related\`（型付き）が単一ソース。型: ${RELATION_TYPES.join(' / ')}。`,
  );
  lines.push('');
  lines.push(`総数: ${total} 件`);
  lines.push('');

  if (children.length) {
    lines.push('## サブフォルダ');
    lines.push('');
    for (const c of children) {
      lines.push(`- [${c.name}/](${c.name}/index.${lang}.md) — ${c.count} 件`);
    }
    lines.push('');
  }

  if (entries.length) {
    lines.push('## 文書');
    lines.push('');
    for (const e of entries) {
      const cat = e.category ? ` \`${e.category}\`` : '';
      lines.push(`### [${e.title}](${e.name})${cat}`);
      lines.push('');
      if (e.excerpt) {
        lines.push(truncateExcerpt(e.excerpt));
        lines.push('');
      }
      const rel = formatRelated(e.related);
      if (rel) {
        lines.push(`関連: ${rel}`);
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}
