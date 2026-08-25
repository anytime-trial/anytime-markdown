import * as path from 'node:path';

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** 既存エントリを陳腐化と判定するための材料。純粋性のため実在判定は注入する。 */
export interface StalenessPolicy {
  /** 絶対パスが現行環境に実在するか。 */
  pathExists: (absolutePath: string) => boolean;
  /** 拡張が生成する派生 env キー。期待値と異なれば陳腐化とみなす。 */
  managedEnvKeys?: readonly string[];
  /** 拡張が出力をやめた env キー。既存エントリに残っていれば陳腐化とみなす。 */
  obsoleteEnvKeys?: readonly string[];
}

/**
 * 既存エントリのどこが陳腐化しているか。
 *
 * 文字列ではなく判別子つきの union にしてあるのは、**理由ごとに更新範囲を変える**ため。
 * 理由が 1 つでも立ったらエントリを丸ごと生成値へ置換すると、利用者が足した `cwd` や
 * 追加の環境変数を巻き添えで消す（2026-08-25 の相互レビュー error 2 件）。
 * 文字列から `key` を切り出す実装にすると、`:` を含む env キーで壊れる。
 */
export type StaleReason =
  | { readonly kind: 'malformed-entry' }
  | { readonly kind: 'command-missing'; readonly path: string }
  | { readonly kind: 'args-missing'; readonly path: string }
  | { readonly kind: 'env-drift'; readonly key: string }
  | { readonly kind: 'obsolete-env'; readonly key: string };

export type ReconcileResult =
  | { action: 'add'; nextJson: string }
  | { action: 'update'; nextJson: string; staleReasons: StaleReason[] }
  | { action: 'skip'; reason: 'up-to-date' | 'customized' | 'unparseable' };

