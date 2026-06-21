import { useEffect, useMemo, useReducer } from 'react';

import { createC4DataStore } from './stores/c4DataStore';

export type {
  AgentActivityEntry,
  AnalysisProgress,
  ClaudeActivityState,
  FileConflict,
  MultiAgentActivityState,
} from './c4WsMessages';
export type { AddElementRequest, AddRelationshipRequest } from './useC4Mutations';

export type { C4DataSourceResult as C4DataSourceResultType } from './stores/c4DataStore';

// Re-export the result shape under the original inferred name so that
// downstream consumers importing the type from this module still work.
import type { C4DataSourceResult } from './stores/c4DataStore';

// ---------------------------------------------------------------------------
// Thin adapter hook — delegates all logic to the vanilla C4DataStore
// ---------------------------------------------------------------------------

export function useC4DataSource(
  serverUrl: string,
  disableWebSocket = false,
  enabled = true,
): C4DataSourceResult {
  const store = useMemo(
    () => createC4DataStore(serverUrl, disableWebSocket, enabled),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverUrl, disableWebSocket, enabled],
  );

  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);

  useEffect(() => store.subscribe(forceUpdate), [store]);
  useEffect(() => () => store.dispose(), [store]);

  return store.getState();
}
