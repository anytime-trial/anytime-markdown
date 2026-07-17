// Phase 5 S2 (Emergency Protocol): ツール呼出ループ検知。
//
// PostToolUse フック（agent-status-report.mjs の loop-check モード）から呼ばれ、
// セッション単位のシグネチャ列（`<git-common-dir>/anytime/loop-state/<sessionId>.json`）で
// 「同一ツール×同一引数の繰り返し」を判定する。warn は Claude への Mayday 警告、
// kill は Kill Switch 台帳（emergency.ts）への自動発動に対応する。
// 読み書きの失敗はすべて fail-open（検知 1 回の欠落は誤発動より軽い。要件書 §12.2）。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIRNAME = 'loop-state';
const STALE_STATE_MS = 24 * 60 * 60 * 1000;

/** リングバッファ長（直近何呼出を保持するか）。 */
export const LOOP_WINDOW = 30;
/** 同一シグネチャがこの回数連続したら warn（Mayday 警告）。 */
export const WARN_CONSECUTIVE = 5;
/** 同一シグネチャがこの回数連続したら kill（Kill Switch 自動発動）。 */
export const KILL_CONSECUTIVE = 10;
/** 振動判定の窓長。直近この件数のユニークシグネチャが 2 以下なら warn。 */
export const OSCILLATION_WINDOW = 12;

