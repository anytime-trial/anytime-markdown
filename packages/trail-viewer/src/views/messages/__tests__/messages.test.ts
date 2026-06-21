/**
 * messages vanilla ビューのユニットテスト (jsdom)。
 *
 * カバー範囲:
 *  - mountMessageTimeline: タイムライン描画・折りたたみ・バークリック
 *  - mountMessageNode: ノード描画・展開/折りたたみ・ツールコールエントリ
 *  - mountToolCallDetail: input/result 表示
 *  - mountTraceTree: ノード一覧描画・empty 状態
 */
import { mountMessageTimeline, type MessageTimelineViewProps } from '../messageTimeline';
import { mountMessageNode, type MessageNodeProps } from '../messageNode';
import { mountToolCallDetail, type ToolCallDetailProps } from '../toolCallDetail';
import { mountTraceTree, type TraceTreeProps } from '../traceTree';
import type { TrailMessage, TrailTreeNode, TrailToolCall } from '../../../domain/parser/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

function makeMessage(over: Partial<TrailMessage> = {}): TrailMessage {
  return {
    uuid: 'test-uuid-1',
    parentUuid: null,
    type: 'user',
    timestamp: '2026-06-21T10:00:00.000Z',
    isSidechain: false,
    userContent: 'Hello world',
    ...over,
  } as TrailMessage;
}

function makeNode(
  message: TrailMessage,
  children: TrailTreeNode[] = [],
  depth = 0,
): TrailTreeNode {
  return { message, children, depth };
}

function makeTimelineProps(over: Partial<MessageTimelineViewProps> = {}): MessageTimelineViewProps {
  return {
    t,
    nodes: [],
    onSelectMessage: () => {},
    ...over,
  };
}

