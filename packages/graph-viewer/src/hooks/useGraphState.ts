'use client';

import type { Action,GraphState } from '@anytime-markdown/graph-core/state';
import { createInitialState,graphReducer } from '@anytime-markdown/graph-core/state';
import { useReducer } from 'react';

import { GraphDocument } from '../types';

export type { Action,GraphState };

export function useGraphState(initialDoc?: GraphDocument) {
  const [state, dispatch] = useReducer(graphReducer, initialDoc, createInitialState);
  return { state, dispatch };
}
