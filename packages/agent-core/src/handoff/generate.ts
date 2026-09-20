// handoff/generate.ts — セッションの transcript を解決し、圧縮ステートを組成して保存し、
// レンダリング結果を返す。worker（node:sqlite を持つ）から呼ぶ生成ロジック。UI からは
// HTTP 経由でこれを呼ぶだけにし、生成ロジックを UI に置かない（RFC の分離方針）。

import { accessSync, constants, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import type { AgentStatusStore } from '../status/AgentStatusStore';
import { parse } from './parseTranscript';
import { parseCodexTranscript } from './parseCodexTranscript';
import { buildHandoffState } from './buildHandoff';
import { renderHandoffMarkdown, renderHandoffInjection } from './render';
import { parseCodexSessionMeta } from '../codex/parseCodexRollout';
import type { HandoffState } from './types';

export interface GeneratedHandoff {
  readonly payload: HandoffState;
  /** handoff/<id>.md 用の人間可読ドキュメント */
  readonly markdown: string;
  /** 新セッションへ注入する untrusted-fence 付きテキスト */
  readonly injection: string;
}

export interface GenerateHandoffOptions {
  /** Claude Code の projects ディレクトリ。既定は ~/.claude/projects */
  readonly projectsDir?: string;
}

/** projects 配下の各ディレクトリから `<sessionId>.jsonl` を探す。見つからなければ null。 */
export function findTranscriptPath(sessionId: string, projectsDir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(projectsDir);
  } catch (err) {
    console.error(`[handoff] failed to read projects dir: ${projectsDir}`, err);
    return null;
  }
  for (const dir of entries) {
    const candidate = join(projectsDir, dir, `${sessionId}.jsonl`);
    try {
      accessSync(candidate, constants.R_OK);
      return candidate;
    } catch {
      // このプロジェクトには無い
    }
  }
  return null;
}

/**
 * 指定セッションの handoff を生成し、圧縮ステートを agent_sessions.summary に保存する
 * （handoff_at も確定）。transcript が見つからなければ null。
 */
export function generateHandoff(
  store: AgentStatusStore,
  sessionId: string,
  options: GenerateHandoffOptions = {},
): GeneratedHandoff | null {
  const projectsDir = options.projectsDir ?? join(homedir(), '.claude', 'projects');
  const transcriptPath = findTranscriptPath(sessionId, projectsDir);
  if (!transcriptPath) return null;

  const row = store.queryOne(sessionId);
  const events = parse(transcriptPath);
  const payload = buildHandoffState(events, {
    branch: row?.branch ?? '',
    lastCommit: row?.lastCommit?.hash ?? '',
  });

  store.upsertSummary({ sessionId, summary: JSON.stringify(payload) });

  return {
    payload,
    markdown: renderHandoffMarkdown(payload),
    injection: renderHandoffInjection(payload),
  };
}

// ---------------------------------------------------------------------------
// Codex 版 generateHandoff
//
// Codex セッションは agent_sessions に行を持たない（Codex は agent-status DB へ状態を POST
// しないため）。generateHandoff と異なり AgentStatusStore には一切書き込まない — もし
// upsertSummary を呼ぶと、Codex の sessionId で agent_sessions に最小行が新規作成され、
// Agent Mapping に「幽霊 Claude セッション」が出現する（insertGitActivity のコメントが警告する
// のと同じ罠）。Codex の圧縮ステートは呼び出し側（拡張）が handoff doc ファイルへ保存するだけで
// 完結させる。
// ---------------------------------------------------------------------------

const CODEX_META_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_CODEX_SCAN = 2000;

/** 先頭 1 行（改行まで）を上限付きで読む。CodexSessionScanner.readFirstLine と同一契約。 */
function readFirstLineSync(path: string, maxBytes: number): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const chunk = Buffer.alloc(64 * 1024);
    let acc = '';
    let pos = 0;
    while (pos < maxBytes) {
      const want = Math.min(chunk.length, maxBytes - pos);
      const read = readSync(fd, chunk, 0, want, pos);
      if (read === 0) break;
      acc += chunk.toString('utf8', 0, read);
      const nl = acc.indexOf('\n');
      if (nl !== -1) return acc.slice(0, nl);
      pos += read;
    }
    return pos >= maxBytes ? null : acc;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch (err) {
        console.error(`[handoff] failed to close fd for ${path}`, err);
      }
    }
  }
}

/** rootDir 配下を再帰走査し rollout-*.jsonl のパス一覧を返す（上限 maxFiles）。 */
function collectCodexRolloutFiles(rootDir: string, maxFiles: number): string[] {
  if (maxFiles <= 0) return [];
  let entries: string[];
  try {
    entries = readdirSync(rootDir, { recursive: true }) as string[];
  } catch (err) {
    console.error(`[handoff] failed to read Codex sessions dir: ${rootDir}`, err);
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (basename(entry).startsWith('rollout-') && entry.endsWith('.jsonl')) {
      files.push(join(rootDir, entry));
      if (files.length >= maxFiles) {
        console.error(`[handoff] Codex rollout scan reached maxFiles=${maxFiles}; some sessions may be unreachable`);
        break;
      }
    }
  }
  return files;
}

/**
 * sessionId に一致する session_meta.id を持つ rollout パスを探す（先頭行だけを読む）。
 * 「引継ぎディレクトリの最新ファイル」のような曖昧選択はせず、選択したセッション ID に
 * 一対一で対応する rollout だけを返す（NFR-02）。見つからなければ null。
 */
export function findCodexRolloutPath(
  sessionId: string,
  rootDir: string,
  maxFiles: number = DEFAULT_MAX_CODEX_SCAN,
): string | null {
  for (const file of collectCodexRolloutFiles(rootDir, maxFiles)) {
    const firstLine = readFirstLineSync(file, CODEX_META_MAX_BYTES);
    if (firstLine === null) continue;
    const meta = parseCodexSessionMeta(firstLine);
    if (meta?.sessionId === sessionId) return file;
  }
  return null;
}

export interface GenerateCodexHandoffOptions {
  /** `~/.codex/sessions` のルート。テストでは一時ディレクトリを渡す。 */
  readonly rootDir?: string;
  readonly maxFilesScanned?: number;
}

export interface GeneratedCodexHandoff extends GeneratedHandoff {
  /** rollout の session_meta.cwd（新規 Codex セッションの起動ディレクトリ）。 */
  readonly cwd: string;
}

/**
 * 指定 Codex セッションの handoff を生成する（決定論抽出 → 圧縮ステート組成 → レンダリング）。
 * 該当 rollout が見つからない・読めない・session_meta が不正なら null。
 */
export function generateCodexHandoff(
  sessionId: string,
  options: GenerateCodexHandoffOptions = {},
): GeneratedCodexHandoff | null {
  const rootDir = options.rootDir ?? join(homedir(), '.codex', 'sessions');
  const rolloutPath = findCodexRolloutPath(sessionId, rootDir, options.maxFilesScanned);
  if (!rolloutPath) return null;

  const parsed = parseCodexTranscript(rolloutPath);
  if (!parsed) return null;

  const payload = buildHandoffState(parsed.events);
  return {
    payload,
    markdown: renderHandoffMarkdown(payload),
    injection: renderHandoffInjection(payload),
    cwd: parsed.cwd,
  };
}
