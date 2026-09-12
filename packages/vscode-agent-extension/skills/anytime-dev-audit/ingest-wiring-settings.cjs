#!/usr/bin/env node
// anytime-dev-audit — ingest 配線診断の VS Code 設定読み取り（JSONC 解析・階層合成）。
//
// VS Code は Machine / User / ワークスペースの 3 層を後勝ちで合成する。どの層に値が
// 残っているかが是正先を決めるため、値ごとに由来ファイルを残す。

const path = require('node:path');

function logWarn(message) {
  console.error(`[${new Date().toISOString()}] [WARN] ingest-wiring-check: ${message}`);
}

/**
 * VS Code の settings.json は JSONC（// と ブロックコメント・末尾カンマ可）。JSON.parse は
 * そのままでは落ちるため、文字列リテラルの外側だけを除去してから parse する。
 *
 * Why not 末尾カンマを正規表現で一括除去しない: 走査後の文字列全体へ当てると文字列リテラルの
 * 内側も書き換わる（`{"a": "x, }"}` が `{"a": "x }"}` に化ける）。値が化けてもエラーは出ないため、
 * 実在しないパスを「設定値」として報告することになる。除去は走査ループの中で行う。
 */
function parseJsonc(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i += 1; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 1; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') { inLine = true; i += 1; continue; }
    if (c === '/' && next === '*') { inBlock = true; i += 1; continue; }
    // 末尾カンマ: 次の非空白（コメントを挟む場合を含む）が } か ] なら捨てる。
    if (c === ',' && isTrailingComma(text, i + 1)) continue;
    out += c;
  }
  try {
    return JSON.parse(out);
  } catch (err) {
    logWarn(`settings の JSONC 解析に失敗: ${err.message}`);
    return null;
  }
}

/** 位置 from 以降の空白・コメントを読み飛ばし、次の実体が閉じ括弧なら true。 */
function isTrailingComma(text, from) {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      if (nl < 0) return false;
      i = nl + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 2;
      continue;
    }
    return c === '}' || c === ']';
  }
  return false;
}

/** VS Code 設定の探索順（後勝ち）。Machine → User → ワークスペース。 */
function settingsCandidates(workspaceRoot, home, platform = process.platform) {
  const userCandidates = [
    path.join(home, '.vscode-server', 'data', 'User', 'settings.json'),
    platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json')
      : path.join(home, '.config', 'Code', 'User', 'settings.json'),
  ];
  return [
    { scope: 'machine', file: path.join(home, '.vscode-server', 'data', 'Machine', 'settings.json') },
    ...userCandidates.map((file) => ({ scope: 'user', file })),
    { scope: 'workspace', file: path.join(workspaceRoot, '.vscode', 'settings.json') },
  ];
}

/**
 * 候補ファイルを後勝ちで合成する。値ごとに由来ファイルを残す（どの層の残骸かが是正先を決める）。
 * VS Code 設定はドット区切りのフラットキーとネストオブジェクトの両方を許すので両方を畳む。
 */
function mergeSettings(sources) {
  const values = {};
  const files = [];
  for (const { scope, file, content } of sources) {
    files.push({ scope, file, loaded: content !== null && content !== undefined });
    const parsed = parseJsonc(content ?? '');
    if (parsed === null || typeof parsed !== 'object') continue;
    for (const [key, value] of flattenSettings(parsed)) {
      values[key] = { value, source: file, scope };
    }
  }
  return { values, files };
}

/** ネストオブジェクトをドット区切りのフラットキーへ畳む（配列・プリミティブは葉）。 */
function flattenSettings(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push([full, value]);
      out.push(...flattenSettings(value, full));
    } else {
      out.push([full, value]);
    }
  }
  return out;
}

function settingValue(settings, key) {
  const entry = settings.values[key];
  return entry === undefined ? null : entry;
}

module.exports = {
  parseJsonc,
  isTrailingComma,
  settingsCandidates,
  mergeSettings,
  flattenSettings,
  settingValue,
};
