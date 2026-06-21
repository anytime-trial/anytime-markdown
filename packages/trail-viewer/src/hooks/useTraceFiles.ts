import { useEffect, useMemo, useReducer } from 'react';
import type { TraceFileSource } from '@anytime-markdown/trace-viewer';

import { createTraceFilesStore } from './stores/traceFilesStore';

export interface TraceFileListing {
    name: string;
    url: string;
}

/**
 * Fetches a list of trace files and converts them into TraceFileSource objects.
 * Pass a function that returns an array of {name, url} objects for each .vscode/trace/*.json file.
 *
 * IMPORTANT: Wrap `fetchList` in `useCallback` to prevent re-fetch loops.
 * Passing a new function instance on every render will cause the effect to re-run
 * and trigger repeated network requests.
 */
export function useTraceFiles(
    fetchList: (() => Promise<readonly TraceFileListing[]>) | null,
): readonly TraceFileSource[] {
  const store = useMemo(
    () => createTraceFilesStore(fetchList),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchList],
  );

  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);

  useEffect(() => store.subscribe(forceUpdate), [store]);
  useEffect(() => () => store.dispose(), [store]);

  return store.getState();
}