/** 通知・ログ用の 1 行表現。 */
export function formatStaleReason(reason: StaleReason): string {
  switch (reason.kind) {
    case 'malformed-entry':
      return 'malformed-entry';
    case 'command-missing':
      return `command-missing:${reason.path}`;
    case 'args-missing':
      return `args-missing:${reason.path}`;
    case 'env-drift':
      return `env-drift:${reason.key}`;
    case 'obsolete-env':
      return `obsolete-env:${reason.key}`;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** env として妥当なら正規化して返す。未定義は空 object、壊れていれば null。 */
function normalizedEnv(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, envValue]) => typeof envValue !== 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function entriesEqual(existing: unknown, expected: McpServerEntry): boolean {
  if (!isPlainObject(existing)) return false;
  if (existing.command !== expected.command) return false;
  if (!isStringArray(existing.args)) return false;
  if (existing.args.length !== expected.args.length) return false;
  if (existing.args.some((arg, index) => arg !== expected.args[index])) return false;
  const existingEnv = normalizedEnv(existing.env);
  if (existingEnv === null) return false;
  const expectedEnv = expected.env ?? {};
  const existingKeys = Object.keys(existingEnv);
  const expectedKeys = Object.keys(expectedEnv);
  if (existingKeys.length !== expectedKeys.length) return false;
  if (!existingKeys.every((key) => Object.hasOwn(expectedEnv, key) && existingEnv[key] === expectedEnv[key])) {
    return false;
  }
  // command / args / env 以外のキー（`cwd` 等）を持つエントリは「同じ」ではない。
  // 触らない側（customized）へ倒すため、ここでは等価と認めない。
  return Object.keys(existing).every((key) => key === 'command' || key === 'args' || key === 'env');
}

/**
 * 既存エントリが現行環境で解決できるかを検査し、解決できない点を列挙する。
 *
 * 空配列は「現行環境で解決できる」＝利用者が意図して変えた構成とみなす合図であり、
 * 呼び出し側はそのエントリに触れてはならない。
 */
export function detectStaleReasons(
  existing: unknown,
  expected: McpServerEntry,
  policy: StalenessPolicy,
): StaleReason[] {
  if (
    !isPlainObject(existing) ||
    typeof existing.command !== 'string' ||
    !isStringArray(existing.args) ||
    existing.args.length === 0 ||
    normalizedEnv(existing.env) === null
  ) {
    return [{ kind: 'malformed-entry' }];
  }

  const reasons: StaleReason[] = [];
  if (path.isAbsolute(existing.command) && !policy.pathExists(existing.command)) {
    reasons.push({ kind: 'command-missing', path: existing.command });
  }
  // 起動対象が第 1 引数に在るとは限らない（`npx tsx --tsconfig <path> <entry>` 等）ため
  // 全要素を見る。バージョン入り絶対パスがフラグの後ろへ回った時に検知漏れを起こさない。
  for (const arg of existing.args) {
    if (path.isAbsolute(arg) && !policy.pathExists(arg)) {
      reasons.push({ kind: 'args-missing', path: arg });
    }
  }

  const existingEnv = normalizedEnv(existing.env) ?? {};
  for (const key of policy.managedEnvKeys ?? []) {
    if (existingEnv[key] !== expected.env?.[key]) reasons.push({ kind: 'env-drift', key });
  }
  for (const key of policy.obsoleteEnvKeys ?? []) {
    if (Object.hasOwn(existingEnv, key)) reasons.push({ kind: 'obsolete-env', key });
  }
  return reasons;
}

/**
 * 陳腐化した点だけを直したエントリを返す。
 *
 * 直すのは理由が指した箇所に限る。利用者が足したフィールド（`cwd` 等）と、拡張が管理しない
 * env キー（`TRAIL_SERVER_URL` 等）は保持する。エントリ自体が壊れている場合だけは
 * マージ元が信用できないので生成値で置き換える。
 */
function applyStaleFixes(
  existing: Record<string, unknown>,
  expected: McpServerEntry,
  reasons: readonly StaleReason[],
): Record<string, unknown> {
  if (reasons.some((reason) => reason.kind === 'malformed-entry')) {
    return { ...expected };
  }

  const next: Record<string, unknown> = { ...existing };
  if (reasons.some((reason) => reason.kind === 'command-missing' || reason.kind === 'args-missing')) {
    next.command = expected.command;
    next.args = [...expected.args];
  }

  const env = { ...(normalizedEnv(existing.env) ?? {}) };
  let envTouched = false;
  for (const reason of reasons) {
    if (reason.kind === 'env-drift') {
      const expectedValue = expected.env?.[reason.key];
      if (expectedValue === undefined) delete env[reason.key];
      else env[reason.key] = expectedValue;
      envTouched = true;
    } else if (reason.kind === 'obsolete-env') {
      delete env[reason.key];
      envTouched = true;
    }
  }
  if (envTouched) {
    if (Object.keys(env).length === 0) delete next.env;
    else next.env = env;
  }
  return next;
}

/**
 * `.mcp.json` の生テキストに対し、`serverName` エントリを現行環境へ合わせた次版 JSON を返す。
 *
 * 自動登録（activate 時）のポリシー:
 * - エントリが無ければ追加する
 * - 現行の生成結果と等価なら何もしない（`skip: up-to-date`）
 * - 現行環境で解決できない点があれば、**その点だけ**を直す（`update`）。拡張が生成する
 *   派生値（実行ファイルパス・管理対象 env）は更新のたびに必ず陳腐化するため、これを
 *   利用者へ委ねると拡張更新のたびにサーバーが起動不能になる
 * - 内容は違うが現行環境で解決できる＝利用者が意図して変えた構成は触らない（`skip: customized`）
 * - パース不能・object でない JSON は書き換えない（`skip: unparseable`）。自動経路での
 *   バックアップ退避や新規作成は行わない（利用者の気づかない所でファイルを動かさない）
 *
 * 本関数は throw しない。
 *
 * @param raw `.mcp.json` の現内容。ファイル不在は null。
 */
export function reconcileMcpServerEntry(
  raw: string | null,
  serverName: string,
  entry: McpServerEntry,
  policy: StalenessPolicy,
): ReconcileResult {
  let root: Record<string, unknown> = {};
  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { action: 'skip', reason: 'unparseable' };
    }
    if (!isPlainObject(parsed)) return { action: 'skip', reason: 'unparseable' };
    // mcpServers が object 以外（文字列・数値・配列）に壊れている場合も throw せずスキップする。
    if (parsed.mcpServers !== undefined && !isPlainObject(parsed.mcpServers)) {
      return { action: 'skip', reason: 'unparseable' };
    }
    root = parsed;
  }

  const servers = (root.mcpServers as Record<string, unknown> | undefined) ?? {};
  if (!Object.hasOwn(servers, serverName)) {
    root.mcpServers = { ...servers, [serverName]: entry };
    return { action: 'add', nextJson: JSON.stringify(root, null, 2) + '\n' };
  }

  const existing = servers[serverName];
  if (entriesEqual(existing, entry)) return { action: 'skip', reason: 'up-to-date' };
  const staleReasons = detectStaleReasons(existing, entry, policy);
  if (staleReasons.length === 0) return { action: 'skip', reason: 'customized' };
  const nextEntry = applyStaleFixes(isPlainObject(existing) ? existing : {}, entry, staleReasons);
  root.mcpServers = { ...servers, [serverName]: nextEntry };
  return { action: 'update', nextJson: JSON.stringify(root, null, 2) + '\n', staleReasons };
}
