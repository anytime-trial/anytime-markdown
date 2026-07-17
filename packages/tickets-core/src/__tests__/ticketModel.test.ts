import {
  TICKET_ASSIGNEES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_WORKSPACES,
  parseTicketMarkdown,
  validateTicketFrontmatter,
  serializeTicket,
  nextTicketId,
  slugifyTitle,
  ticketFileName,
  buildTicketBody,
  appendComment,
  countSubtasks,
  type TicketFrontmatter,
} from '../ticketModel';

const VALID_DOC = `---
id: T-3
title: "OAuth トークン検証"
status: up_next
priority: high
assignee: agent
workspace: anytime-markdown
creator: kiyotaka
created_at: 2026-07-15T01:00:00.000Z
updated_at: 2026-07-16T02:00:00.000Z
dependencies:
  - T-1
  - T-2
estimate: 120
actual: 30
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
  assignee: 'agent',
  workspace: 'anytime-markdown',
  creator: 'kiyotaka',
  created_at: '2026-07-15T01:00:00.000Z',
  updated_at: '2026-07-16T02:00:00.000Z',
  dependencies: ['T-1', 'T-2'],
  estimate: 120,
  actual: 30,
  ai_confidence: 0.8,
};

/** 2026-07-17 に廃止した labels / progress が残るチケット（未知キーとして往復保存される）。 */
const LEGACY_DOC = `---
id: T-9
title: "廃止属性が残るチケット"
status: in_progress
priority: medium
assignee: user
created_at: 2026-07-15T01:00:00.000Z
updated_at: 2026-07-16T02:00:00.000Z
labels: [auth, question]
estimate: 10
progress: 40
---

## 概要 (Description)

本文です。
`;

describe('parseTicketMarkdown', () => {
  it('スカラー・ブロック配列を解析し本文を分離する', () => {
    const parsed = parseTicketMarkdown(VALID_DOC);
    expect(parsed).not.toBeNull();
    expect(parsed?.frontmatter.id).toBe('T-3');
    expect(parsed?.frontmatter.title).toBe('OAuth トークン検証');
    expect(parsed?.frontmatter.dependencies).toEqual(['T-1', 'T-2']);
    expect(parsed?.frontmatter.estimate).toBe(120);
    expect(parsed?.frontmatter.actual).toBe(30);
    expect(parsed?.frontmatter.ai_confidence).toBe(0.8);
    expect(parsed?.body).toContain('## 概要 (Description)');
    expect(parsed?.body).not.toContain('---\nid:');
  });

  // パーサはキー非依存のため、インライン配列は廃止属性 labels を持つ既存チケットで検証する。
  it('インライン配列を解析する', () => {
    const parsed = parseTicketMarkdown(LEGACY_DOC);
    expect(parsed?.frontmatter.labels).toEqual(['auth', 'question']);
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

  it('enum 外の workspace を拒否する（新規属性は旧値が無いため厳密検証）', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, workspace: 'bogus' }).ok).toBe(false);
    for (const workspace of TICKET_WORKSPACES) {
      expect(validateTicketFrontmatter({ ...VALID_FM, workspace }).ok).toBe(true);
    }
    const { workspace: _omitted, ...withoutWorkspace } = VALID_FM;
    expect(validateTicketFrontmatter(withoutWorkspace).ok).toBe(true);
  });

  it('enum 外の assignee を拒否する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, assignee: 'claude-code' }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, assignee: '' }).ok).toBe(false);
    for (const assignee of TICKET_ASSIGNEES) {
      expect(validateTicketFrontmatter({ ...VALID_FM, assignee }).ok).toBe(true);
    }
    const { assignee: _omitted, ...withoutAssignee } = VALID_FM;
    expect(validateTicketFrontmatter(withoutAssignee).ok).toBe(true);
  });

  it('estimate / actual は 0 以上の数値のみ許可する（単位は分）', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, estimate: 0, actual: 0 }).ok).toBe(true);
    expect(validateTicketFrontmatter({ ...VALID_FM, estimate: 1 }).ok).toBe(true);
    expect(validateTicketFrontmatter({ ...VALID_FM, estimate: -1 }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, actual: -1 }).ok).toBe(false);
  });

  it('廃止済みの labels / progress は未知キーとして extras へ落ちる', () => {
    const parsed = parseTicketMarkdown(LEGACY_DOC);
    const result = validateTicketFrontmatter(parsed?.frontmatter ?? {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extras).toEqual({ labels: ['auth', 'question'], progress: 40 });
      expect(result.value).not.toHaveProperty('labels');
      expect(result.value).not.toHaveProperty('progress');
    }
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

  it('dependencies は文字列配列のみ許可する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, dependencies: [1] }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, dependencies: 'T-1' }).ok).toBe(false);
  });

  it('文字列フィールドの制御文字（改行等）を拒否する', () => {
    expect(validateTicketFrontmatter({ ...VALID_FM, title: 'x\nassignee: attacker' }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, assignee: 'a\r\nstatus: completed' }).ok).toBe(false);
    expect(validateTicketFrontmatter({ ...VALID_FM, dependencies: ['ok', 'bad\ninjected'] }).ok).toBe(false);
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
    expect(text).not.toContain('workspace');
    expect(text).not.toContain('estimate');
    expect(text).not.toContain('actual');
  });

  it('廃止属性を extras として渡すと往復で保存される（既存チケットを壊さない）', () => {
    const parsed = parseTicketMarkdown(LEGACY_DOC);
    const result = validateTicketFrontmatter(parsed?.frontmatter ?? {});
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const text = serializeTicket(result.value, parsed?.body ?? '', result.extras);
    expect(text).toContain('labels: [auth, question]');
    expect(text).toContain('progress: 40');
    const reparsed = validateTicketFrontmatter(parseTicketMarkdown(text)?.frontmatter ?? {});
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.extras).toEqual(result.extras);
    }
  });

  it('title の改行で別キーを注入できない（frontmatter injection 防御）', () => {
    const fm: TicketFrontmatter = { ...VALID_FM, title: 'x\nassignee: attacker' };
    expect(() => serializeTicket(fm, '')).toThrow();
  });

  it('extras キーの改行で別行を注入できない', () => {
    expect(() =>
      serializeTicket(VALID_FM, '', { 'foo\nupdated_at': 'poison' }),
    ).toThrow();
  });

  it('extras 値の改行で別行を注入できない', () => {
    expect(() =>
      serializeTicket(VALID_FM, '', { note: 'a\nstatus: completed' }),
    ).toThrow();
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
