export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
  readonly timestamp?: string;
}

export interface ChatFilters {
  readonly repo_name?: string;
  readonly entity_types?: ReadonlyArray<string>;
  readonly include_episodes?: boolean;
  readonly include_drift?: boolean;
}

export interface ChatTurnInput {
  readonly query: string;
  readonly history: ReadonlyArray<ChatMessage>;
  readonly filters?: ChatFilters;
  readonly signal?: AbortSignal;
}

export type ChatChunk =
  | {
      readonly type: 'sources';
      readonly payload: ReadonlyArray<{ id: string; title: string; kind: string }>;
    }
  | { readonly type: 'token'; readonly payload: { readonly delta: string } }
  | {
      readonly type: 'citation';
      readonly payload: { readonly tag: string; readonly sourceId: string };
    }
  | {
      readonly type: 'done';
      readonly payload: { readonly interrupted: boolean; readonly totalMs: number };
    }
  | { readonly type: 'error'; readonly payload: { readonly message: string } };
