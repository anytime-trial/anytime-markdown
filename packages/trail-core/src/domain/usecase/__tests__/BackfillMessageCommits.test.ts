import { matchCommitsToMessages } from '../BackfillMessageCommits';
import type { TrailMessage, TrailSessionCommit } from '../../model/session';

describe('matchCommitsToMessages', () => {
  it('優先度1: git commit を含む Bash ツールのメッセージが 10秒以内にあれば high で、親 user メッセージの UUID を返す', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-1',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-1',
        parentUuid: 'user-1',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
        toolCalls: [
          { id: 't1', name: 'Bash', input: { command: 'git commit -m "feat: add X"' } },
        ],
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'abc123',
        commitMessage: 'feat: add X',
        author: 'Alice',
        committedAt: '2026-04-19T10:00:05.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 10,
        linesDeleted: 0,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([
      {
        messageUuid: 'user-1',
        commitHash: 'abc123',
        matchConfidence: 'high',
      },
    ]);
  });

  it('優先度2のフォールバック: Bash ツールはあるが git commit を含まない場合、medium で、親 user メッセージの UUID を返す', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-2',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-2',
        parentUuid: 'user-2',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
        toolCalls: [
          { id: 't1', name: 'Bash', input: { command: 'npm run build' } },
        ],
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'def456',
        commitMessage: 'chore: build',
        author: 'Bob',
        committedAt: '2026-04-19T10:00:05.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 0,
        linesDeleted: 0,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([
      {
        messageUuid: 'user-2',
        commitHash: 'def456',
        matchConfidence: 'medium',
      },
    ]);
  });

  it('優先度3のフォールバック: Bash ツールがない assistant メッセージで 30秒以内なら low で、親 user メッセージの UUID を返す', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-3',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-3',
        parentUuid: 'user-3',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'ghi789',
        commitMessage: 'fix: something',
        author: 'Carol',
        committedAt: '2026-04-19T10:00:25.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 5,
        linesDeleted: 2,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([
      {
        messageUuid: 'user-3',
        commitHash: 'ghi789',
        matchConfidence: 'low',
      },
    ]);
  });

  it('閾値超過: コミット時刻とメッセージ時刻の差が 30秒を超える場合、マッチしない', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-4',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-4',
        parentUuid: 'user-4',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'jkl012',
        commitMessage: 'feat: late',
        author: 'Dave',
        committedAt: '2026-04-19T10:00:31.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 1,
        linesDeleted: 0,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([]);
  });

  it('時刻逆転: コミット時刻よりメッセージ時刻が未来の場合、マッチしない', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-5',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-5',
        parentUuid: 'user-5',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:10.000Z',
        isSidechain: false,
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'mno345',
        commitMessage: 'feat: past',
        author: 'Eve',
        committedAt: '2026-04-19T10:00:05.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 1,
        linesDeleted: 0,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([]);
  });

  it('複数コミット・複数メッセージ: 各 assistant の親 user メッセージが正しくマッピングされる', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-a',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-a',
        parentUuid: 'user-a',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
        toolCalls: [
          { id: 't1', name: 'Bash', input: { command: 'git commit -m "feat: A"' } },
        ],
      },
      {
        uuid: 'user-b',
        parentUuid: 'msg-a',
        type: 'user',
        timestamp: '2026-04-19T10:00:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-b',
        parentUuid: 'user-b',
        type: 'assistant',
        timestamp: '2026-04-19T10:01:00.000Z',
        isSidechain: false,
        toolCalls: [
          { id: 't2', name: 'Bash', input: { command: 'git commit -m "feat: B"' } },
        ],
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'hash-a',
        commitMessage: 'feat: A',
        author: 'Alice',
        committedAt: '2026-04-19T10:00:05.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 10,
        linesDeleted: 0,
      },
      {
        commitHash: 'hash-b',
        commitMessage: 'feat: B',
        author: 'Alice',
        committedAt: '2026-04-19T10:01:05.000Z',
        isAiAssisted: true,
        filesChanged: 2,
        linesAdded: 20,
        linesDeleted: 5,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([
      { messageUuid: 'user-a', commitHash: 'hash-a', matchConfidence: 'high' },
      { messageUuid: 'user-b', commitHash: 'hash-b', matchConfidence: 'high' },
    ]);
  });

  it('親チェーンが複数段: assistant → assistant → user を辿って最初の user UUID を返す', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'user-root',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:40.000Z',
        isSidechain: false,
      },
      {
        uuid: 'asst-middle',
        parentUuid: 'user-root',
        type: 'assistant',
        timestamp: '2026-04-19T09:59:55.000Z',
        isSidechain: false,
      },
      {
        uuid: 'asst-leaf',
        parentUuid: 'asst-middle',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
        toolCalls: [
          { id: 't1', name: 'Bash', input: { command: 'git commit -m "feat: X"' } },
        ],
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'chain-1',
        commitMessage: 'feat: X',
        author: 'Alice',
        committedAt: '2026-04-19T10:00:05.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 1,
        linesDeleted: 0,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([
      { messageUuid: 'user-root', commitHash: 'chain-1', matchConfidence: 'high' },
    ]);
  });

  it('親チェーンに user が存在しない assistant はマッチ結果から除外される', () => {
    const messages: TrailMessage[] = [
      {
        uuid: 'orphan-assistant',
        parentUuid: null,
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
        toolCalls: [
          { id: 't1', name: 'Bash', input: { command: 'git commit -m "feat: Y"' } },
        ],
      },
    ];
    const commits: TrailSessionCommit[] = [
      {
        commitHash: 'orphan',
        commitMessage: 'feat: Y',
        author: 'Alice',
        committedAt: '2026-04-19T10:00:05.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 1,
        linesDeleted: 0,
      },
    ];
    const result = matchCommitsToMessages(messages, commits);
    expect(result).toEqual([]);
  });

  it('空入力: メッセージが空の場合、空配列を返す', () => {
    const result = matchCommitsToMessages([], [
      {
        commitHash: 'abc',
        commitMessage: 'test',
        author: 'Alice',
        committedAt: '2026-04-19T10:00:00.000Z',
        isAiAssisted: true,
        filesChanged: 1,
        linesAdded: 1,
        linesDeleted: 0,
      },
    ]);
    expect(result).toEqual([]);
  });

  it('空入力: コミットが空の場合、空配列を返す', () => {
    const result = matchCommitsToMessages([
      {
        uuid: 'user-x',
        parentUuid: null,
        type: 'user',
        timestamp: '2026-04-19T09:59:50.000Z',
        isSidechain: false,
      },
      {
        uuid: 'msg-x',
        parentUuid: 'user-x',
        type: 'assistant',
        timestamp: '2026-04-19T10:00:00.000Z',
        isSidechain: false,
      },
    ], []);
    expect(result).toEqual([]);
  });
});
