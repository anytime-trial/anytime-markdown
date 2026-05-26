import { Emitter, type Disposable } from '../util/Emitter';
import type { ProviderKind, ProviderRegistration } from '../registry/types';
import type { ProviderRegistry } from '../registry/ProviderRegistry';
import type { HealthSnapshot } from './types';

export class HealthMonitor {
  private readonly snapshots = new Map<string, HealthSnapshot>();
  private readonly changed = new Emitter<HealthSnapshot>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

  async checkOnce(): Promise<void> {
    const targets = this.registry.list();
    await Promise.all(targets.map((t) => this.checkOne(t)));
  }

  start(intervalSec: number): void {
    if (this.timer !== undefined) return;
    if (intervalSec <= 0) {
      throw new Error(`HealthMonitor intervalSec must be > 0, got ${intervalSec}`);
    }
    this.timer = setInterval(() => {
      void this.checkOnce();
    }, intervalSec * 1000);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getSnapshot(providerId: string): HealthSnapshot | undefined {
    return this.snapshots.get(snapshotKey(providerId, 'chat'))
      ?? this.snapshots.get(snapshotKey(providerId, 'embedding'));
  }

  getAll(): HealthSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  onChanged(listener: (snapshot: HealthSnapshot) => void): Disposable {
    return this.changed.on(listener);
  }

  dispose(): void {
    this.stop();
    this.changed.dispose();
  }

  private async checkOne(reg: ProviderRegistration): Promise<void> {
    let result: { ok: boolean; detail?: string };
    try {
      result = await reg.provider.healthCheck();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      result = { ok: false, detail: `healthCheck threw: ${detail}` };
    }

    const next: HealthSnapshot = {
      providerId: reg.id,
      kind: reg.kind,
      ok: result.ok,
      detail: result.detail,
      checkedAt: this.clock(),
    };

    const key = snapshotKey(reg.id, reg.kind);
    const prev = this.snapshots.get(key);
    this.snapshots.set(key, next);

    if (prev?.ok !== next.ok || prev?.detail !== next.detail) {
      this.changed.emit(next);
    }
  }
}

function snapshotKey(providerId: string, kind: ProviderKind): string {
  return `${kind}:${providerId}`;
}
