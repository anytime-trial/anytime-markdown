import type {
  RawJsonlMessage,
  RawContentBlock,
  RawUsage,
  TrailMessage,
  TrailSession,
  TrailTokenUsage,
  TrailToolCall,
} from './types';

const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

const EMPTY_USAGE: TrailTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

function convertUsage(raw: RawUsage | undefined): TrailTokenUsage {
  if (!raw) {
    return { ...EMPTY_USAGE };
  }
  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheReadTokens: raw.cache_read_input_tokens ?? 0,
    cacheCreationTokens: raw.cache_creation_input_tokens ?? 0,
  };
}

function extractTextContent(
  content: string | readonly RawContentBlock[] | undefined,
): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const texts = content
    .filter((b): b is RawContentBlock & { text: string } =>
      b.type === 'text' && typeof b.text === 'string',
    )
    .map((b) => b.text);
  return texts.length > 0 ? texts.join('\n') : undefined;
}

function extractToolCalls(
  content: string | readonly RawContentBlock[] | undefined,
): readonly TrailToolCall[] | undefined {
  if (typeof content === 'string' || !Array.isArray(content)) {
    return undefined;
  }
  const calls = content
    .filter((b) => b.type === 'tool_use')
    .map((b): TrailToolCall => ({
      id: b.id ?? '',
      name: b.name ?? '',
      input: b.input ?? {},
    }));
  return calls.length > 0 ? calls : undefined;
}

function shouldSkip(raw: RawJsonlMessage): boolean {
  if (SKIP_TYPES.has(raw.type)) {
    return true;
  }
  if (raw.isMeta === true) {
    return true;
  }
  if (raw.type === 'system' && raw.subtype === 'turn_duration') {
    return true;
  }
  return false;
}

function convertMessage(raw: RawJsonlMessage): TrailMessage {
  const base = {
    uuid: raw.uuid ?? '',
    parentUuid: raw.parentUuid ?? null,
    timestamp: raw.timestamp ?? '',
    isSidechain: raw.isSidechain ?? false,
    subtype: raw.subtype,
  };

  if (raw.type === 'user') {
    const userContent =
      typeof raw.message?.content === 'string'
        ? raw.message.content
        : undefined;
    return {
      ...base,
      type: 'user',
      userContent,
    };
  }

  if (raw.type === 'assistant') {
    return {
      ...base,
      type: 'assistant',
      model: raw.message?.model,
      textContent: extractTextContent(raw.message?.content),
      toolCalls: extractToolCalls(raw.message?.content),
      usage: convertUsage(raw.message?.usage),
    };
  }

  return {
    ...base,
    type: 'system',
  };
}

function aggregateUsage(messages: readonly TrailMessage[]): TrailTokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  for (const msg of messages) {
    if (msg.usage) {
      inputTokens += msg.usage.inputTokens;
      outputTokens += msg.usage.outputTokens;
      cacheReadTokens += msg.usage.cacheReadTokens;
      cacheCreationTokens += msg.usage.cacheCreationTokens;
    }
  }

  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}

export function parseSession(
  jsonlContent: string,
  projectName: string,
): { session: TrailSession; messages: TrailMessage[] } {
  const lines = jsonlContent.split('\n').filter((line) => line.trim() !== '');
  const parsedRaws: RawJsonlMessage[] = [];

  for (const line of lines) {
    try {
      parsedRaws.push(JSON.parse(line) as RawJsonlMessage);
    } catch {
      // Skip malformed JSON lines
    }
  }

  const filtered = parsedRaws.filter((raw) => !shouldSkip(raw));
  const messages = filtered.map(convertMessage);

  const firstRaw = filtered[0];
  const firstAssistant = filtered.find((r) => r.type === 'assistant');
  const lastRaw = filtered.at(-1);

  const session: TrailSession = {
    id: firstRaw?.sessionId ?? '',
    slug: firstRaw?.slug ?? firstAssistant?.slug ?? '',
    project: projectName,
    gitBranch: firstRaw?.gitBranch ?? '',
    startTime: firstRaw?.timestamp ?? '',
    endTime: lastRaw?.timestamp ?? '',
    version: firstRaw?.version ?? '',
    model: firstAssistant?.message?.model ?? '',
    messageCount: messages.length,
    usage: aggregateUsage(messages),
  };

  return { session, messages };
}
