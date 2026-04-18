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
      stopReason: raw.message?.stop_reason,
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

  let peakContextTokens = 0;
  const firstAssistantMsg = messages.find((m) => m.type === 'assistant' && m.usage);
  const initialContextTokens = firstAssistantMsg?.usage?.cacheCreationTokens ?? 0;
  for (const msg of messages) {
    if (msg.usage) {
      const ctx = msg.usage.inputTokens + msg.usage.cacheReadTokens + msg.usage.cacheCreationTokens;
      if (ctx > peakContextTokens) peakContextTokens = ctx;
    }
  }

  // Detect session interruption
  const lastMessage = messages.at(-1);
  const lastAssistant = [...messages].reverse().find((m) => m.type === 'assistant');
  let interruption: TrailSession['interruption'];
  if (lastAssistant?.stopReason === 'max_tokens') {
    // Output hit max_tokens limit
    const u = lastAssistant.usage;
    const ctxTokens = u
      ? u.inputTokens + u.cacheReadTokens + u.cacheCreationTokens
      : 0;
    interruption = { interrupted: true, reason: 'max_tokens', contextTokens: ctxTokens };
  } else if (lastMessage?.type === 'user') {
    // Session ended with a user message — no assistant response
    const prevAssistant = [...messages].reverse().find((m) => m.type === 'assistant');
    const ctxTokens = prevAssistant?.usage
      ? prevAssistant.usage.inputTokens + prevAssistant.usage.cacheReadTokens + prevAssistant.usage.cacheCreationTokens
      : 0;
    interruption = { interrupted: true, reason: 'no_response', contextTokens: ctxTokens };
  }

  let errorCount = 0;
  let subAgentCount = 0;
  for (const raw of parsedRaws) {
    if (!Array.isArray(raw.message?.content)) continue;
    for (const block of raw.message.content as readonly RawContentBlock[]) {
      if (raw.type === 'user' && block.type === 'tool_result' && block.is_error === true) errorCount++;
      if (raw.type === 'assistant' && block.type === 'tool_use' && block.name === 'Agent') subAgentCount++;
    }
  }

  // 自動 /compact の検出: 連続する assistant ターンで cacheRead が
  // 50K 以上積まれていた状態から 70% 以上減少したケースをカウント
  let compactCount = 0;
  const assistantWithUsage = messages.filter((m) => m.type === 'assistant' && m.usage);
  for (let i = 1; i < assistantWithUsage.length; i++) {
    const prev = assistantWithUsage[i - 1].usage?.cacheReadTokens ?? 0;
    const cur = assistantWithUsage[i].usage?.cacheReadTokens ?? 0;
    if (prev >= 50_000 && cur <= prev * 0.3) compactCount++;
  }

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
    peakContextTokens,
    initialContextTokens,
    interruption,
    usage: aggregateUsage(messages),
    errorCount: errorCount > 0 ? errorCount : undefined,
    subAgentCount: subAgentCount > 0 ? subAgentCount : undefined,
    compactCount: compactCount > 0 ? compactCount : undefined,
  };

  return { session, messages };
}
