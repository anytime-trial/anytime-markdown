// ルートと npm workspaces（ルート package.json の workspaces）の package.json から
// dependencies / devDependencies を集計し、同一モジュールの版の混在を列挙する。
// weekly-research トピック 6 の手順 1 で使う。
// 使い方: node .claude/skills-archive/weekly-research/scripts/deps-inventory.cjs [リポジトリルート]（既定: カレントディレクトリ）
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] ?? process.cwd());

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`読み込み失敗（集計から除外）: ${p}: ${e.message}`);
    process.exitCode = 1;
    return null;
  }
}

const rootPkgPath = path.join(root, "package.json");
if (!fs.existsSync(rootPkgPath)) {
  console.error(`package.json がありません: ${root}\n使い方: node deps-inventory.cjs [リポジトリルート]`);
  process.exit(2);
}
const rootPkg = readJson(rootPkgPath);
if (!rootPkg) process.exit(2);

// workspaces は配列形式と { packages: [...] } 形式の両方がある。glob（*）は 1 階層だけ展開する
const patterns = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : (rootPkg.workspaces?.packages ?? []);
const dirs = ["."];
for (const pattern of patterns) {
  if (!pattern.endsWith("/*")) { dirs.push(pattern); continue; }
  const parent = path.join(root, pattern.slice(0, -2));
  if (!fs.existsSync(parent)) continue;
  for (const d of fs.readdirSync(parent)) dirs.push(path.join(pattern.slice(0, -2), d));
}

const modules = new Map();
let counted = 0;
for (const d of dirs) {
  const p = path.join(root, d, "package.json");
  if (!fs.existsSync(p)) continue;
  const pkg = d === "." ? rootPkg : readJson(p);
  if (!pkg) continue;
  counted++;
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(pkg[field] ?? {})) {
      if (name.startsWith("@anytime-markdown/")) continue;
      if (!modules.has(name)) modules.set(name, new Map());
      const versions = modules.get(name);
      versions.set(version, [...(versions.get(version) ?? []), d]);
    }
  }
}

const mixed = [...modules].filter(([, versions]) => versions.size > 1);
console.log(`package.json: ${counted}（ルート + workspaces）/ モジュール: ${modules.size} / 版の混在: ${mixed.length}`);
for (const [name, versions] of mixed.sort(([a], [b]) => a.localeCompare(b))) {
  console.log("MIXED", name, [...versions].map(([v, ds]) => `${v}(${ds.length})`).join(" "));
}
