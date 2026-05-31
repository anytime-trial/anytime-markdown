// @tiptap/* 名 → vendored ソース絶対パスの単一マッピング源。
// jest(moduleNameMapper) / webpack(resolve.alias) / Turbopack(resolveAlias) の各アダプタを生成し、
// consumer 間の alias 定義 drift を防ぐ。tsconfig paths は glob 対応のため各 tsconfig に手書きする。
const fs = require("fs");
const path = require("path");

const VENDOR = __dirname;

// 既定 export を持つ npm シムを再現する umbrella オーバーライド（_shims/ 参照）
const SHIM_OVERRIDES = {
	"@tiptap/extension-placeholder": "_shims/extension-placeholder.ts",
	"@tiptap/extension-task-item": "_shims/extension-task-item.ts",
	"@tiptap/extension-task-list": "_shims/extension-task-list.ts",
};

/** @returns {Array<{request: string, target: string}>} 完全一致の (specifier, 絶対パス) ペア列 */
function buildAliasEntries(vendorDir = VENDOR) {
	const entries = [];
	const add = (request, rel) => entries.push({ request, target: path.join(vendorDir, rel) });

	add("@tiptap/core", "core/src/index.ts");
	add("@tiptap/react", "react/src/index.ts");
	add("@tiptap/react/menus", "react/src/menus/index.ts");
	add("@tiptap/starter-kit", "starter-kit/src/index.ts");
	add("tiptap-markdown", "tiptap-markdown/index.js");

	// pm subpath: prosemirror 再export を持つ各サブディレクトリ
	for (const d of fs.readdirSync(path.join(vendorDir, "pm"))) {
		if (fs.existsSync(path.join(vendorDir, "pm", d, "index.ts"))) {
			add(`@tiptap/pm/${d}`, `pm/${d}/index.ts`);
		}
	}

	// extension-*（1:1 フォルダ）
	for (const d of fs.readdirSync(vendorDir)) {
		if (d.startsWith("extension-") && fs.existsSync(path.join(vendorDir, d, "src/index.ts"))) {
			add(`@tiptap/${d}`, `${d}/src/index.ts`);
		}
	}

	// umbrella シム（既定 export 補完）で上書き
	for (const [request, rel] of Object.entries(SHIM_OVERRIDES)) {
		const i = entries.findIndex((e) => e.request === request);
		if (i >= 0) entries[i].target = path.join(vendorDir, rel);
		else add(request, rel);
	}
	return entries;
}

/** jest moduleNameMapper 形（完全一致 regex → 絶対パス） */
function buildJestMapper(vendorDir = VENDOR) {
	const map = {};
	for (const { request, target } of buildAliasEntries(vendorDir)) {
		map[`^${request.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")}$`] = target;
	}
	return map;
}

/** webpack resolve.alias 形（完全一致キー = "<request>$"） */
function buildWebpackAlias(vendorDir = VENDOR) {
	const map = {};
	for (const { request, target } of buildAliasEntries(vendorDir)) {
		map[`${request}$`] = target;
	}
	return map;
}

/** Turbopack resolveAlias 形（projectRoot からの相対パス、完全一致キー） */
function buildTurbopackAlias(projectRoot, vendorDir = VENDOR) {
	const map = {};
	for (const { request, target } of buildAliasEntries(vendorDir)) {
		let rel = path.relative(projectRoot, target).split(path.sep).join("/");
		if (!rel.startsWith(".")) rel = `./${rel}`;
		map[request] = rel;
	}
	return map;
}

module.exports = { buildAliasEntries, buildJestMapper, buildWebpackAlias, buildTurbopackAlias, VENDOR };
