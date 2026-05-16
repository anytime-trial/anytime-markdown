import type { ChatProvider, EmbeddingProvider } from '@anytime-markdown/llm-core';
import { Emitter, type Disposable } from '../util/Emitter';
import type {
  ProviderKind,
  ProviderRegistration,
  ProviderRegistryChange,
} from './types';

export class ProviderRegistry {
  private readonly byKind = new Map<ProviderKind, Map<string, ProviderRegistration>>([
    ['chat', new Map()],
    ['embedding', new Map()],
  ]);
  private readonly active = new Map<ProviderKind, string | undefined>([
    ['chat', undefined],
    ['embedding', undefined],
  ]);
  private readonly changed = new Emitter<ProviderRegistryChange>();

  register(reg: ProviderRegistration): void {
    const slot = this.byKind.get(reg.kind)!;
    if (slot.has(reg.id)) {
      throw new Error(`Provider already registered: kind=${reg.kind} id=${reg.id}`);
    }
    slot.set(reg.id, reg);
    this.changed.emit({ type: 'register', id: reg.id, kind: reg.kind });

    if (this.active.get(reg.kind) === undefined) {
      this.active.set(reg.kind, reg.id);
      this.changed.emit({ type: 'activate', id: reg.id, kind: reg.kind });
    }
  }

  unregister(id: string): boolean {
    for (const [kind, slot] of this.byKind) {
      if (!slot.has(id)) continue;
      slot.delete(id);
      this.changed.emit({ type: 'unregister', id, kind });

      if (this.active.get(kind) === id) {
        const next = slot.keys().next();
        const nextId = next.done ? undefined : next.value;
        this.active.set(kind, nextId);
        if (nextId !== undefined) {
          this.changed.emit({ type: 'activate', id: nextId, kind });
        }
      }
      return true;
    }
    return false;
  }

  setActive(id: string): void {
    for (const [kind, slot] of this.byKind) {
      if (!slot.has(id)) continue;
      if (this.active.get(kind) === id) return;
      this.active.set(kind, id);
      this.changed.emit({ type: 'activate', id, kind });
      return;
    }
    throw new Error(`Provider not registered: id=${id}`);
  }

  getActive(kind: 'chat'): ChatProvider | undefined;
  getActive(kind: 'embedding'): EmbeddingProvider | undefined;
  getActive(kind: ProviderKind): ChatProvider | EmbeddingProvider | undefined {
    const activeId = this.active.get(kind);
    if (activeId === undefined) return undefined;
    const reg = this.byKind.get(kind)!.get(activeId);
    return reg?.provider;
  }

  list(kind?: ProviderKind): ProviderRegistration[] {
    if (kind !== undefined) {
      return Array.from(this.byKind.get(kind)!.values());
    }
    const all: ProviderRegistration[] = [];
    for (const slot of this.byKind.values()) {
      for (const reg of slot.values()) all.push(reg);
    }
    return all;
  }

  onChanged(listener: (change: ProviderRegistryChange) => void): Disposable {
    return this.changed.on(listener);
  }
}
