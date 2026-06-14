/**
 * ノート網ビューア用のフロントマター解析・編集（純粋関数・vscode 非依存）。
 *
 * - `extractNoteDoc`  : `.md` 本文 + ルート相対パスから NoteGraphDocInput を抽出
 * - `addRelatedEntry` : フロントマターの `related` に 1 件追記（本文を保存）
 *
 * 完全な YAML ではなく、ノート網に必要なフィールド（title/type/category/
 * related/tags/c4Scope/graph）に絞った軽量パーサ。
 */

import type { NoteDocInput } from './types';

const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface ParsedFrontmatter {
  scalars: Map<string, string>;
  arrays: Map<string, string[]>;
}

/** クォートと前後空白を除去する。 */
function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** インライン配列 `[a, "b"]` をパースする。空なら空配列。 */
function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => unquote(s))
    .filter((s) => s.length > 0);
}

/**
 * フロントマターブロックを必要フィールドだけ解析する。
 * フロントマターが無ければ空の結果を返す。
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const scalars = new Map<string, string>();
  const arrays = new Map<string, string[]>();
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return { scalars, arrays };

  const lines = m[1].split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    // YAML リスト項目（`  - value`）。直前のキーに属する。
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const list = arrays.get(currentKey) ?? [];
      list.push(unquote(listItem[1]));
      arrays.set(currentKey, list);
      continue;
    }

    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();
    currentKey = key;

    if (value === '') {
      // 値なし → 後続のリスト項目を待つ（配列）
      if (!arrays.has(key)) arrays.set(key, []);
      continue;
    }
    if (value.startsWith('[')) {
      arrays.set(key, parseInlineArray(value));
      continue;
    }
    scalars.set(key, unquote(value));
  }

  return { scalars, arrays };
}

/**
 * `.md` をノート網ノードへ変換する。
 *
 * @param relPath リポジトリルート相対の POSIX パス（ノード ID）
 * @param content ファイル本文
 * @returns 参加条件を満たさない場合 null（frontmatter なし / title なし / graph:false）
 */
export function extractNoteDoc(relPath: string, content: string): NoteDocInput | null {
  const { scalars, arrays } = parseFrontmatter(content);

  const title = scalars.get('title');
  if (!title) return null;

  // graph: false で明示除外
  const graphFlag = scalars.get('graph');
  if (graphFlag === 'false') return null;

  return {
    path: relPath,
    title,
    type: scalars.get('type'),
    category: scalars.get('category'),
    related: arrays.get('related'),
    tags: arrays.get('tags'),
    c4Scope: arrays.get('c4Scope'),
  };
}

/**
 * フロントマターの `related` に `target` を 1 件追記した本文を返す。
 *
 * - 既に同じ値があれば変更しない（冪等）。
 * - `related` キーが無ければ追加する。
 * - フロントマター自体が無ければ新規作成する。
 * - 本文・既存キーは保存する。
 */
export function addRelatedEntry(content: string, target: string): string {
  const m = FRONTMATTER_RE.exec(content);
  const indent = '  ';
  const entry = `${indent}- "${target}"`;

  if (!m) {
    // フロントマターなし → 新規作成
    return `---\nrelated:\n${entry}\n---\n\n${content}`;
  }

  const block = m[1];
  const { arrays } = parseFrontmatter(content);
  if (arrays.get('related')?.includes(target)) {
    return content; // 既に存在（冪等）
  }

  const blockLines = block.split(/\r?\n/);
  const relatedIdx = blockLines.findIndex((l) => /^related:\s*(\[.*\])?\s*$/.test(l) || /^related:\s*$/.test(l));

  let newBlock: string;
  if (relatedIdx === -1) {
    // related キーなし → ブロック末尾に追加
    newBlock = `${block}\nrelated:\n${entry}`;
  } else {
    // related キーの直後（既存リスト項目の後）に挿入
    let insertAt = relatedIdx + 1;
    while (insertAt < blockLines.length && /^\s*-\s+/.test(blockLines[insertAt])) {
      insertAt += 1;
    }
    // インライン配列だった場合はリスト形式へは触らず、末尾に新規 related ブロックを足さず
    // 既存キー行を YAML リストへ変換する
    if (/^related:\s*\[/.test(blockLines[relatedIdx])) {
      const existing = parseInlineArray(blockLines[relatedIdx].replace(/^related:\s*/, ''));
      const merged = [...existing, target];
      const listLines = merged.map((v) => `${indent}- "${v}"`);
      blockLines.splice(relatedIdx, 1, 'related:', ...listLines);
      newBlock = blockLines.join('\n');
    } else {
      blockLines.splice(insertAt, 0, entry);
      newBlock = blockLines.join('\n');
    }
  }

  const rebuilt = `---\n${newBlock}\n---\n`;
  return content.replace(FRONTMATTER_RE, rebuilt + (m[0].endsWith('\n') ? '' : ''));
}
