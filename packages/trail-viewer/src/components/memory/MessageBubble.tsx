import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ChatUiMessage, ChatUiSource } from './chatReducer';
import { CitationChip } from './CitationChip';

export interface MessageBubbleProps {
  readonly message: ChatUiMessage;
  readonly sources: ReadonlyArray<ChatUiSource>;
  readonly onCitationClick?: (tag: string) => void;
}

const CITATION_RE = /\[\^(entity|episode|drift):([a-zA-Z0-9_-]+)\]/g;

interface InlineToken {
  readonly kind: 'text' | 'citation';
  readonly value: string;
  readonly tag?: string;
}

function tokenizeContent(content: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIdx = 0;
  CITATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(content)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ kind: 'text', value: content.slice(lastIdx, match.index) });
    }
    tokens.push({ kind: 'citation', value: match[0], tag: `${match[1]}:${match[2]}` });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    tokens.push({ kind: 'text', value: content.slice(lastIdx) });
  }
  return tokens;
}

export function MessageBubble({
  message,
  sources,
  onCitationClick,
}: Readonly<MessageBubbleProps>) {
  const isUser = message.role === 'user';
  const sourceByTag = new Map(sources.map((s) => [`${s.kind}:${s.id}`, s]));
  const tokens = tokenizeContent(message.content);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        my: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          maxWidth: '85%',
          bgcolor: isUser ? 'action.hover' : 'background.paper',
          opacity: message.interrupted ? 0.7 : 1,
        }}
      >
        <Box sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {tokens.map((tk, i) =>
            tk.kind === 'text' ? (
              <span key={i}>{tk.value}</span>
            ) : (
              <CitationChip
                key={i}
                tag={tk.tag ?? tk.value}
                title={sourceByTag.get(tk.tag ?? '')?.title}
                onClick={onCitationClick}
              />
            ),
          )}
        </Box>
        {message.error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            {message.error}
          </Typography>
        )}
        {message.interrupted && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            (interrupted)
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
