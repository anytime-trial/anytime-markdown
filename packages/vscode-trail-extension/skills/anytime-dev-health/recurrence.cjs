'use strict';
// recurrence.cjs — 再発検知の決定論走査(grounding.cjs の recurrence セクションが消費)。
// ~/.claude/CLAUDE.md「メモリ運用」の 2 つの昇格ルールの発火を人間の記憶から機械走査へ移す:
//   R023: 同種の罠が 2 回以上再発したら constraint メモリへ昇格
//   R024: スキル乖離が 2 回再発したらスキル本文へ反映
// 本モジュールは候補の検出のみ(read-only)。メモリ作成・スキル反映はユーザー承認後に人間側で行う。
const fs = require('node:fs');
const path = require('node:path');

/** cwd を Claude Code のメモリ格納ディレクトリ名へ変換する(例: /anytime-markdown → -anytime-markdown)。 */
function encodeProjectDir(cwd) {
  return String(cwd).replace(/[\\/.]/g, '-');
}

/** メモリ md から frontmatter の name / metadata.type と本文の [[リンク]] を抽出する(純粋関数)。 */
function parseMemory(text) {
  let name = null;
  let type = null;
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (fm) {
    name = /^name:\s*(\S+)/m.exec(fm[1])?.[1] ?? null;
    type = /^\s*type:\s*([a-z]+)/m.exec(fm[1])?.[1] ?? null;
  }
  const links = [...text.matchAll(/\[\[([^\][]+)\]\]/g)].map((m) => m[1].trim());
  return { name, type, links };
}

/**
 * 未作成メモリ名への [[リンク]] が minReferrers 以上の別メモリから張られているクラスタを返す。
 * dangling リンクは「書くべきだが未作成」のマーカーであり、複数メモリからの参照は
 * 同種の罠の再発シグナル(= constraint 昇格候補)とみなす。出力順は決定的。
 */
function detectDanglingClusters(memories, minReferrers = 2) {
  const existing = new Set();
  for (const m of memories) {
    if (m.name) existing.add(m.name);
    if (m.fileBase) existing.add(m.fileBase);
  }
  const referrers = new Map();
  for (const m of memories) {
    const self = m.name ?? m.fileBase;
    for (const link of new Set(m.links)) {
      if (existing.has(link)) continue;
      if (!referrers.has(link)) referrers.set(link, []);
      referrers.get(link).push(self);
    }
  }
  return [...referrers.entries()]
    .filter(([, refs]) => refs.length >= minReferrers)
    .map(([target, refs]) => ({ target, referrers: [...refs].sort(), count: refs.length }))
    .sort((a, b) => b.count - a.count || (a.target < b.target ? -1 : 1));
}

/**
 * bug fix が threshold 件以上のファイルのうち、type: feedback の constraint メモリ本文で
 * 言及(basename 一致)されていないものを返す = 再発しているのに教訓化されていない候補。
 */
function findUncoveredBugFiles(topBugFiles, memories, threshold = 2) {
  const feedbackTexts = memories.filter((m) => m.type === 'feedback').map((m) => m.text ?? '');
  return (topBugFiles ?? [])
    .filter((f) => (f.count ?? 0) >= threshold)
    .filter((f) => {
      // SHORTCUT: 言及判定は basename 部分一致. ceiling: 同名ファイルが複数ディレクトリで
      // top に載ると片方の言及だけで両方を教訓化済み扱いし得る(例: TrailDatabase.ts).
      // upgrade: 実データで誤抑制を観測したらフルパス suffix(末尾2セグメント)一致へ.
      const base = path.basename(String(f.file));
      return !feedbackTexts.some((t) => t.includes(base));
    });
}

/**
 * メモリディレクトリを read-only 走査する。索引 MEMORY.md は除外。dir 不在は available:false。
 * 1 ファイルの読み取り失敗で全体を落とさず errors に記録して継続する(techDebt 走査と同パターン)。
 */
function scanMemoryDir(dir) {
  if (!fs.existsSync(dir)) return { available: false, memories: [], errors: [] };
  const memories = [];
  const errors = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name === 'MEMORY.md') continue;
    let text;
    try {
      text = fs.readFileSync(path.join(dir, e.name), 'utf-8');
    } catch (err) {
      errors.push(`recurrence read failed ${path.join(dir, e.name)}: ${err.message}`);
      continue;
    }
    memories.push({ ...parseMemory(text), fileBase: e.name.replace(/\.md$/, ''), text });
  }
  return { available: true, memories, errors };
}

module.exports = { encodeProjectDir, parseMemory, detectDanglingClusters, findUncoveredBugFiles, scanMemoryDir };
