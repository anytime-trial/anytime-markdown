#!/usr/bin/env node
// ollama-benchmarks.cjs — 公称ベンチの台帳。
//
// probe は毎回モデル情報を作り直すため、Web から取得したベンチ値をコードの外に
// 永続化しておかないと再実行のたびに消える。台帳は 2 段構成:
//
//   同梱台帳   benchmarks.json          — 既知モデルの値（スキルと一緒に配布）
//   ユーザー台帳 .anytime/ollama-benchmarks.json — 新モデルを Claude が Web 取得して追記
//
// 値には必ず sources（出典 URL）と fetchedAt を添える。見つからなかった指標は null で
// 記録し、0 とは区別する（0 扱いすると「下限割れ」で不当に deny される）。

const fs = require('node:fs');
const path = require('node:path');

// ベンチ値ではないメタ情報。判定へ混ぜない。
const META_KEYS = new Set(['sources', 'notes', 'fetchedAt']);

/** ollama のモデル名からタグを外す（bge-m3:latest → bge-m3）。 */
function stripTag(name) {
  return name.includes(':') ? name.slice(0, name.indexOf(':')) : name;
}

/** 台帳からモデルのベンチ値だけを取り出す。未取得(null)とメタ情報は落とす。 */
function resolveBenchmarks(modelName, ledger) {
  const entry = ledger[modelName] ?? ledger[stripTag(modelName)];
  if (!entry) return {};

  const result = {};
  for (const [key, value] of Object.entries(entry)) {
    if (META_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue; // 未取得は「無い」として扱う
    result[key] = value;
  }
  return result;
}

/** 同梱台帳にユーザー台帳を重ねる（ユーザー側が優先）。 */
function mergeLedgers(bundled, user) {
  if (!user) return { ...bundled };

  const merged = { ...bundled };
  for (const [model, entry] of Object.entries(user)) {
    merged[model] = { ...(merged[model] ?? {}), ...entry };
  }
  return merged;
}

/** 導入済みなのに台帳に無いモデル＝ Web 取得が必要なもの。 */
function staleEntries(installedModels, ledger) {
  return installedModels
    .map((m) => m.name)
    .filter((name) => ledger[name] === undefined && ledger[stripTag(name)] === undefined);
}

/** 同梱台帳 + ワークスペース台帳を読んでマージする。 */
function loadLedger(workspaceDir = process.cwd()) {
  const bundledPath = path.join(__dirname, 'benchmarks.json');
  const userPath = path.join(workspaceDir, '.anytime', 'ollama-benchmarks.json');

  const readJson = (p) => {
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (err) {
      // 壊れた台帳を握り潰すと、ベンチ未取得と区別がつかず判定が静かに緩む。
      console.error(`[ollama-benchmarks] 台帳の読み込みに失敗: ${p}: ${err.message}`);
      return null;
    }
  };

  return mergeLedgers(readJson(bundledPath) ?? {}, readJson(userPath));
}

module.exports = { loadLedger, mergeLedgers, resolveBenchmarks, staleEntries };
