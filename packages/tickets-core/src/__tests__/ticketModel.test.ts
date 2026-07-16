import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  parseTicketMarkdown,
  validateTicketFrontmatter,
  serializeTicket,
  nextTicketId,
  slugifyTitle,
  ticketFileName,
  buildTicketBody,
  appendComment,
  countSubtasks,
  remainingHours,
  type TicketFrontmatter,
} from '../ticketModel';

const VALID_DOC = `---
id: T-3
title: "OAuth トークン検証"
status: up_next
priority: high
assignee: claude-code
creator: kiyotaka
created_at: 2026-07-15T01:00:00.000Z
updated_at: 2026-07-16T02:00:00.000Z
labels: [auth, security]
dependencies:
  - T-1
  - T-2
estimate: 10
progress: 40
ai_confidence: 0.8
---

## 概要 (Description)

本文です。
`;

const VALID_FM: TicketFrontmatter = {
  id: 'T-3',
  title: 'OAuth トークン検証',
  status: 'up_next',
  priority: 'high',
  assignee: 'claude-code',
  creator: 'kiyotaka',
  created_at: '2026-07-15T01:00:00.000Z',
  updated_at: '2026-07-16T02:00:00.000Z',
  labels: ['auth', 'security'],
  dependencies: ['T-1', 'T-2'],
  estimate: 10,
  progress: 40,
  ai_confidence: 0.8,
};

describe('parseTicketMarkdown', () => {
  it('スカラー・インライン配列・ブロック配列を解析し本文を分離する', () => {
    const parsed = parseTicketMarkdown(VALID_DOC);
    expect(parsed).not.toBeNull();
    expect(parsed?.frontmatter.id).toBe('T-3');
    expect(parsed?.frontmatter.title).toBe('OAuth トークン検証');
    expect(parsed?.frontmatter.labels).toEqual(['auth', 'security']);
    expect(parsed?.frontmatter.dependencies).toEqual(['T-1', 'T-2']);
    expect(parsed?.frontmatter.estimate).toBe(10);
    expect(parsed?.frontmatter.ai_confidence).toBe(0.8);
    expect(parsed?.body).toContain('## 概要 (Description)');
    expect(parsed?.body).not.toContain('---\nid:');
  });

  it('CRLF 改行でも解析できる', () => {
    const crlf = VALID_DOC.replaceAll('\n', '\r\n');
    const parsed = parseTicketMarkdown(crlf);
    expect(parsed?.frontmatter.id).toBe('T-3');
  });

  it('フロントマターが無ければ null を返す', () => {
    expect(parseTicketMarkdown('# ただの markdown')).toBeNull();
    expect(parseTicketMarkdown('')).toBeNull();
  });
});

describe('validateTicketFrontmatter', () => {
  it('正しいフロントマターを型付きで返す', () => {
    const parsed = parseTicketMarkdown(VALID_DOC);
    const result = validateTicketFrontmatter(parsed?.frontmatter ?? {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID_FM);
    }
  });

  it('未知キーは extras として保持する', () => {
    const result = validateTicketFrontmatter({
      ...VALID_FM,
      custom_field: 'keep-me',
    } as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extras).toEqual({ custom_field: 'keep-me' });
    }
  });

  it.each(['id', 'title', 'status', 'priority', 'created_at', 'updated_at'])(
    '必須項目 %s の欠落を検出する',
    (key) => {
      const raw: Record<string, unknown> = { ...VALID_FM };
      delete raw[key];
      const result = validateTicketFrontmatter(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain(key);
      }
    },
  );

  it('enum 外の status / priority を拒否する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, status: 'doing' }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, priority: 'critical' }).ok).toBe(false);
    for (const status of TICKET_STATUSES) {
      expect(validateTicketFrontmatter({ ...VALID_FM, status }).ok).toBe(true);
    }
    for (const priority of TICKET_PRIORITIES) {
      expect(validateTicketFrontmatter({ ...VALID_FM, priority }).ok).toBe(true);
    }
  });

  it('progress の境界値（0/100 は可、-1/101 は不可）', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, progress: 0 }).ok).toBe(true);
    expect(validateTicketFrontmatter({ ...VALID_FM, progress: 100 }).ok).toBe(true);
    expect(validateTicketFrontmatter({ ...VALID_FM, progress: -1 }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, progress: 101 }).ok).toBe(false);
  });

  it('ai_confidence は 0.0〜1.0 のみ許可する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, ai_confidence: 0 }).ok).toBe(true);
    expect(validateTicketFrontmatter({ ...VALID_FM, ai_confidence: 1 }).ok).toBe(true);
    expect(validateTicketFrontmatter({ ...VALID_FM, ai_confidence: 1.5 }).ok).toBe(false);
  });

  it('日時は ISO 8601 UTC のみ許可する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, updated_at: '2026/07/16' }).ok).toBe(false);
    expect(
      validateTicketFrontmatter({ ...VALID_FM, updated_at: '2026-07-16T02:00:00+09:00' }).ok,
    ).toBe(false);
  });

  it('labels / dependencies は文字列配列のみ許可する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, labels: 'auth' }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, dependencies: [1] }).ok).toBe(false);
  });
});

