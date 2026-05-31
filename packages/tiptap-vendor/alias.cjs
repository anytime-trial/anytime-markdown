// @tiptap/* 名 → vendored ソース絶対パスの単一マッピング源。
// jest(moduleNameMapper) / webpack(resolve.alias) / Turbopack(resolveAlias) の各アダプタ、
// および jest transform を生成し、consumer 間の定義 drift を防ぐ。
// tsconfig paths は glob 対応のため各 tsconfig に手書きする（本ファイルがその同期元）。
const fs = require("fs");
const path = require("path");

const VENDOR = __dirname;

// 既定 export を持つ npm シムを再現する umbrella オーバーライド（_shims/ 参照）。
// placeholder は extensions/ 配下、task-* は extension-list/ 配下と umbrella 構造のため、
// 独立フォルダを持つ他 extension と違い named export しか持たない。default を _shims で補う。
const SHIM_OVERRIDES = {
	"@tiptap/extension-placeholder": "_shims/extension-placeholder.ts",
	"@tiptap/extension-task-item": "_shims/extension-task-item.ts",
	"@tiptap/extension-task-list": "_shims/extension-task-list.ts",
};

function computeAliasEntries(vendorDir) {
	const entries = [];
	const add = (request, rel) => entries.push({ request, target: path.join(vendorDir, rel) });

	add("@tiptap/core", "core/src/index.ts");
	// JSX automatic runtime（pragma @jsxImportSource @tiptap/core）。jsx-runtime.ts は jsx/jsxs/jsxDEV/Fragment を全て export
	add("@tiptap/core/jsx-runtime", "core/src/jsx-runtime.ts");
	add("@tiptap/core/jsx-dev-runtime", "core/src/jsx-runtime.ts");
	add("@tiptap/react", "react/src/index.ts");
	add("@tiptap/react/menus", "react/src/menus/index.ts");
	add("@tiptap/starter-kit", "starter-kit/src/index.ts");
	// extensions umbrella（starter-kit が Dropcursor/Gapcursor/TrailingNode/UndoRedo を値 import）
	add("@tiptap/extensions", "extensions/src/index.ts");
	add("tiptap-markdown", "tiptap-markdown/index.js");

	// umbrella シムを先に登録し、後段の extension-* スキャンでは重複追加しない
	for (const [request, rel] of Object.entries(SHIM_OVERRIDES)) add(request, rel);
	const shimmed = new Set(Object.keys(SHIM_OVERRIDES));

	// pm subpath: prosemirror 再export を持つ各サブディレクトリ
	for (const ent of fs.readdirSync(path.join(vendorDir, "pm"), { withFileTypes: true })) {
		if (ent.isDirectory() && fs.existsSync(path.join(vendorDir, "pm", ent.name, "index.ts"))) {
			add(`@tiptap/pm/${ent.name}`, `pm/${ent.name}/index.ts`);
		}
	}

	// extension-*（1:1 フォルダ）。シム済みは除外
	for (const ent of fs.readdirSync(vendorDir, { withFileTypes: true })) {
		if (!ent.isDirectory() || !ent.name.startsWith("extension-")) continue;
		if (shimmed.has(`@tiptap/${ent.name}`)) continue;
		if (fs.existsSync(path.join(vendorDir, ent.name, "src/index.ts"))) {
			add(`@tiptap/${ent.name}`, `${ent.name}/src/index.ts`);
		}
	}
	return entries;
}

// 既定 vendor のエントリは config ロード毎に再 fs 走査せずキャッシュする
// (webpack コールバックは server/client/edge の各チャンクで呼ばれるため)。
let cachedEntries = null;

/** @returns {Array<{request: string, target: string}>} 完全一致の (specifier, 絶対パス) ペア列 */
function buildAliasEntries(vendorDir = VENDOR) {
	if (vendorDir !== VENDOR) return computeAliasEntries(vendorDir);
	if (!cachedEntries) cachedEntries = computeAliasEntries(VENDOR);
	return cachedEntries;
}

function buildAliasMap(vendorDir, toKey, toValue) {
	const map = {};
	for (const { request, target } of buildAliasEntries(vendorDir)) {
		map[toKey(request)] = toValue(target, request);
	}
	return map;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** jest moduleNameMapper 形（完全一致 regex → 絶対パス） */
function buildJestMapper(vendorDir = VENDOR) {
	return buildAliasMap(vendorDir, (r) => `^${escapeRegExp(r)}$`, (t) => t);
}

/** webpack resolve.alias 形（完全一致キー = "<request>$"） */
function buildWebpackAlias(vendorDir = VENDOR) {
	return buildAliasMap(vendorDir, (r) => `${r}$`, (t) => t);
}

/** Turbopack resolveAlias 形（projectRoot からの相対パス、完全一致キー） */
function buildTurbopackAlias(projectRoot, vendorDir = VENDOR) {
	return buildAliasMap(vendorDir, (r) => r, (t) => {
		const rel = path.relative(projectRoot, t).split(path.sep).join("/");
		return rel.startsWith(".") ? rel : `./${rel}`;
	});
}

/**
 * jest transform 形。型検証は tsc -b が担うため isolatedModules で transpile のみ
 * （vendored 第三者ソースを ts-jest が strict 型チェックして落ちるのを回避）。
 * vendored tiptap-markdown は ESM .js のため allowJs で transpile する。
 * @param extraJsTsconfig .jsx? 用 tsconfig への追加オプション（例: { jsx: "react-jsx" }）
 */
function buildJestTransform(extraJsTsconfig = {}) {
	return {
		"^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
		"^.+\\.jsx?$": ["ts-jest", { isolatedModules: true, tsconfig: { allowJs: true, ...extraJsTsconfig } }],
	};
}

module.exports = {
	buildAliasEntries,
	buildJestMapper,
	buildWebpackAlias,
	buildTurbopackAlias,
	buildJestTransform,
	VENDOR,
};
