'use client';

import { useReducer } from 'react';
import { GraphDocument } from '../types';
import { graphReducer, createInitialState } from '@anytime-markdown/graph-core/state';
import type { GraphState, Action } from '@anytime-markdown/graph-core/state';

export type { GraphState, Action };

export function useGraphState(initialDoc?: GraphDocument) {
  const [state, dispatch] = useReducer(graphReducer, initialDoc, createInitialState);
  return { state, dispatch };
}