describe('serializeTicket', () => {
  it('parse との往復で frontmatter・extras・本文が一致する', () => {
    const body = '## 概要 (Description)\n\n本文です。\n';
    const text = serializeTicket(VALID_FM, body, { custom_field: 'keep-me' });
    const parsed = parseTicketMarkdown(text);
    const result = validateTicketFrontmatter(parsed?.frontmatter ?? {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(VALID_FM);
      expect(result.extras).toEqual({ custom_field: 'keep-me' });
    }
    expect(parsed?.body.trim()).toBe(body.trim());
  });

  it('任意項目が undefined の場合は行を出力しない', () => {
    const fm: TicketFrontmatter = {
      id: 'T-1',
      title: 'a',
      status: 'backlog',
      priority: 'low',
      created_at: '2026-07-16T00:00:00.000Z',
      updated_at: '2026-07-16T00:00:00.000Z',
    };
    const text = serializeTicket(fm, '');
    expect(text).not.toContain('assignee');
    expect(text).not.toContain('labels');
    expect(text).not.toContain('estimate');
  });
});

describe('nextTicketId', () => {
  it('既存なしは T-1', () => {
    expect(nextTicketId([])).toBe('T-1');
  });

  it('数値比較で最大+1（辞書順ではない）', () => {
    expect(nextTicketId(['T-2', 'T-10', 'T-9'])).toBe('T-11');
  });

  it('不正形式の id は無視する', () => {
    expect(nextTicketId(['X-5', 'T-abc', 'T-3'])).toBe('T-4');
  });
});

describe('slugifyTitle / ticketFileName', () => {
  it('英数字以外をハイフン化し小文字にする', () => {
    expect(slugifyTitle('OAuth Token  Validation!')).toBe('oauth-token-validation');
  });

  it('日本語のみのタイトルは ticket にフォールバックする', () => {
    expect(slugifyTitle('日本語だけ')).toBe('ticket');
  });

  it('ファイル名は <id>-<slug>.md', () => {
    expect(ticketFileName('T-4', 'Fix Bug')).toBe('T-4-fix-bug.md');
  });
});

describe('buildTicketBody', () => {
  it('推奨 4 セクションを含むテンプレートを返す', () => {
    const body = buildTicketBody();
    expect(body).toContain('## 概要 (Description)');
    expect(body).toContain('## 作業タスクリスト (Subtasks)');
    expect(body).toContain('## 引継ぎサマリー (Handoff Notes)');
    expect(body).toContain('## コミュニケーションスレッド (Comments)');
  });
});

describe('appendComment', () => {
  const stamp = '2026-07-16T03:00:00.000Z';

  it('Comments セクション末尾に「投稿者 - 日時」付きで追記し他セクションを変えない', () => {
    const body = buildTicketBody();
    const next = appendComment(body, { author: '田中', timestamp: stamp, text: '確認しました。' });
    expect(next).toContain(`### 田中 - ${stamp}`);
    expect(next).toContain('確認しました。');
    expect(next.indexOf('### 田中')).toBeGreaterThan(next.indexOf('## コミュニケーションスレッド'));
    expect(next.split('## 概要 (Description)')).toHaveLength(2);
  });

  it('Comments セクションが無ければ新設して追記する', () => {
    const next = appendComment('## 概要 (Description)\n\nx\n', {
      author: 'ai',
      timestamp: stamp,
      text: '質問: 仕様を確認したいです。',
    });
    expect(next).toContain('## コミュニケーションスレッド (Comments)');
    expect(next).toContain(`### ai - ${stamp}`);
  });

  it('既存コメントの後ろに積み上がる', () => {
    let body = buildTicketBody();
    body = appendComment(body, { author: 'a', timestamp: stamp, text: '1件目' });
    body = appendComment(body, { author: 'b', timestamp: stamp, text: '2件目' });
    expect(body.indexOf('1件目')).toBeLessThan(body.indexOf('2件目'));
  });
});

describe('countSubtasks', () => {
  it('作業タスクリスト内のチェックボックスのみ数える', () => {
    const body = [
      '## 作業タスクリスト (Subtasks)',
      '',
      '- [x] done1',
      '- [X] done2',
      '- [ ] open1',
      '- [ ] open2',
      '- [ ] open3',
      '',
      '## コミュニケーションスレッド (Comments)',
      '',
      '- [ ] コメント内のチェックは数えない',
      '',
    ].join('\n');
    expect(countSubtasks(body)).toEqual({ done: 2, total: 5 });
  });

  it('セクションが無ければ 0/0', () => {
    expect(countSubtasks('本文のみ')).toEqual({ done: 0, total: 0 });
  });
});

describe('remainingHours', () => {
  it('estimate × (100 − progress) / 100 を返す', () => {
    expect(remainingHours(10, 0)).toBe(10);
    expect(remainingHours(10, 50)).toBe(5);
    expect(remainingHours(10, 100)).toBe(0);
  });

  it('progress 未設定は 0 として扱い、estimate 未設定は null', () => {
    expect(remainingHours(10, undefined)).toBe(10);
    expect(remainingHours(undefined, 50)).toBeNull();
  });

  it('小数第 1 位へ丸める', () => {
    expect(remainingHours(10, 33)).toBe(6.7);
  });
});
