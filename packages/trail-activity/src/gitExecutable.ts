//
// git 実行ファイルを絶対パスへ解決する。
//
// Why not `execFileSync('git', ...)`:
// コマンド名だけを渡すと探索は OS に委ねられる。Windows の CreateProcess は
// **カレントディレクトリを PATH より先に探す**ため、信頼できないリポジトリを開いた状態で
// git を起動すると、そのリポジトリにコミットされた `git.exe` が実行され得る。
// 本プロダクトは任意のユーザーリポジトリを cwd にして git を回すので、この経路は現実に開く。
// POSIX 側にも、PATH の空要素・相対要素が cwd を指すという同種の穴がある（SonarCloud S4036）。
//
// 対策として、PATH の**絶対パス要素だけ**を自前で走査して実行ファイルを特定し、
// 以降は絶対パスで exec する。解決できない場合はフォールバックせず例外を投げる
// （fail-closed。ここで `'git'` へ戻すと塞いだはずの経路がそのまま素通りする。
// なお git が本当に PATH に無ければ、どのみち exec は ENOENT で失敗する）。
//

import path from 'node:path';
import { accessSync, constants, statSync } from 'node:fs';

/**
 * Windows で試す拡張子。
 *
 * Why not PATHEXT をそのまま使わない: PATHEXT には `.BAT` / `.CMD` が含まれるが、Node の
 * `execFile` / `spawn` は `shell` なしでバッチファイルを起動できない（Node 18.20 / 20.12 以降は
 * 明示的に拒否される）。PATHEXT 順で `.CMD` を先に拾うと、実行できない候補を「見つかった」と
 * 返してしまう。git 本体は常に `git.exe` なので、実行可能な形式だけに絞る。
 */
const WIN32_EXECUTABLE_EXTENSIONS = ['.COM', '.EXE'] as const;

/** 実行ファイル名の基底（拡張子は Windows でのみ付与する）。 */
const GIT_BASENAME = 'git';

/** 絶対パス指定で git を差し替えるための環境変数名。 */
export const GIT_PATH_ENV = 'ANYTIME_GIT_PATH';

/**
 * git 実行ファイルを解決できなかったことを表す。
 *
 * git 自体の実行失敗（非ゼロ終了・HEAD 不在など、呼び出し側が正常系として扱うもの）と
 * 区別できるようにするための専用型。`catch` で握り潰す前に `instanceof` で弾くこと。
 */
export class GitExecutableNotFoundError extends Error {
  override readonly name = 'GitExecutableNotFoundError';
}

export interface GitExecutableLookupOptions {
  /** 既定は `process.platform`。テストと Windows 挙動の検証のために注入可能にしている。 */
  readonly platform?: NodeJS.Platform;
  /** 既定は `process.env.PATH`。 */
  readonly pathValue?: string;
  /** 既定は stat + X_OK による判定。 */
  readonly isExecutableFile?: (candidate: string) => boolean;
}

export interface GitExecutableResolveOptions extends GitExecutableLookupOptions {
  /** 既定は `process.env[GIT_PATH_ENV]`。 */
  readonly gitPathOverride?: string;
}

function platformPath(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function defaultIsExecutableFile(candidate: string, platform: NodeJS.Platform): boolean {
  if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) return false;
  // Windows に実行ビットは無い。拡張子が実行形式であることは候補生成側で保証している。
  if (platform === 'win32') return true;
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    // 実行権限が無いだけ。候補から外して次を試す（探索の継続が正しい挙動）。
    return false;
  }
}

/** Windows の PATH 要素は引用符で囲まれていることがある。 */
function stripQuotes(entry: string): string {
  return entry.length >= 2 && entry.startsWith('"') && entry.endsWith('"')
    ? entry.slice(1, -1)
    : entry;
}

function candidateNames(platform: NodeJS.Platform): readonly string[] {
  if (platform !== 'win32') return [GIT_BASENAME];
  return WIN32_EXECUTABLE_EXTENSIONS.map((ext) => `${GIT_BASENAME}${ext}`);
}

