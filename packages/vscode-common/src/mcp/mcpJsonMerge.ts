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

export type ReconcileResult =
  | { action: 'add'; nextJson: string }
  | { action: 'update'; nextJson: string; staleReasons: string[] }
  | { action: 'skip'; reason: 'up-to-date' | 'customized' | 'unparseable' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedEnv(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, envValue]) => typeof envValue !== 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function entriesEqual(existing: unknown, expected: McpServerEntry): boolean {
  if (!isPlainObject(existing)) return false;
  if (existing.command !== expected.command) return false;
  if (!Array.isArray(existing.args) || !existing.args.every((arg) => typeof arg === 'string')) {
    return false;
  }
  if (existing.args.length !== expected.args.length) return false;
  if (existing.args.some((arg, index) => arg !== expected.args[index])) return false;
  const existingEnv = normalizedEnv(existing.env);
  const expectedEnv = expected.env ?? {};
  if (existingEnv === null) return false;
  const existingKeys = Object.keys(existingEnv);
  const expectedKeys = Object.keys(expectedEnv);
  return (
    existingKeys.length === expectedKeys.length &&
    existingKeys.every((key) => Object.hasOwn(expectedEnv, key) && existingEnv[key] === expectedEnv[key])
  );
}

export function detectStaleReasons(
  existing: unknown,
  expected: McpServerEntry,
  policy: StalenessPolicy,
): string[] {
  if (
    !isPlainObject(existing) ||
    typeof existing.command !== 'string' ||
    !Array.isArray(existing.args) ||
    existing.args.length === 0 ||
    !existing.args.every((arg) => typeof arg === 'string')
  ) {
    return ['malformed-entry'];
  }

  const reasons: string[] = [];
  if (path.isAbsolute(existing.command) && !policy.pathExists(existing.command)) {
    reasons.push(`command-missing:${existing.command}`);
  }
  const firstArg = existing.args[0];
  if (path.isAbsolute(firstArg) && !policy.pathExists(firstArg)) {
    reasons.push(`args-missing:${firstArg}`);
  }

  const existingEnv = isPlainObject(existing.env) ? existing.env : {};
  for (const key of policy.managedEnvKeys ?? []) {
    if (existingEnv[key] !== expected.env?.[key]) reasons.push(`env-drift:${key}`);
  }
  for (const key of policy.obsoleteEnvKeys ?? []) {
    if (Object.hasOwn(existingEnv, key)) reasons.push(`obsolete-env:${key}`);
  }
  return reasons;
}

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
  root.mcpServers = { ...servers, [serverName]: entry };
  return { action: 'update', nextJson: JSON.stringify(root, null, 2) + '\n', staleReasons };
}