function makeNodeProps(over: Partial<MessageNodeProps> = {}): MessageNodeProps {
  return {
    t,
    message: makeMessage(),
    depth: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// mountMessageTimeline
// ---------------------------------------------------------------------------

describe('mountMessageTimeline', () => {
  beforeEach(() => {
    // Reset localStorage so collapse state doesn't leak between tests
    localStorage.clear();
  });
  it('renders the timeline container with data-testid', () => {
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps());
    const timeline = c.querySelector('[data-testid="message-timeline"]');
    expect(timeline).not.toBeNull();
    expect(timeline?.getAttribute('role')).toBe('region');
    expect(timeline?.getAttribute('aria-label')).toBe('Trace timeline');
  });

  it('shows collapse button', () => {
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps());
    const btn = c.querySelector('button[aria-label="Collapse timeline"]');
    expect(btn).not.toBeNull();
  });

  it('collapses and expands when collapse button is clicked', () => {
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps());

    const root = c.querySelector('[data-testid="message-timeline"]') as HTMLElement;
    const collapseBtn = c.querySelector('button[aria-label="Collapse timeline"]') as HTMLElement;
    expect(collapseBtn).not.toBeNull();

    // Initially expanded — height should be nonzero
    const initialHeight = root.style.height;
    expect(initialHeight).not.toBe('');

    collapseBtn.click();

    // After collapse, aria-label changes and height shrinks
    const expandBtn = c.querySelector('button[aria-label="Expand timeline"]') as HTMLElement;
    expect(expandBtn).not.toBeNull();
    expect(root.style.height).not.toBe(initialHeight);
  });

  it('renders user bars for user messages', () => {
    const userMsg = makeMessage({ type: 'user', uuid: 'u1', timestamp: '2026-06-21T10:00:00.000Z', userContent: 'hello' });
    const nodes = [makeNode(userMsg)];
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps({ nodes }));

    const btn = c.querySelector('button[aria-label="user message at 2026-06-21T10:00:00.000Z"]');
    expect(btn).not.toBeNull();
  });

  it('calls onSelectMessage when a bar is clicked', () => {
    const userMsg = makeMessage({ type: 'user', uuid: 'msg-click', timestamp: '2026-06-21T10:00:00.000Z', userContent: 'hi' });
    const nodes = [makeNode(userMsg)];
    let selectedUuid = '';
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps({
      nodes,
      onSelectMessage: (uuid) => { selectedUuid = uuid; },
    }));

    const btn = c.querySelector('button[aria-label="user message at 2026-06-21T10:00:00.000Z"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(selectedUuid).toBe('msg-click');
  });

  it('updates content when update() is called', () => {
    const c = document.createElement('div');
    const handle = mountMessageTimeline(c, makeTimelineProps());

    // Initially no user bars
    expect(c.querySelectorAll('button[aria-label*="user message"]').length).toBe(0);

    const userMsg = makeMessage({ type: 'user', uuid: 'u2', timestamp: '2026-06-21T11:00:00.000Z', userContent: 'update test' });
    handle.update(makeTimelineProps({ nodes: [makeNode(userMsg)] }));

    expect(c.querySelectorAll('button[aria-label*="user message"]').length).toBe(1);
  });

  it('destroy removes DOM', () => {
    const c = document.createElement('div');
    const handle = mountMessageTimeline(c, makeTimelineProps());
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('renders AI turn bar for assistant messages', () => {
    const userMsg = makeMessage({ type: 'user', uuid: 'u3', timestamp: '2026-06-21T10:00:00.000Z', userContent: 'hello' });
    const aiMsg = makeMessage({ type: 'assistant', uuid: 'a1', timestamp: '2026-06-21T10:00:05.000Z' });
    const nodes = [makeNode(userMsg, [makeNode(aiMsg, [], 1)], 0)];
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps({ nodes }));

    const aiBar = c.querySelector('button[aria-label^="AI turn"]');
    expect(aiBar).not.toBeNull();
  });

  it('shows time axis labels when expanded', () => {
    const userMsg = makeMessage({ type: 'user', uuid: 'u4', timestamp: '2026-06-21T09:00:00.000Z', userContent: 'hi' });
    const c = document.createElement('div');
    mountMessageTimeline(c, makeTimelineProps({ nodes: [makeNode(userMsg)] }));

    // Time axis has two span labels; check they exist
    const spans = c.querySelectorAll('[data-testid="message-timeline"] span');
    // There should be lane labels + time axis labels
    expect(spans.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// mountMessageNode
// ---------------------------------------------------------------------------

describe('mountMessageNode', () => {
  it('renders user message bubble', () => {
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({ type: 'user', userContent: 'Hello user' }),
    }));
    expect(c.textContent).toContain('Hello user');
    const root = c.querySelector('[data-message-uuid="test-uuid-1"]');
    expect(root).not.toBeNull();
  });

  it('renders nothing for empty message (no text, no tools, not system)', () => {
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({ type: 'user', userContent: '', textContent: undefined, toolCalls: undefined }),
    }));
    // No data-message-uuid element
    expect(c.querySelector('[data-message-uuid]')).toBeNull();
  });

  it('renders system message as centered badge', () => {
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({ type: 'system', uuid: 'sys-1', subtype: 'init', userContent: undefined }),
    }));
    expect(c.textContent).toContain('init');
    const root = c.querySelector('[data-message-uuid="sys-1"]');
    expect(root).not.toBeNull();
  });

  it('renders system message with default label when no subtype', () => {
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({ type: 'system', uuid: 'sys-2', subtype: undefined, userContent: undefined }),
    }));
    expect(c.textContent).toContain('system');
  });

  it('renders assistant message with tool call entry', () => {
    const toolCall: TrailToolCall = {
      id: 'tc-1',
      name: 'Bash',
      input: { command: 'ls -la' },
    };
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({
        type: 'assistant',
        uuid: 'ai-1',
        toolCalls: [toolCall],
        textContent: undefined,
        userContent: undefined,
      }),
    }));

    // Should show tool call summary
    expect(c.textContent).toContain('Bash');
    // Expand button should exist
    const expandBtn = c.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(expandBtn).not.toBeNull();
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands tool call detail on click', () => {
    const toolCall: TrailToolCall = {
      id: 'tc-2',
      name: 'Read',
      input: { file_path: '/foo/bar.ts' },
      result: 'file content here',
    };
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({
        type: 'assistant',
        uuid: 'ai-2',
        toolCalls: [toolCall],
        textContent: undefined,
        userContent: undefined,
      }),
    }));

    const expandBtn = c.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(expandBtn).not.toBeNull();
    expandBtn.click();
    expect(expandBtn.getAttribute('aria-expanded')).toBe('true');
    // After expand, detail panel should contain result text
    expect(c.textContent).toContain('file content here');
  });

  it('collapses expanded tool call detail on second click', () => {
    const toolCall: TrailToolCall = {
      id: 'tc-3',
      name: 'Edit',
      input: { path: '/foo.ts', content: 'x' },
      result: 'done',
    };
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({ type: 'assistant', uuid: 'ai-3', toolCalls: [toolCall], userContent: undefined }),
    }));

    const expandBtn = c.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expandBtn.click(); // expand
    expandBtn.click(); // collapse
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders long text message with expand/collapse button', () => {
    const longText = 'line\n'.repeat(10); // >3 lines
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({ type: 'user', userContent: longText }),
    }));
    // Expand button for text
    const expandBtns = c.querySelectorAll('button[aria-label]');
    const textExpandBtn = [...expandBtns].find((b) => b.getAttribute('aria-label') === 'message.expand');
    expect(textExpandBtn).not.toBeUndefined();
  });

  it('renders commit hash chips below bubble', () => {
    const c = document.createElement('div');
    mountMessageNode(c, makeNodeProps({
      message: makeMessage({
        type: 'assistant',
        uuid: 'cm-1',
        triggerCommitHashes: ['abc1234567890', 'def9876543210'],
        textContent: 'made a commit',
      }),
    }));
    expect(c.textContent).toContain('#abc1234');
    expect(c.textContent).toContain('#def9876');
  });

  it('destroy removes DOM', () => {
    const c = document.createElement('div');
    const handle = mountMessageNode(c, makeNodeProps());
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });

  it('update replaces DOM with new message', () => {
    const c = document.createElement('div');
    const handle = mountMessageNode(c, makeNodeProps({
      message: makeMessage({ userContent: 'first' }),
    }));
    expect(c.textContent).toContain('first');

    handle.update(makeNodeProps({
      message: makeMessage({ uuid: 'updated-uuid', userContent: 'second' }),
    }));
    expect(c.textContent).toContain('second');
    expect(c.textContent).not.toContain('first');
  });
});

