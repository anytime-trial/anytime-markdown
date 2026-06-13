import type { Action, GraphState } from '@anytime-markdown/graph-core/state';
import { createInitialState, graphReducer } from '@anytime-markdown/graph-core/state';

import type { GraphDocument } from '../types';

export type { Action, GraphState };

export interface GraphStore {
  getState(): GraphState;
  dispatch(action: Action): void;
  subscribe(cb: (state: GraphState) => void): () => void;
}

/**
 * React useReducer 相当の vanilla store。
 * graphReducer / createInitialState は graph-core の pure 関数を流用する。
 */
export function createGraphStore(initialDoc?: GraphDocument): GraphStore {
  let state: GraphState = createInitialState(initialDoc);
  const listeners = new Set<(state: GraphState) => void>();

  function getState(): GraphState {
    return state;
  }

  function dispatch(action: Action): void {
    state = graphReducer(state, action);
    for (const cb of listeners) {
      cb(state);
    }
  }

  function subscribe(cb: (state: GraphState) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }

  return { getState, dispatch, subscribe };
}
