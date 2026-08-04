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

/** PATHEXT 未設定時に試す拡張子（Windows の既定に合わせる）。 */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** 実行ファイル名の基底（拡張子は Windows でのみ付与する）。 */
const GIT_BASENAME = 'git';

/** 絶対パス指定で git を差し替えるための環境変数名。 */
export const GIT_PATH_ENV = 'ANYTIME_GIT_PATH';

export interface GitExecutableLookupOptions {
  /** 既定は `process.platform`。テストと Windows 挙動の検証のために注入可能にしている。 */
  readonly platform?: NodeJS.Platform;
  /** 既定は `process.env.PATH`。 */
  readonly pathValue?: string;
  /** 既定は `process.env.PATHEXT`（Windows のみ意味を持つ）。 */
  readonly pathExtValue?: string;
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

function defaultIsExecutableFile(candidate: string): boolean {
  if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) return false;
  if (process.platform === 'win32') return true;
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

function candidateNames(platform: NodeJS.Platform, pathExtValue: string | undefined): string[] {
  if (platform !== 'win32') return [GIT_BASENAME];
  const raw = pathExtValue === undefined || pathExtValue.trim() === '' ? DEFAULT_PATHEXT : pathExtValue;
  return raw
    .split(';')
    .map((ext) => ext.trim())
    .filter((ext) => ext !== '')
    .map((ext) => `${GIT_BASENAME}${ext}`);
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
  const isExecutableFile = options.isExecutableFile ?? defaultIsExecutableFile;
  const names = candidateNames(platform, options.pathExtValue ?? process.env.PATHEXT);

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

/**
 * git の絶対パスを返す（プロセス内でキャッシュする）。
 *
 * `ANYTIME_GIT_PATH` が絶対パスで与えられていればそれを最優先する。
 * 解決できない場合はフォールバックせずに throw する（fail-closed）。
 *
 * @throws 解決できなかった場合
 */
export function resolveGitExecutable(options: GitExecutableResolveOptions = {}): string {
  if (cachedGitExecutable !== undefined) return cachedGitExecutable;

  const platform = options.platform ?? process.platform;
  const override = options.gitPathOverride ?? process.env[GIT_PATH_ENV];
  if (override !== undefined && override !== '') {
    if (!platformPath(platform).isAbsolute(override)) {
      throw new Error(`${GIT_PATH_ENV} must be an absolute path: ${JSON.stringify(override)}`);
    }
    cachedGitExecutable = override;
    return override;
  }

  const found = findGitExecutable(options);
  if (found === null) {
    // 失敗はキャッシュしない。PATH を直せば次回に回復する。
    throw new Error(
      `git executable not found in PATH (absolute entries only). Set ${GIT_PATH_ENV} to an absolute path.`,
    );
  }
  cachedGitExecutable = found;
  return found;
}

/** テスト専用。プロセス内キャッシュを捨てる。 */
export function resetGitExecutableCacheForTest(): void {
  cachedGitExecutable = undefined;
}
