import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

// Airspace は善意のエージェント向けの誤操作防止網であり、セキュリティ境界ではない。
// コマンド分類は文字列の単純なパターン照合なので、npm 経由、alias、変数展開などは対象外。

export interface AirspaceClaim {
  sessionId: string;
  pid: number;
  starttime: string;
  worktree: string;
  branch: string;
  file: string;
  updatedAt: string;
}

export type GitCommandKind = 'discard' | 'branch-change' | 'none';
export type GateVerdict =
  | { kind: 'pass' }
  | { kind: 'warn'; reason: string }
  | { kind: 'deny'; reason: string }
  | { kind: 'advise'; reason: string };

interface ProcessStat {
  readonly ppid: number;
  readonly starttime: string;
}

export function resolveAirspaceDir(cwd: string): string | null {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (commonDir === '') return null;
    const absoluteCommon = isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
    return join(absoluteCommon, 'anytime');
  } catch (error: unknown) {
    // Git フックから呼ぶため、非 Git ディレクトリや git 失敗時は fail-open で無効化する。
    warnFailure(`resolveAirspaceDir:${cwd}`, error);
    return null;
  }
}

export function findClaudePid(startPid: number): number | null {
  let current: number | null = startPid;
  for (let depth = 0; depth < 8; depth += 1) {
    if (current === null || current <= 0) return null;
    if (readComm(current) === 'claude') return current;
    current = readProcessStat(current)?.ppid ?? null;
  }
  return null;
}

export function readProcessStartTime(pid: number): string | null {
  return readProcessStat(pid)?.starttime ?? null;
}

export function isClaimLive(claim: AirspaceClaim): boolean {
  if (!existsSync(`/proc/${claim.pid}`)) return false;
  if (readComm(claim.pid) !== 'claude') return false;
  return readProcessStartTime(claim.pid) === claim.starttime;
}

/**
 * クレームを原子的に書く。
 *
 * 同一 pid・別 sessionId のクレームは削除する。1 つの Claude Code プロセスが `/clear` で
 * 新しいセッションを始めると sessionId だけが変わるため、古いクレームを残すと「生存している
 * 自分自身」を別セッションとして誤検知し、単独作業でも deny が出続ける。
 */
