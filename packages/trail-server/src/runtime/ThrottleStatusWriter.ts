import * as fs from 'node:fs';
import type { OllamaThrottleGovernor, ThrottleSnapshot } from '@anytime-markdown/agent-core';

/** throttle-status.json の中身。snapshot + 書き込み時刻。 */
export interface ThrottleStatusFile extends ThrottleSnapshot {
  updatedAt: string;
}

export interface ThrottleStatusWriterDeps {
  now: () => number;
  writeFile: (path: string, data: string) => void;
}

const defaultDeps: ThrottleStatusWriterDeps = {
  now: () => Date.now(),
  writeFile: (path, data) => fs.writeFileSync(path, data),
};

/**
 * governor の snapshot を throttle-status.json に書き出す。enabled 時・前回から変化時のみ書く。
 * OLLAMA パネル (vscode-agent-extension) が poll して読む。
 */
export class ThrottleStatusWriter {
  private last = '';
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly governor: Pick<OllamaThrottleGovernor, 'snapshot'>,
    private readonly filePath: string,
    private readonly logger: { error: (msg: string, err?: unknown) => void },
    private readonly deps: ThrottleStatusWriterDeps = defaultDeps,
  ) {}

  /** snapshot を取り、enabled かつ前回から変化していれば書く。戻り値 = 書いたか。 */
  writeIfChanged(): boolean {
    const snapshot = this.governor.snapshot();
    if (!snapshot.enabled) return false;
    const body = JSON.stringify(snapshot);
    if (body === this.last) return false;
    this.last = body;
    const file: ThrottleStatusFile = {
      ...snapshot,
      updatedAt: new Date(this.deps.now()).toISOString(),
    };
    try {
      this.deps.writeFile(this.filePath, JSON.stringify(file));
      return true;
    } catch (err) {
      this.logger.error(`throttle-status write failed: ${this.filePath}`, err);
      return false;
    }
  }

  start(intervalMs = 5000): void {
    this.writeIfChanged();
    this.timer = setInterval(() => this.writeIfChanged(), intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
