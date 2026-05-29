// @ts-check
/**
 * serviceIcons.generated.ts を生成する codegen。
 *
 * 目的: simple-icons (全 3000+ アイコン, 約 5 MiB) を実行時依存から排除する。
 * catalog.ts は約 67 個のアイコンの `.hex` / `.path` しか使わないため、
 * 必要なアイコンだけを抽出した軽量データモジュール (数十 KiB) を生成し、
 * catalog.ts はそれを import する。simple-icons は再生成時のみ必要な
 * devDependency となり、どのバンドルにも混入しなくなる。
 *
 * 使い方: npm run gen:service-icons --workspace=@anytime-markdown/trail-core
 *   (simple-icons を更新した / catalog.ts で使うアイコンを増減したときに再実行する)
 *
 * 生成元の真実: catalog.ts 内で参照されている `siXxx` 識別子を走査し、
 * その名前を simple-icons から解決する。手で名前リストを二重管理しない。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as simpleIcons from 'simple-icons';

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(here, '../src/c4/services/catalog.ts');
const outPath = join(here, '../src/c4/services/serviceIcons.generated.ts');

const catalogSource = readFileSync(catalogPath, 'utf8');

// catalog.ts で参照される simple-icons 識別子 (siXxx) を一意に抽出する。
const names = [...new Set(catalogSource.match(/\bsi[A-Z][A-Za-z0-9]*\b/g) ?? [])].sort((a, b) =>
  a.localeCompare(b),
);

if (names.length === 0) {
  throw new Error(`[gen-service-icons] catalog.ts から siXxx 識別子を抽出できませんでした: ${catalogPath}`);
}

const missing = names.filter((n) => !(n in simpleIcons));
if (missing.length > 0) {
  throw new Error(
    `[gen-service-icons] simple-icons に存在しない識別子: ${missing.join(', ')}。catalog.ts の綴りまたは simple-icons のバージョンを確認してください。`,
  );
}

const entries = names
  .map((name) => {
    /** @type {{ hex: string; path: string }} */
    const icon = simpleIcons[name];
    // hex / path はリテラル文字列。JSON.stringify でエスケープを安全化する。
    return `  ${name}: { hex: ${JSON.stringify(icon.hex)}, path: ${JSON.stringify(icon.path)} },`;
  })
  .join('\n');

const out = `// THIS FILE IS GENERATED — DO NOT EDIT BY HAND.
// 生成元: scripts/gen-service-icons.mjs (simple-icons から抽出)
// 再生成: npm run gen:service-icons --workspace=@anytime-markdown/trail-core
//
// catalog.ts が使うアイコンの { hex, path } のみを抽出した軽量データ。
// simple-icons 全体をバンドルに取り込まないための分離レイヤー。

/** simple-icons の 1 アイコン分の最小データ (hex: ブランドカラー / path: 24×24 viewBox の SVG path d 属性)。 */
export interface SimpleIconData {
  readonly hex: string;
  readonly path: string;
}

const ICONS = {
${entries}
} as const satisfies Record<string, SimpleIconData>;

${names.map((name) => `export const ${name}: SimpleIconData = ICONS.${name};`).join('\n')}
`;

writeFileSync(outPath, out, 'utf8');
console.log(`[gen-service-icons] ${names.length} アイコンを生成: ${outPath}`);