function warnFailure(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[anytime-loop-detector] ${context}: ${message}`);
}

export interface LoopState {
  /** 直近シグネチャ列（古い → 新しい）。長さ上限 LOOP_WINDOW。 */
  signatures: string[];
  /** 直前に警告済みの alarm key（`warn:<sig>` / `kill:<sig>` / `osc:<key>`）。窓内 1 回制限用。 */
  lastWarnedKey: string | null;
  /** UTC ISO 8601 */
  updatedAt: string;
}

export interface LoopVerdict {
  kind: 'none' | 'warn' | 'kill';
  pattern?: 'consecutive' | 'oscillation';
  signature?: string;
  count?: number;
}

export function emptyLoopState(): LoopState {
  return { signatures: [], lastWarnedKey: null, updatedAt: new Date().toISOString() };
}

/** JSON 値のキーを再帰ソートして安定化する（配列順は意味を持つため保持）。 */
/** ロケール非依存のコード単位比較。正準キーは環境が変わっても同一順序でなければならない。 */
function compareByCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort(compareByCodeUnit)) {
      out[key] = canonicalize(src[key]);
    }
    return out;
  }
  return value;
}

/** ツール呼出の同一性キー。tool_name + 正規化 tool_input の sha256。 */
export function toolSignature(toolName: string, toolInput: unknown): string {
  const canonical = JSON.stringify(canonicalize(toolInput ?? null));
  return createHash('sha256').update(`${toolName}\n${canonical}`).digest('hex');
}

/** 末尾から signature と同一の連続数を数える。 */
function trailingRun(signatures: string[]): number {
  const last = signatures.at(-1);
  if (last === undefined) return 0;
  let run = 0;
  for (let i = signatures.length - 1; i >= 0 && signatures[i] === last; i--) run++;
  return run;
}

/**
 * シグネチャを 1 件取り込み、新しい状態と判定を返す純粋関数。
 *
 * 優先順位: kill（連続 >= KILL_CONSECUTIVE）> warn（連続 >= WARN_CONSECUTIVE）
 * > 振動 warn（直近 OSCILLATION_WINDOW のユニーク数が 2 以下）。
 * 同一 alarm key への再警告は抑制し、どの条件も満たさないときに抑制状態を解除する
 * （介在呼出後の新しい run では再び警告できる）。
 */
export function evaluateLoop(
  state: LoopState,
  signature: string,
): { state: LoopState; verdict: LoopVerdict } {
  const signatures = [...state.signatures, signature].slice(-LOOP_WINDOW);
  const run = trailingRun(signatures);

  let alarmKey: string | null = null;
  let verdict: LoopVerdict = { kind: 'none' };

  if (run >= KILL_CONSECUTIVE) {
    alarmKey = `kill:${signature}`;
    verdict = { kind: 'kill', pattern: 'consecutive', signature, count: run };
  } else if (run >= WARN_CONSECUTIVE) {
    alarmKey = `warn:${signature}`;
    verdict = { kind: 'warn', pattern: 'consecutive', signature, count: run };
  } else if (signatures.length >= OSCILLATION_WINDOW) {
    const window = signatures.slice(-OSCILLATION_WINDOW);
    const unique = [...new Set(window)].sort(compareByCodeUnit);
    if (unique.length === 2) {
      alarmKey = `osc:${unique.join(',')}`;
      verdict = { kind: 'warn', pattern: 'oscillation', signature, count: OSCILLATION_WINDOW };
    }
  }

  const suppressed = alarmKey !== null && alarmKey === state.lastWarnedKey;
  return {
    state: { signatures, lastWarnedKey: alarmKey, updatedAt: new Date().toISOString() },
    verdict: suppressed ? { kind: 'none' } : verdict,
  };
}

/** sessionId をファイル名に安全な形へ正規化する（パス区切り・`..` を無害化）。 */
function safeSessionFileName(sessionId: string): string {
  const cleaned = sessionId.replaceAll(/[^A-Za-z0-9._-]/g, '_').replaceAll('..', '_');
  return `${cleaned === '' ? 'unknown' : cleaned}.json`;
}

export function loopStatePath(airspaceDir: string, sessionId: string): string {
  return join(airspaceDir, STATE_DIRNAME, safeSessionFileName(sessionId));
}

/** 状態を読む。不在・破損・型不一致は空状態（fail-open）。 */
export function readLoopState(airspaceDir: string, sessionId: string): LoopState {
  const file = loopStatePath(airspaceDir, sessionId);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    // 不在（ENOENT）はセッション初回の通常運転。毎ツール実行で呼ばれるためログしない。
    if (code !== 'ENOENT') warnFailure(`readLoopState:read:${file}`, error);
    return emptyLoopState();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyLoopState();
    const candidate = parsed as Record<string, unknown>;
    if (
      !Array.isArray(candidate['signatures']) ||
      !candidate['signatures'].every((s) => typeof s === 'string') ||
      typeof candidate['updatedAt'] !== 'string'
    ) {
      return emptyLoopState();
    }
    const lastWarnedKey = candidate['lastWarnedKey'];
    return {
      signatures: candidate['signatures'],
      lastWarnedKey: typeof lastWarnedKey === 'string' ? lastWarnedKey : null,
      updatedAt: candidate['updatedAt'],
    };
  } catch (error: unknown) {
    warnFailure(`readLoopState:parse:${file}`, error); // 破損も fail-open（警告付き）
    return emptyLoopState();
  }
}

/** 24 時間超更新のない他セッションの状態ファイルを間引く（残骸の無制限堆積を防ぐ）。 */
function pruneStaleStates(stateDir: string, keepFile: string): void {
  let entries: string[];
  try {
    entries = readdirSync(stateDir);
  } catch {
    return; // ディレクトリ不在等。作成直後に書くので致命ではない。
  }
  const now = Date.now();
  for (const entry of entries) {
    if (entry === keepFile || !entry.endsWith('.json')) continue;
    const full = join(stateDir, entry);
    try {
      if (now - statSync(full).mtimeMs > STALE_STATE_MS) rmSync(full, { force: true });
    } catch (error: unknown) {
      warnFailure(`pruneStaleStates:${full}`, error);
    }
  }
}

/** 副作用: 状態ファイルを tmp 書込 → rename で原子的に更新し、古い残骸を間引く。 */
export function writeLoopState(airspaceDir: string, sessionId: string, state: LoopState): void {
  const stateDir = join(airspaceDir, STATE_DIRNAME);
  const file = loopStatePath(airspaceDir, sessionId);
  try {
    mkdirSync(stateDir, { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(state)}\n`, 'utf8');
    renameSync(tmp, file);
  } catch (error: unknown) {
    warnFailure(`writeLoopState:${file}`, error); // 書けなくても検知 1 回の欠落のみ（fail-open）
    return;
  }
  pruneStaleStates(stateDir, safeSessionFileName(sessionId));
}
