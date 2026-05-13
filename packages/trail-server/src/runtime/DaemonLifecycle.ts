import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DaemonInfo {
  schemaVersion: number;
  pid: number;
  host: string;
  port: number;
  url: string;
  version: string;
  startedAt: string;
  startedBy: 'cli' | 'extension-spawn';
  dbPath: string;
  gitRoots: string[];
  viewerDistPath: string;
  pidStartTime: number;
}

export interface DaemonLifecycleOptions {
  jsonPath: string;
  lockPath: string;
}

export class DaemonLifecycle {
  constructor(private readonly opts: DaemonLifecycleOptions) {}

  readDaemonJson(): DaemonInfo | undefined {
    if (!existsSync(this.opts.jsonPath)) return undefined;
    try {
      const raw = readFileSync(this.opts.jsonPath, 'utf8');
      return JSON.parse(raw) as DaemonInfo;
    } catch {
      return undefined;
    }
  }

  writeDaemonJson(info: DaemonInfo): void {
    mkdirSync(dirname(this.opts.jsonPath), { recursive: true });
    const tmp = `${this.opts.jsonPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(info, null, 2));
    try { chmodSync(tmp, 0o600); } catch { /* tmpfs may not support chmod */ }
    renameSync(tmp, this.opts.jsonPath);
  }

  removeDaemonJson(): void {
    if (existsSync(this.opts.jsonPath)) {
      rmSync(this.opts.jsonPath);
    }
  }

  isDaemonAlive(): boolean {
    const info = this.readDaemonJson();
    if (!info) return false;
    return isPidAlive(info.pid);
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const e = err as { code?: string };
    return e.code === 'EPERM';
  }
}