/**
 * PATH を走査して git の絶対パスを探す。
 *
 * PATH の空要素・相対要素は cwd を指すため候補にしない（本関数の存在理由そのもの）。
 *
 * @returns 見つかった絶対パス。見つからなければ `null`
 */
export function findGitExecutable(options: GitExecutableLookupOptions = {}): string | null {
  const platform = options.platform ?? process.platform;
  const pathValue = options.pathValue ?? process.env.PATH;
  if (pathValue === undefined || pathValue === '') return null;

  const p = platformPath(platform);
  const isExecutableFile =
    options.isExecutableFile ?? ((candidate: string) => defaultIsExecutableFile(candidate, platform));
  const names = candidateNames(platform);

  for (const rawEntry of pathValue.split(p.delimiter)) {
    const dir = stripQuotes(rawEntry.trim());
    if (dir === '' || !p.isAbsolute(dir)) continue;
    for (const name of names) {
      const candidate = p.join(dir, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

let cachedGitExecutable: string | undefined;

/** どの解決入力も差し替えていない＝プロセス既定での解決か。 */
function usesProcessDefaults(options: GitExecutableResolveOptions): boolean {
  return (
    options.platform === undefined &&
    options.pathValue === undefined &&
    options.isExecutableFile === undefined &&
    options.gitPathOverride === undefined
  );
}

/**
 * git の絶対パスを返す。
 *
 * `ANYTIME_GIT_PATH` が絶対パスで与えられていればそれを最優先する。
 * 解決できない場合はフォールバックせずに throw する（fail-closed）。
 *
 * **キャッシュはプロセス既定での解決にのみ効く。** 解決入力を差し替えた呼び出しは毎回
 * 解決し直す（キャッシュを共有すると、最初の呼び出しの文脈が以後すべてを固定してしまう）。
 *
 * @throws {GitExecutableNotFoundError} 解決できなかった場合
 */
export function resolveGitExecutable(options: GitExecutableResolveOptions = {}): string {
  const cacheable = usesProcessDefaults(options);
  if (cacheable && cachedGitExecutable !== undefined) return cachedGitExecutable;

  const platform = options.platform ?? process.platform;
  const resolved = resolveOnce(options, platform);
  // 失敗はキャッシュしない（throw で抜けるため、ここには成功時しか来ない）。
  if (cacheable) cachedGitExecutable = resolved;
  return resolved;
}

function resolveOnce(options: GitExecutableResolveOptions, platform: NodeJS.Platform): string {
  const override = options.gitPathOverride ?? process.env[GIT_PATH_ENV];
  if (override !== undefined && override !== '') {
    if (!platformPath(platform).isAbsolute(override)) {
      throw new GitExecutableNotFoundError(
        `${GIT_PATH_ENV} must be an absolute path: ${JSON.stringify(override)}`,
      );
    }
    const isExecutableFile =
      options.isExecutableFile ?? ((candidate: string) => defaultIsExecutableFile(candidate, platform));
    // 実在確認までここで行う。しないと、以後すべての git 実行が ENOENT になる原因が
    // 呼び出し側の catch に散らばって「git が壊れた」ようにしか見えなくなる。
    if (!isExecutableFile(override)) {
      throw new GitExecutableNotFoundError(
        `${GIT_PATH_ENV} does not point to an executable file: ${JSON.stringify(override)}`,
      );
    }
    return override;
  }

  const found = findGitExecutable(options);
  if (found === null) {
    throw new GitExecutableNotFoundError(
      `git executable not found in PATH (absolute entries only). Set ${GIT_PATH_ENV} to an absolute path.`,
    );
  }
  return found;
}

/** テスト専用。プロセス内キャッシュを捨てる。 */
export function resetGitExecutableCacheForTest(): void {
  cachedGitExecutable = undefined;
}