// ---------------------------------------------------------------------------
// mountToolCallDetail
// ---------------------------------------------------------------------------

describe('mountToolCallDetail', () => {
  const toolCall: TrailToolCall = {
    id: 'tc-detail-1',
    name: 'Write',
    input: { file_path: '/a/b.ts', content: 'hello' },
    result: 'written',
  };

  function baseProps(over: Partial<ToolCallDetailProps> = {}): ToolCallDetailProps {
    return { t, toolCall, ...over };
  }

  it('renders tool name', () => {
    const c = document.createElement('div');
    mountToolCallDetail(c, baseProps());
    expect(c.textContent).toContain('Write');
  });

  it('renders input JSON', () => {
    const c = document.createElement('div');
    mountToolCallDetail(c, baseProps());
    const inputPre = c.querySelector('pre[aria-label="message.inputCode"]');
    expect(inputPre).not.toBeNull();
    expect(inputPre?.textContent).toContain('/a/b.ts');
  });

  it('renders result when present', () => {
    const c = document.createElement('div');
    mountToolCallDetail(c, baseProps());
    const resultPre = c.querySelector('pre[aria-label="message.resultCode"]');
    expect(resultPre).not.toBeNull();
    expect(resultPre?.textContent).toContain('written');
  });

  it('omits result section when toolCall.result is undefined', () => {
    const tcNoResult: TrailToolCall = { id: 'no-res', name: 'Read', input: { f: 'x' } };
    const c = document.createElement('div');
    mountToolCallDetail(c, baseProps({ toolCall: tcNoResult }));
    const resultPre = c.querySelector('pre[aria-label="message.resultCode"]');
    expect(resultPre).toBeNull();
  });

  it('renders commit chips for git commit Bash', () => {
    const gitTc: TrailToolCall = {
      id: 'git-1',
      name: 'Bash',
      input: { command: 'git commit -m "fix"' },
    };
    const c = document.createElement('div');
    mountToolCallDetail(c, baseProps({ toolCall: gitTc, commitHashes: ['aabbcc1122334455'] }));
    expect(c.textContent).toContain('#aabbcc1');
  });

  it('does NOT render commit chips for non-git Bash', () => {
    const bashTc: TrailToolCall = { id: 'b-1', name: 'Bash', input: { command: 'ls -la' } };
    const c = document.createElement('div');
    mountToolCallDetail(c, baseProps({ toolCall: bashTc, commitHashes: ['deadbeef00000000'] }));
    // Should not show commit chip since this is not a git commit command
    expect(c.textContent).not.toContain('#deadbee');
  });

  it('update replaces content', () => {
    const c = document.createElement('div');
    const handle = mountToolCallDetail(c, baseProps());
    expect(c.textContent).toContain('Write');

    const tc2: TrailToolCall = { id: 'upd', name: 'Grep', input: { pattern: 'foo' } };
    handle.update(baseProps({ toolCall: tc2 }));
    expect(c.textContent).toContain('Grep');
    expect(c.textContent).not.toContain('Write');
  });

  it('destroy removes DOM', () => {
    const c = document.createElement('div');
    const handle = mountToolCallDetail(c, baseProps());
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountTraceTree
// ---------------------------------------------------------------------------

describe('mountTraceTree', () => {
  function baseProps(over: Partial<TraceTreeProps> = {}): TraceTreeProps {
    return { t, nodes: [], ...over };
  }

  it('shows empty message when nodes is empty', () => {
    const c = document.createElement('div');
    mountTraceTree(c, baseProps());
    expect(c.textContent).toContain('message.noMessages');
  });

  it('renders messages for provided nodes', () => {
    const msg1 = makeMessage({ uuid: 'n1', userContent: 'first message' });
    const msg2 = makeMessage({ uuid: 'n2', userContent: 'second message', type: 'assistant', textContent: 'response' });
    const nodes = [makeNode(msg1, [makeNode(msg2, [], 1)], 0)];
    const c = document.createElement('div');
    mountTraceTree(c, baseProps({ nodes }));

    expect(c.querySelector('[data-message-uuid="n1"]')).not.toBeNull();
    // msg2 is user type but has no userContent from assistant perspective — but textContent exists
    // Actually msg2 has type assistant and textContent set, so it renders
    expect(c.querySelector('[data-message-uuid="n2"]')).not.toBeNull();
  });

  it('flattens nested children', () => {
    const root = makeMessage({ uuid: 'root', userContent: 'root msg' });
    const child1 = makeMessage({ uuid: 'child1', type: 'assistant', textContent: 'response 1' });
    const child2 = makeMessage({ uuid: 'child2', type: 'assistant', textContent: 'response 2' });
    const nodes = [makeNode(root, [makeNode(child1, [makeNode(child2, [], 2)], 1)], 0)];
    const c = document.createElement('div');
    mountTraceTree(c, baseProps({ nodes }));

    expect(c.querySelector('[data-message-uuid="root"]')).not.toBeNull();
    expect(c.querySelector('[data-message-uuid="child1"]')).not.toBeNull();
    expect(c.querySelector('[data-message-uuid="child2"]')).not.toBeNull();
  });

  it('update replaces nodes', () => {
    const c = document.createElement('div');
    const handle = mountTraceTree(c, baseProps());
    expect(c.textContent).toContain('message.noMessages');

    const msg = makeMessage({ uuid: 'new-1', userContent: 'new message' });
    handle.update(baseProps({ nodes: [makeNode(msg)] }));
    expect(c.textContent).toContain('new message');
    expect(c.textContent).not.toContain('message.noMessages');
  });

  it('destroy removes DOM', () => {
    const c = document.createElement('div');
    const handle = mountTraceTree(c, baseProps());
    expect(c.childElementCount).toBeGreaterThan(0);
    handle.destroy();
    expect(c.childElementCount).toBe(0);
  });
});
