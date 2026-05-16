import { extractWorkspace, toTrailMessage, toTrailSession } from '../mappers';

describe('toTrailSession', () => {
  const baseRow = {
    id: 's1',
    slug: 'slug-1',
    repo_name: 'repo',
    model: 'opus',
    version: '0.1.0',
    start_time: '2026-04-30T00:00:00.000Z',
    end_time: '2026-04-30T00:10:00.000Z',
    message_count: 2,
    peak_context_tokens: null,
    initial_context_tokens: null,
    interruption_reason: null,
    interruption_context_tokens: null,
    compact_count: null,
    sub_agent_count: null,
    error_count: null,
    assistant_message_count: null,
    source: 'claude_code' as const,
    trail_session_costs: [],
  };

  it('maps session source into TrailSession', () => {
    const session = toTrailSession({ ...baseRow, source: 'codex' }, []);
    expect(session.source).toBe('codex');
  });

  it('propagates subAgentCount from row.sub_agent_count', () => {
    const session = toTrailSession({ ...baseRow, sub_agent_count: 3 }, []);
    expect(session.subAgentCount).toBe(3);
  });

  it('omits subAgentCount when 0 or null', () => {
    expect(toTrailSession({ ...baseRow, sub_agent_count: null }, []).subAgentCount).toBeUndefined();
    expect(toTrailSession({ ...baseRow, sub_agent_count: 0 }, []).subAgentCount).toBeUndefined();
  });

  it('propagates errorCount from row.error_count', () => {
    const session = toTrailSession({ ...baseRow, error_count: 2 }, []);
    expect(session.errorCount).toBe(2);
  });

  it('propagates assistantMessageCount from row.assistant_message_count', () => {
    const session = toTrailSession({ ...baseRow, assistant_message_count: 10 }, []);
    expect(session.assistantMessageCount).toBe(10);
  });

  it('file_path からワークスペースを導出して TrailSession にマッピングする', () => {
    const session = toTrailSession(
      {
        ...baseRow,
        id: 's1',
        repo_name: 'anytime-markdown',
        model: 'claude-sonnet-4-6',
        version: '2.1.0',
        start_time: '2026-05-05T00:00:00.000Z',
        end_time: '2026-05-05T01:00:00.000Z',
        message_count: 5,
        file_path: '/home/node/.claude/projects/-anytime-lab/session.jsonl',
      },
      [],
    );
    expect(session.workspace).toBe('/anytime-lab');
  });

  it('worktree セッションは親ワークスペースにマッピングされる', () => {
    const session = toTrailSession(
      {
        ...baseRow,
        id: 's2',
        slug: 'slug-2',
        repo_name: 'anytime-markdown',
        model: 'claude-sonnet-4-6',
        version: '2.1.0',
        start_time: '2026-05-05T00:00:00.000Z',
        end_time: '2026-05-05T01:00:00.000Z',
        message_count: 3,
        file_path: '/home/node/.claude/projects/-anytime-markdown--worktrees-feature-xyz/s2.jsonl',
      },
      [],
    );
    expect(session.workspace).toBe('/anytime-markdown');
  });
});

describe('toTrailMessage', () => {
  it('maps agent fields into TrailMessage', () => {
    const message = toTrailMessage({
      uuid: 'm1',
      parent_uuid: null,
      type: 'assistant',
      subtype: null,
      text_content: 'hi',
      user_content: null,
      tool_calls: null,
      model: 'gpt-5',
      stop_reason: null,
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 3,
      cache_creation_tokens: 4,
      timestamp: '2026-04-30T00:00:01.000Z',
      is_sidechain: 0,
      agent_id: 'agent-123',
      agent_description: 'Codex delegation',
    });

    expect(message.agentId).toBe('agent-123');
    expect(message.agentDescription).toBe('Codex delegation');
  });
});

describe('extractWorkspace', () => {
  it('通常ワークスペースのパスを返す', () => {
    expect(extractWorkspace('/home/node/.claude/projects/-anytime-lab/session.jsonl'))
      .toBe('/anytime-lab');
  });

  it('anytime-markdown ワークスペースのパスを返す', () => {
    expect(extractWorkspace('/home/node/.claude/projects/-anytime-markdown/session.jsonl'))
      .toBe('/anytime-markdown');
  });

  it('--worktrees- suffix を除去して親ワークスペースを返す', () => {
    expect(extractWorkspace(
      '/home/node/.claude/projects/-anytime-markdown--worktrees-feature-xyz/session.jsonl'
    )).toBe('/anytime-markdown');
  });

  it('--claude-worktrees- suffix を除去して親ワークスペースを返す', () => {
    expect(extractWorkspace(
      '/home/node/.claude/projects/-anytime-markdown--claude-worktrees-feature-xyz/session.jsonl'
    )).toBe('/anytime-markdown');
  });

  it('Codex セッション（/projects/ なし）は undefined を返す', () => {
    expect(extractWorkspace(
      '/home/node/.codex/sessions/2026/05/05/session.jsonl'
    )).toBeUndefined();
  });

  it('undefined は undefined を返す', () => {
    expect(extractWorkspace(undefined)).toBeUndefined();
  });

  it('null は undefined を返す', () => {
    expect(extractWorkspace(null)).toBeUndefined();
  });
});
