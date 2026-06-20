import { useEffect, useReducer, useRef, useState } from 'react';
import { Box, IconButton, TextField, Send as SendIcon, Stop as StopIcon } from '../../ui';
import { useTrailI18n } from '../../i18n';
import { chatReducer, initialChatState, type ChatUiSource } from './chatReducer';
import { MessageBubble } from './MessageBubble';
import type { ChatBridge } from '../../hooks/useChatBridge';

interface IncomingChunk {
  type: 'sources' | 'token' | 'citation' | 'done' | 'error';
  payload: unknown;
}

function isChunk(x: unknown): x is IncomingChunk {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { type?: unknown }).type === 'string'
  );
}

export interface ChatPaneProps {
  readonly bridge: ChatBridge;
  readonly onSourcesChange?: (sources: ReadonlyArray<ChatUiSource>) => void;
  readonly onCitationClick?: (tag: string) => void;
}

export function ChatPane({
  bridge,
  onSourcesChange,
  onCitationClick,
}: Readonly<ChatPaneProps>) {
  const { t } = useTrailI18n();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = bridge.subscribe((raw) => {
      if (!isChunk(raw)) return;
      switch (raw.type) {
        case 'sources': {
          const sources = (raw.payload ?? []) as ReadonlyArray<ChatUiSource>;
          dispatch({ type: 'SOURCES', sources });
          onSourcesChange?.(sources);
          break;
        }
        case 'token': {
          const p = raw.payload as { delta?: string };
          if (typeof p.delta === 'string') dispatch({ type: 'TOKEN', delta: p.delta });
          break;
        }
        case 'citation': {
          const p = raw.payload as { tag?: string };
          if (typeof p.tag === 'string') dispatch({ type: 'CITATION', tag: p.tag });
          break;
        }
        case 'done': {
          const p = raw.payload as { interrupted?: boolean };
          dispatch({ type: 'DONE', interrupted: !!p.interrupted });
          break;
        }
        case 'error': {
          const p = raw.payload as { message?: string };
          dispatch({ type: 'ERROR', message: p.message ?? 'unknown error' });
          dispatch({ type: 'DONE', interrupted: false });
          break;
        }
      }
    });
    return unsub;
  }, [bridge, onSourcesChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [state.messages]);

  const handleSend = (): void => {
    const query = input.trim();
    if (!query || state.streaming) return;
    dispatch({ type: 'SEND', query });
    bridge.send(query);
    setInput('');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        ref={scrollRef}
        sx={{ flex: 1, overflowY: 'auto', p: 2 }}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {state.messages.map((m, i) => (
          <MessageBubble
            key={i}
            message={m}
            sources={state.sources}
            onCitationClick={onCitationClick}
          />
        ))}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          p: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          gap: 1,
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={5}
          size="small"
          placeholder={t('memory.chat.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            } else if (e.key === 'Escape' && state.streaming) {
              e.preventDefault();
              bridge.abort();
            }
          }}
          inputProps={{ 'aria-label': t('memory.chat.placeholder') }}
        />
        {state.streaming ? (
          <IconButton
            aria-label={t('memory.chat.abort')}
            onClick={() => bridge.abort()}
          >
            <StopIcon />
          </IconButton>
        ) : (
          <IconButton
            aria-label={t('memory.chat.send')}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <SendIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
