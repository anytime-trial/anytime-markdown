/**
 * import 先が「解析対象から除外された宣言ファイル（`.d.ts`）」に解決された場合に、
 * 同一 in-repo パッケージのソースノードへエッジを張り直すための代表ソースを求める。
 *
 * ビルド済み `dist`/`out` の `.d.ts` をエントリにする in-repo ライブラリ
 * （例: 公開 Web Component）は、消費側の import が `.d.ts` に解決されてしまい、
 * 宣言ファイルがノード除外されるためエッジが消える。本ヘルパでエッジを救済する。
 *
 * レイアウト非依存（`packages/*` や特定スコープに依存しない）にするため、
 * package.json 境界で所有パッケージを特定する。`node_modules` 内（真の外部依存）と
 * projectRoot 外は対象外とし、従来どおりエッジを剪定させる。
 */

const SRC_INDEX_RE = /\/src\/index\.(?:ts|tsx|mts|cts)$/;
const INDEX_RE = /\/index\.(?:ts|tsx|mts|cts)$/;

export interface DeclarationSourceResolverDeps {
  /**
   * 宣言ファイルに対応する declarationMap（`.d.ts.map`）から元ソースの絶対パスを返す。
   * map が無い・対応ソースが特定できない場合は空配列。
   */
  readDeclarationMapSources(declFilePath: string): string[];
  /**
   * 指定ファイルの最近接 `package.json` ディレクトリ（絶対パス）を返す。無ければ null。
   */
  findPackageDir(filePath: string): string | null;
}

/**
 * 宣言ファイルへの解決を、同一パッケージの実ソースノードへ remap する。
 *
 * @param declFilePath 解決された宣言ファイルの絶対パス
 * @param projectRoot 解析対象ルートの絶対パス
 * @param sourceFileAbsPaths ノード化済みソースファイルの絶対パス集合
 * @returns remap 先ソースの絶対パス。remap すべきでない場合は null
 */
export function resolveDeclarationToSource(
  declFilePath: string,
  projectRoot: string,
  sourceFileAbsPaths: ReadonlySet<string>,
  deps: DeclarationSourceResolverDeps,
): string | null {
  const decl = normalize(declFilePath);

  // 真の外部依存（node_modules 配下）は救済しない
  if (hasSegment(decl, 'node_modules')) return null;
  // projectRoot 外（別ライブラリ・モノレポ外）は救済しない
  if (!isUnder(decl, normalize(projectRoot))) return null;

  // 正規化パス -> 元パスの対応表
  const byNormalized = new Map<string, string>();
  for (const original of sourceFileAbsPaths) {
    byNormalized.set(normalize(original), original);
  }

  // 1. declarationMap が使えれば元ソースを正確に復元
  for (const mapped of deps.readDeclarationMapSources(declFilePath)) {
    const hit = byNormalized.get(normalize(mapped));
    if (hit) return hit;
  }

  // 2. package.json 境界フォールバック: 所有パッケージの代表ソースを選ぶ
  const pkgDir = deps.findPackageDir(declFilePath);
  if (!pkgDir) return null;
  const pkg = normalize(pkgDir);
  if (hasSegment(pkg, 'node_modules')) return null;

  const underPkg = [...byNormalized.keys()].filter((p) => isUnder(p, pkg)).sort();
  if (underPkg.length === 0) return null;

  const chosen =
    underPkg.find((p) => SRC_INDEX_RE.test(p)) ??
    underPkg.find((p) => INDEX_RE.test(p)) ??
    underPkg[0];

  return byNormalized.get(chosen) ?? null;
}

function normalize(p: string): string {
  return p.replaceAll('\\', '/');
}

function hasSegment(normalizedPath: string, segment: string): boolean {
  return normalizedPath.split('/').includes(segment);
}

function isUnder(child: string, parent: string): boolean {
  if (child === parent) return true;
  const base = parent.endsWith('/') ? parent : `${parent}/`;
  return child.startsWith(base);
}
