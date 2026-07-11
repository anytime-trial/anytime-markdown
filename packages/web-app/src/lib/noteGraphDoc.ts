/**
 * GitHub 上の `.md` 本文 → ノート網ノード入力（{@link NoteGraphDocInput}）への変換。
 *
 * web-app には YAML パーサ依存が無いため、`/api/docs-index` の c4Scope パーサと同じく
 * frontmatter を手書きで走査する。ノート網に必要な `title` / `type` / `related` のみ抽出する。
 * `related` は `buildNoteGraph` 側が実行時に正規化するため、生の {@link NoteRelatedEntry}[]
 * （素の文字列 or `{ to, type }`）をそのまま返す。
 */

import type { NoteGraphDocInput, NoteRelatedEntry } from "@anytime-markdown/graph-core";

function trimQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function indentOf(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n += 1;
  return n;
}

function shortName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

/** frontmatter（`---` 区切り）の中身の行配列を返す。frontmatter が無ければ null。 */
function frontmatterLines(raw: string): string[] | null {
  const lines = raw.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return null;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") return lines.slice(1, i);
  }
  return null;
}

/** トップレベルのスカラーキー（`key: value`）を1つ取り出す。無ければ null。 */
function scalar(fmLines: readonly string[], key: string): string | null {
  for (const line of fmLines) {
    if (indentOf(line) !== 0) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}:`)) {
      return trimQuotes(trimmed.slice(key.length + 1));
    }
  }
  return null;
}

/** インラインフロー `[a, b, c]` を文字列エントリへ。 */
function parseInlineList(afterColon: string): NoteRelatedEntry[] {
  const start = afterColon.indexOf("[");
  const end = afterColon.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  return afterColon
    .slice(start + 1, end)
    .split(",")
    .map(trimQuotes)
    .filter(Boolean);
}

/** ブロックリストの `- ...` 行を1件解釈し、以降 `type:` を紐付ける対象オブジェクトを返す。 */
function parseBlockListItem(item: string, out: NoteRelatedEntry[]): { to: string; type?: string } | null {
  const to = /^to:\s*(.+)$/.exec(item);
  if (to) {
    const entry = { to: trimQuotes(to[1]) };
    out.push(entry);
    return entry;
  }
  // `to` 以外のマッピングキー始まり（想定外）は無視。素の文字列はそのまま採用。
  if (/^[A-Za-z_][\w-]*:\s/.test(item)) return null;
  out.push(trimQuotes(item));
  return null;
}

/** `related:` 直下のブロックリスト（baseIndent より深い行）をパースする。 */
function parseBlockList(fmLines: readonly string[], startIdx: number, baseIndent: number): NoteRelatedEntry[] {
  const out: NoteRelatedEntry[] = [];
  let current: { to: string; type?: string } | null = null;
  for (let i = startIdx; i < fmLines.length; i += 1) {
    const line = fmLines[i];
    if (line.trim() === "") continue;
    if (indentOf(line) <= baseIndent) break; // dedent → ブロック終端
    const t = line.trim();
    if (t.startsWith("- ")) {
      current = parseBlockListItem(t.slice(2).trim(), out);
    } else if (current) {
      const type = /^type:\s*(.+)$/.exec(t);
      if (type) current.type = trimQuotes(type[1]);
    }
  }
  return out;
}

/**
 * frontmatter から `related` を {@link NoteRelatedEntry}[] として抽出する。
 * 対応記法: スカラー / インラインフロー `[...]` / ブロックリスト（素文字列・`{ to, type }` 2 行）。
 *
 * SHORTCUT: インラインフロー内の型付きオブジェクト（`related: [{to: x, type: y}]`）は非対応で
 * 文字列として素通しする. ceiling: フロー記法は型なし参照のみ. upgrade: フロー内型付きを使う運用が出たら flow マップをパースする.
 */
export function parseRelated(fmLines: readonly string[]): NoteRelatedEntry[] {
  const idx = fmLines.findIndex((l) => indentOf(l) === 0 && l.trim().startsWith("related:"));
  if (idx < 0) return [];
  const header = fmLines[idx];
  const afterColon = header.slice(header.indexOf("related:") + "related:".length).trim();

  if (afterColon.startsWith("[")) return parseInlineList(afterColon);
  if (afterColon.length > 0) {
    const v = trimQuotes(afterColon);
    return v ? [v] : [];
  }

  return parseBlockList(fmLines, idx + 1, indentOf(header));
}

/**
 * `.md` 本文をノート網ノード入力へ変換する。参加条件を満たさなければ null。
 *
 * VS Code 拡張の `extractNoteDoc` とパリティを取る:
 * frontmatter なし / `title` なし / `graph: false` は非参加（null）。
 *
 * @param path リポジトリルート相対の POSIX パス（ノード ID）
 */
export function parseNoteGraphDoc(raw: string, path: string): NoteGraphDocInput | null {
  const fm = frontmatterLines(raw);
  if (!fm) return null;
  if (scalar(fm, "graph") === "false") return null;
  const title = scalar(fm, "title");
  if (!title) return null;
  const type = scalar(fm, "type") ?? undefined;
  const related = parseRelated(fm);
  return { path, title, type, related };
}

export { shortName as noteGraphShortName };