export function writeClaim(dir: string, claim: AirspaceClaim): void {
  const claimsDir = join(dir, 'claims');
  mkdirSync(claimsDir, { recursive: true });

  for (const name of readdirSync(claimsDir)) {
    if (!name.endsWith('.json')) continue;
    const filePath = join(claimsDir, name);
    const existing = readClaimFile(filePath);
    if (existing !== null && existing.pid === claim.pid && existing.sessionId !== claim.sessionId) {
      removeClaimFile(filePath, `superseded:${existing.sessionId}`);
    }
  }

  const target = join(claimsDir, `${claim.sessionId}.json`);
  const temp = join(claimsDir, `${claim.sessionId}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temp, `${JSON.stringify(claim, null, 2)}\n`, 'utf8');
  renameSync(temp, target);
}

/**
 * 生存しているクレームを返す。死んだクレーム・壊れたクレームはファイルごと削除する。
 *
 * `excludePid` は自分自身の Claude Code プロセスを除外するために使う。sessionId だけの除外では、
 * `/clear` 後に残った同一プロセスの旧セッションのクレームを他人と誤認する。
 */
export function listLiveClaims(
  dir: string,
  excludeSessionId: string,
  excludePid = 0,
): AirspaceClaim[] {
  const claimsDir = join(dir, 'claims');
  if (!existsSync(claimsDir)) return [];

  const claims: AirspaceClaim[] = [];
  for (const name of readdirSync(claimsDir)) {
    if (!name.endsWith('.json')) continue;
    const filePath = join(claimsDir, name);
    const claim = readClaimFile(filePath);
    if (claim === null) {
      removeClaimFile(filePath, 'broken-json');
      continue;
    }
    if (!isClaimLive(claim)) {
      removeClaimFile(filePath, claim.sessionId);
      continue;
    }
    if (claim.sessionId === excludeSessionId) continue;
    if (excludePid !== 0 && claim.pid === excludePid) continue;
    claims.push(claim);
  }
  return claims;
}

/** classifyGitCommand の依存注入。checkout の引数がブランチかパスかを解決するために使う。 */
export interface GitCommandContext {
  /** 作業ツリー基準で相対パスが実在するか。省略時、checkout の引数はブランチ指定とみなす。 */
  readonly fileExists?: (path: string) => boolean;
}

export function classifyGitCommand(
  command: string,
  context: GitCommandContext = {},
): GitCommandKind {
  const tokens = tokenize(command);
  if (tokens.length < 2 || tokens[0] !== 'git') return 'none';
  const subcommand = tokens[1];
  const args = tokens.slice(2);

  if (subcommand === 'reset') return args.includes('--hard') ? 'discard' : 'none';
  if (subcommand === 'clean') return classifyClean(args);
  if (subcommand === 'restore') return classifyRestore(args);
  if (subcommand === 'stash') return classifyStash(args);
  if (subcommand === 'checkout') return classifyCheckout(args, context);
  if (subcommand === 'branch') return classifyBranch(args);
  if (subcommand === 'worktree') return classifyWorktree(args);
  if (subcommand === 'switch') return args.length > 0 ? 'branch-change' : 'none';
  return 'none';
}

export function evaluateBashGate(
  command: string,
  liveClaims: readonly AirspaceClaim[],
  myWorktree: string,
): GateVerdict {
  const kind = classifyGitCommand(command, {
    fileExists: (target) => existsSync(resolve(myWorktree, target)),
  });
  if (kind === 'none') return { kind: 'pass' };
  const conflict = liveClaims.find((claim) => claim.worktree === myWorktree);
  if (conflict === undefined) return { kind: 'pass' };
  if (kind === 'discard') return { kind: 'deny', reason: buildReason('deny', conflict) };
  return { kind: 'warn', reason: buildReason('warn', conflict) };
}

export function evaluateEditGate(
  filePath: string,
  liveClaims: readonly AirspaceClaim[],
): GateVerdict {
  const conflict = liveClaims.find((claim) => claim.file === filePath);
  if (conflict === undefined) return { kind: 'pass' };
  return { kind: 'warn', reason: buildReason('warn', conflict) };
}

export function evaluateSessionStartGate(
  liveClaims: readonly AirspaceClaim[],
  myWorktree: string,
): GateVerdict {
  const conflict = liveClaims.find((claim) => claim.worktree === myWorktree);
  if (conflict === undefined) return { kind: 'pass' };
  return { kind: 'advise', reason: buildReason('advise', conflict) };
}

// -f の判定はフラグ引数のみを見る。パス引数（`git clean foo/`）の 'f' を拾わないため。
function classifyClean(args: readonly string[]): GitCommandKind {
  if (args.some((arg) => arg === '-n' || arg === '--dry-run')) return 'none';
  const flags = args.filter((arg) => arg.startsWith('-'));
  return flags.some((flag) => flag === '--force' || (!flag.startsWith('--') && flag.includes('f')))
    ? 'discard'
    : 'none';
}

function classifyRestore(args: readonly string[]): GitCommandKind {
  const staged = args.includes('--staged');
  const touchesWorktree = args.includes('--worktree') || args.includes('-W');
  return staged && !touchesWorktree ? 'none' : 'discard';
}

// push / save は作業ツリーから編集を引き剥がす。clear / drop は退避済みの作業を消す。
// apply / pop / list / show は破棄しない。
function classifyStash(args: readonly string[]): GitCommandKind {
  const action = args.find((arg) => !arg.startsWith('-'));
  if (action === undefined) return 'discard';
  return action === 'push' || action === 'save' || action === 'clear' || action === 'drop'
    ? 'discard'
    : 'none';
}

// `git checkout <arg>` の <arg> がブランチかパスかは文字列だけでは決まらない（`feature/x` はブランチ、
// `src/a.ts` はパス。どちらも '/' を含む）。パスなら未コミット変更の破棄になるため、作業ツリー上に
// 実在するかで判定する。判定手段が無い（fileExists 未注入）ときはブランチ指定とみなす。
function classifyCheckout(args: readonly string[], context: GitCommandContext): GitCommandKind {
  if (args.length === 0) return 'none';
  if (args[0] === '--' || args[0] === '.') return 'discard';
  if (args.includes('--')) return 'discard';

  const fileExists = context.fileExists;
  if (fileExists !== undefined) {
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.some((target) => fileExists(target))) return 'discard';
  }
  return 'branch-change';
}

function classifyBranch(args: readonly string[]): GitCommandKind {
  const deletes = args.some((arg) => arg === '-D' || arg === '-d' || arg === '--delete');
  const forces = args.some((arg) => arg === '-D' || arg === '--force');
  if (deletes && forces) return 'discard';
  return 'none';
}

function classifyWorktree(args: readonly string[]): GitCommandKind {
  if (args[0] !== 'remove') return 'none';
  return args.some((arg) => arg === '--force' || arg === '-f') ? 'discard' : 'none';
}

function tokenize(command: string): string[] {
  const matches = command.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ''));
}

function readClaimFile(filePath: string): AirspaceClaim | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return isAirspaceClaim(parsed) ? parsed : null;
  } catch (error: unknown) {
    // 壊れたクレーム単体でフック全体を止めないため、そのファイルだけ無効化する。
    warnFailure(`readClaimFile:${filePath}`, error);
    return null;
  }
}

function removeClaimFile(filePath: string, id: string): void {
  try {
    rmSync(filePath, { force: true });
  } catch (error: unknown) {
    // 古いクレームの削除失敗でフックを落とすより、fail-open で処理を継続する。
    warnFailure(`removeClaimFile:${id}:${filePath}`, error);
  }
}

function readComm(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
  } catch (error: unknown) {
    // /proc は競合的に消えるため、プロセス不在として扱う。
    warnFailure(`readComm:${pid}`, error);
    return null;
  }
}

function readProcessStat(pid: number): ProcessStat | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const closeParen = stat.lastIndexOf(') ');
    if (closeParen < 0) return null;
    const fields = stat.slice(closeParen + 2).trim().split(/\s+/);
    const ppid = Number(fields[1]);
    const starttime = fields[19];
    if (!Number.isInteger(ppid) || starttime === undefined) return null;
    return { ppid, starttime };
  } catch (error: unknown) {
    // /proc は競合的に消えるため、プロセス不在として扱う。
    warnFailure(`readProcessStat:${pid}`, error);
    return null;
  }
}

function isAirspaceClaim(value: unknown): value is AirspaceClaim {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.pid === 'number' &&
    Number.isInteger(candidate.pid) &&
    typeof candidate.starttime === 'string' &&
    typeof candidate.worktree === 'string' &&
    typeof candidate.branch === 'string' &&
    typeof candidate.file === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function buildReason(kind: Exclude<GateVerdict['kind'], 'pass'>, claim: AirspaceClaim): string {
  const label = kind === 'deny' ? '危険な Git 操作を停止しました' : '並行セッションを検出しました';
  return `${label}。相手セッション ${claim.sessionId.slice(0, 8)}（branch: ${claim.branch}）が同じ作業領域で生存しています。相手の終了を待つか、git worktree add .worktrees/<name> -b <branch> で作業領域を分離してください。ユーザー確認済みの場合のみ ANYTIME_AIRSPACE=off を付けて再実行できます。`;
}

function warnFailure(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[anytime-airspace] ${context}: ${message}`);
}
