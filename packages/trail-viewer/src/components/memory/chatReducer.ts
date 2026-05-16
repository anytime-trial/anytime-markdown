export interface ChatUiSource {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
}

export interface ChatUiMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly citations: ReadonlyArray<string>;
  readonly interrupted?: boolean;
  readonly error?: string;
}

export interface ChatState {
  readonly messages: ReadonlyArray<ChatUiMessage>;
  readonly streaming: boolean;
  readonly sources: ReadonlyArray<ChatUiSource>;
}

export const initialChatState: ChatState = {
  messages: [],
  streaming: false,
  sources: [],
};

export type ChatAction =
  | { type: 'SEND'; query: string }
  | { type: 'SOURCES'; sources: ReadonlyArray<ChatUiSource> }
  | { type: 'TOKEN'; delta: string }
  | { type: 'CITATION'; tag: string }
  | { type: 'ERROR'; message: string }
  | { type: 'DONE'; interrupted: boolean }
  | { type: 'ABORT' }
  | { type: 'CLEAR' };

function updateLastAssistant(
  state: ChatState,
  patch: (msg: ChatUiMessage) => ChatUiMessage,
): ChatState {
  const last = state.messages.at(-1);
  if (!last || last.role !== 'assistant') return state;
  const updated = patch(last);
  return { ...state, messages: [...state.messages.slice(0, -1), updated] };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND':
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'user', content: action.query, citations: [] },
          { role: 'assistant', content: '', citations: [] },
        ],
        streaming: true,
        sources: [],
      };
    case 'SOURCES':
      return { ...state, sources: action.sources };
    case 'TOKEN':
      return updateLastAssistant(state, (m) => ({
        ...m,
        content: m.content + action.delta,
      }));
    case 'CITATION':
      return updateLastAssistant(state, (m) => {
        if (m.citations.includes(action.tag)) return m;
        return { ...m, citations: [...m.citations, action.tag] };
      });
    case 'ERROR':
      return updateLastAssistant(state, (m) => ({ ...m, error: action.message }));
    case 'DONE':
      return action.interrupted
        ? {
            ...updateLastAssistant(state, (m) => ({ ...m, interrupted: true })),
            streaming: false,
          }
        : { ...state, streaming: false };
    case 'ABORT':
      return {
        ...updateLastAssistant(state, (m) => ({ ...m, interrupted: true })),
        streaming: false,
      };
    case 'CLEAR':
      return initialChatState;
  }
}
