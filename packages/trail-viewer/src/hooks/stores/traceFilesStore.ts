/**
 * traceFilesStore — framework-agnostic vanilla store that reproduces
 * `useTraceFiles` without React.
 *
 * API surface:
 *   createTraceFilesStore(fetchList) → TraceFilesStore
 *   store.getState()   → readonly TraceFileSource[]
 *   store.subscribe(listener) → unsubscribe fn
 *   store.dispose()    → cancel in-flight fetch
 */

import type { TraceFileSource } from '@anytime-markdown/trace-viewer';
import type { TraceFileListing } from '../useTraceFiles';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface TraceFilesStore {
  getState(): readonly TraceFileSource[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTraceFilesStore(
  fetchList: (() => Promise<readonly TraceFileListing[]>) | null,
): TraceFilesStore {
  let disposed = false;
  let cancelled = false;
  let sources: readonly TraceFileSource[] = [];
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const l of listeners) l();
  }

  // Initial fetch (mirrors the useEffect in useTraceFiles)
  if (fetchList !== null) {
    void (async () => {
      try {
        const listings = await fetchList();
        if (cancelled || disposed) return;
        sources = listings.map((listing): TraceFileSource => ({
          name: listing.name,
          load: async () => {
            const res = await fetch(listing.url);
            if (!res.ok) throw new Error(`Failed to fetch ${listing.url}: ${res.status}`);
            return res.text();
          },
        }));
        notify();
      } catch (err: unknown) {
        if (cancelled || disposed) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[traceFilesStore] Failed to fetch trace file list: ${msg}`, err);
      }
    })();
  }

  function getState(): readonly TraceFileSource[] {
    return sources;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose(): void {
    cancelled = true;
    disposed = true;
    listeners.clear();
  }

  return { getState, subscribe, dispose };
}
