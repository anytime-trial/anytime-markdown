/**
 * ノート網ビューア用のフロントマター解析・編集（純粋関数・vscode 非依存）。
 *
 * - `extractNoteDoc`  : `.md` 本文 + ルート相対パスから NoteDocInput を抽出
 * - `addRelatedEntry` : フロントマターの `related` に型付き 1 件を追記（本文を保存）
 *
 * 解析は gray-matter（memory-core と同一の 4.0.3）へ統一し、CRLF・quoting・
 * インライン配列・ネストマッピングの取りこぼしを避ける。書込は full reserialize を
 * せず、related エントリを既存テキストへサージカルに追記して diff 汚染とキー順喪失を防ぐ。
 */

import matter from 'gray-matter';
import { coerceRelationType, type RelatedRef, type RelationType } from './relations';
import type { NoteDocInput } from './types';
import { extractBodyLinks } from './bodyLinks';

const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** YAML 偽値（graph 除外フラグ）。boolean・文字列の両表現を受ける。 */
const GRAPH_FALSE_VALUES = new Set(['false', 'no', 'off', '0']);

/**
 * リポジトリルート相対の安全なパスか判定する。
 * 絶対パス・ドライブレター・`..` セグメントを含むものはリポジトリ外を指しうるため拒否する。
 * （`related` 経由のパストラバーサルに対する第一防御）
 */
export function isSafeRelPath(p: string): boolean {
  if (!p) return false;
  if (p.includes('\0')) return false;
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(p)) return false;
  return !p.split(/[\\/]/).includes('..');
}

/**
 * gray-matter の `data.related` を正規化済み {@link RelatedRef}[] へ変換する。
 *
 * - 素の文字列 = `{ to, type: 'references' }`（型なし後方互換）
 * - `{ to, type }` オブジェクト = 型を {@link coerceRelationType} で正規化（未知型は references フォールバック＋警告）
 * - `to` が安全でないパス（traversal / 絶対）のエントリは除外する
 */
function normalizeRelatedData(raw: unknown): RelatedRef[] {
  if (!Array.isArray(raw)) return [];
  const out: RelatedRef[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (isSafeRelPath(entry)) out.push({ to: entry, type: 'references' });
    } else if (entry && typeof entry === 'object' && typeof (entry as { to?: unknown }).to === 'string') {
      const to = (entry as { to: string }).to;
      if (isSafeRelPath(to)) out.push({ to, type: coerceRelationType((entry as { type?: unknown }).type) });
    }
  }
  return out;
}

function toStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function toStrArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v.filter((x): x is string => typeof x === 'string');
  return arr.length > 0 ? arr : undefined;
}

/**
 * `.md` をノート網ノードへ変換する。
 *
 * @param relPath リポジトリルート相対の POSIX パス（ノード ID）
 * @param content ファイル本文
 * @returns 参加条件を満たさない場合 null（frontmatter なし / title なし / graph:false / YAML 構文エラー）
 */
export function extractNoteDoc(relPath: string, content: string): NoteDocInput | null {
  let data: { [key: string]: unknown };
  try {
    data = matter(content).data as { [key: string]: unknown };
  } catch {
    // YAML 構文エラーはノード化せずスキップ（呼び出し側 scan がパス込みでログする）
    return null;
  }

  const rawTitle = data.title;
  const title =
    typeof rawTitle === 'string' ? rawTitle : typeof rawTitle === 'number' ? String(rawTitle) : undefined;
  if (!title) return null;

  // graph: false / no / off で明示除外（YAML boolean / 文字列の両対応）
  if (data.graph !== undefined && GRAPH_FALSE_VALUES.has(String(data.graph).toLowerCase())) return null;

  // related はリポジトリ外を指しうる値（絶対パス・`..`）を除外しつつ型付きへ正規化する
  const related = normalizeRelatedData(data.related);

  // 本文の .md リンク（生 target。解決は scan 側で既知ノード集合を使って行う）
  const bodyLinks = extractBodyLinks(content);

  return {
    path: relPath,
    title,
    type: toStr(data.type),
    category: toStr(data.category),
    related: related.length > 0 ? related : undefined,
    bodyLinks: bodyLinks.length > 0 ? bodyLinks : undefined,
    tags: toStrArray(data.tags),
    c4Scope: toStrArray(data.c4Scope),
  };
}

/** 1 件の related エントリを YAML 行へ描画する。references は素の文字列、型付きはオブジェクト形式。 */
function relatedEntryLines(ref: RelatedRef, indent: string): string[] {
  if (ref.type === 'references') return [`${indent}- "${ref.to}"`];
  return [`${indent}- to: "${ref.to}"`, `${indent}  type: ${ref.type}`];
}

/** content から正規化済みの既存 related を取り出す（gray-matter 解析）。 */
function existingRelated(content: string): RelatedRef[] {
  try {
    return normalizeRelatedData(matter(content).data.related);
  } catch {
    return [];
  }
}

/**
 * フロントマターの `related` に `target`（型付き）を 1 件追記した本文を返す。
 *
 * - 安全でない `target` は書き込まない（防御）。
 * - 既に同じ `(to, type)` があれば変更しない（冪等）。
 * - 同じ `to` でも異なる `type` なら新規エントリとして追加する。
 * - `references`（既定）は素の文字列で、型付きは `{ to, type }` オブジェクトで追記する。
 * - `related` キーが無ければ追加し、フロントマター自体が無ければ新規作成する。
 * - 本文・既存キー・行末（CRLF/LF）は保存する（full reserialize しない）。
 */
export function addRelatedEntry(content: string, target: string, type: RelationType = 'references'): string {
  if (!isSafeRelPath(target)) return content;

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const indent = '  ';
  const newLines = relatedEntryLines({ to: target, type }, indent);

  const m = FRONTMATTER_RE.exec(content);
  if (!m) {
    // フロントマターなし → 新規作成
    return `---${eol}related:${eol}${newLines.join(eol)}${eol}---${eol}${eol}${content}`;
  }

  // 冪等: 既存 related に同一 (to,type) があれば変更しない
  if (existingRelated(content).some((r) => r.to === target && r.type === type)) {
    return content;
  }

  const blockLines = m[1].split(/\r?\n/);
  const relatedIdx = blockLines.findIndex((l) => /^related:\s*(\[.*\])?\s*$/.test(l));

  let newBlock: string;
  if (relatedIdx === -1) {
    // related キーなし → ブロック末尾に追加
    newBlock = [...blockLines, 'related:', ...newLines].join(eol);
  } else if (/^related:\s*\[/.test(blockLines[relatedIdx])) {
    // インライン配列 → YAML リスト形式へ変換しつつ新エントリを追記する
    const allLines = existingRelated(content).flatMap((r) => relatedEntryLines(r, indent));
    allLines.push(...newLines);
    blockLines.splice(relatedIdx, 1, 'related:', ...allLines);
    newBlock = blockLines.join(eol);
  } else {
    // 既存ブロックリスト → related 配下（インデント行・リスト項目とその継続行）の末尾へ挿入
    let insertAt = relatedIdx + 1;
    while (insertAt < blockLines.length && /^\s/.test(blockLines[insertAt]) && blockLines[insertAt].trim() !== '') {
      insertAt += 1;
    }
    blockLines.splice(insertAt, 0, ...newLines);
    newBlock = blockLines.join(eol);
  }

  const rebuilt = `---${eol}${newBlock}${eol}---${eol}`;
  // 置換文字列に含まれる `$` を特別扱いさせないため関数リプレーサを使う
  return content.replace(FRONTMATTER_RE, () => rebuilt);
}
