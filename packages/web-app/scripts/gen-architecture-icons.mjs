// @ts-check
/**
 * architecture/icons/architectureIcons.generated.ts を生成する codegen。
 *
 * 目的: simple-icons（全 3000+ アイコン・約 5 MiB）を web-app の実行時依存から排除する。
 * 構成図が使うのは十数個のアイコンの `.hex` / `.path` だけなので、必要分のみを抽出した
 * 軽量モジュールを生成し、`ArchitectureIcon.tsx` はそれを import する。
 *
 * 使い方: npm run gen:architecture-icons --workspace=@anytime-markdown/web-app
 *   (simple-icons を更新した / 使うアイコンを増減したときに再実行する)
 *
 * 生成元の真実: ArchitectureIcon.tsx 内で参照されている `siXxx` 識別子を走査し、その名前を
 * simple-icons から解決する。手で名前リストを二重管理しない
 * (packages/trail-activity/scripts/gen-service-icons.mjs と同じ方式)。
 *
 * SHORTCUT: simple-icons を web-app の devDependencies へ宣言せず、ワークスペース root へ
 * hoist された実体（宣言元は @anytime-markdown/trail-activity）に依存する。
 * ceiling: root に simple-icons が居ることが前提で、単独 install した web-app では動かない。
 * upgrade: web-app 単体で配布・CI 実行する必要が出たら devDependencies へ明示する。
 * 実測 2026-08-25: .github/workflows/ から本スクリプトを起動する経路は無く、手動実行のみ。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import * as simpleIcons from 'simple-icons';

const require = createRequire(import.meta.url);

/**
 * 取り込み元の版数。生成ファイルのヘッダへ刻み、THIRD-PARTY-NOTICES の生成が読み取る。
 *
 * Why not: require('simple-icons/package.json') で読まない。simple-icons は exports で
 * ./package.json を公開しておらず ERR_PACKAGE_PATH_NOT_EXPORTED になる。解決済みの
 * エントリから上位へ辿って実体の package.json を読む。
 */
function resolveSimpleIconsVersion() {
  let dir = dirname(require.resolve('simple-icons'));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const { name, version } = JSON.parse(readFileSync(manifest, 'utf8'));
      if (name === 'simple-icons') return version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('[gen-architecture-icons] simple-icons の package.json を解決できませんでした');
    }
    dir = parent;
  }
}

const simpleIconsVersion = resolveSimpleIconsVersion();

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '../src/app/[locale]/architecture/icons');
const sourcePath = join(iconsDir, 'ArchitectureIcon.tsx');
const outPath = join(iconsDir, 'architectureIcons.generated.ts');

const source = readFileSync(sourcePath, 'utf8');

// ArchitectureIcon.tsx で参照される simple-icons 識別子 (siXxx) を一意に抽出する。
const names = [...new Set(source.match(/\bsi[A-Z][A-Za-z0-9]*\b/g) ?? [])].sort((a, b) =>
  a.localeCompare(b),
);

if (names.length === 0) {
  throw new Error(
    `[gen-architecture-icons] ArchitectureIcon.tsx から siXxx 識別子を抽出できませんでした: ${sourcePath}`,
  );
}

const missing = names.filter((n) => !(n in simpleIcons));
if (missing.length > 0) {
  throw new Error(
    `[gen-architecture-icons] simple-icons に存在しない識別子: ${missing.join(', ')}。` +
      'ArchitectureIcon.tsx の綴りまたは simple-icons のバージョンを確認してください。',
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
// 生成元: scripts/gen-architecture-icons.mjs (simple-icons から抽出)
// 再生成: npm run gen:architecture-icons --workspace=@anytime-markdown/web-app
//
// ArchitectureIcon.tsx が使うアイコンの { hex, path } のみを抽出した軽量データ。
// simple-icons 全体をバンドルに取り込まないための分離レイヤー。
// 各マークの商標は各権利者に帰属する。
//
// 次の 1 行は scripts/generate-third-party-notices.mjs が走査する機械可読マーカー。
// 書式を変えると同梱物のライセンス表記から simple-icons が黙って消えるため注意する。
// vendored-from: simple-icons@${simpleIconsVersion} (CC0-1.0) https://github.com/simple-icons/simple-icons

/** simple-icons の 1 アイコン分の最小データ (hex: ブランドカラー / path: 24×24 viewBox の SVG path d 属性)。 */
export interface SimpleIconData {
  readonly hex: string;
  readonly path: string;
}

const ICONS = {
${entries}
} as const satisfies Record<string, SimpleIconData>;

export const {
${names.map((n) => `  ${n},`).join('\n')}
} = ICONS;
`;

writeFileSync(outPath, out);
console.log(`[gen-architecture-icons] ${names.length} icons -> ${outPath}`);
