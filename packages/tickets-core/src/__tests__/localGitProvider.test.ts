import { LocalGitProvider, LocalGitConflictError, type LocalGitIo } from '../localGitProvider';
import { serializeTicket, type TicketFrontmatter } from '../ticketModel';

const ROOT = '/repo';

const FRONTMATTER: TicketFrontmatter = {
  id: 'T-1',
  title: 'テストチケット',
  status: 'backlog',
  priority: 'medium',
  created_at: '2026-07-30T00:00:00.000Z',
  updated_at: '2026-07-30T00:00:00.000Z',
};

/** ファイルをメモリに持つ疑似 I/O。git 呼び出しは記録するだけ。 */
function makeIo(files: Record<string, string> = {}): LocalGitIo & {
  files: Record<string, string>;
  gitCalls: string[][];
  failPush: boolean;
} {
  const state = {
    files: { ...files },
    gitCalls: [] as string[][],
    failPush: false,
    listFiles: async (dir: string) =>
      Object.keys(state.files)
        .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
        .map((p) => p.slice(dir.length + 1)),
    readFile: async (path: string) => {
      const text = state.files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    writeFile: async (path: string, text: string) => {
      state.files[path] = text;
    },
    deleteFile: async (path: string) => {
      delete state.files[path];
    },
    rename: async (from: string, to: string) => {
      state.files[to] = state.files[from];
      delete state.files[from];
    },
    // 内容が変われば必ず変わる単純な版数（実装は呼び出し側が差し替える）
    hash: (text: string) => `h${text.length}:${text.slice(0, 8)}`,
    git: async (args: string[]) => {
      state.gitCalls.push(args);
      if (args[0] === 'push' && state.failPush) {
        throw new Error('! [rejected] main -> main (fetch first)');
      }
      return '';
    },
  };
  return state;
}

function makeProvider(io: LocalGitIo) {
  return new LocalGitProvider({ provider: 'local-git', repoRoot: ROOT, io });
}

const TICKET_TEXT = serializeTicket(FRONTMATTER, '## 概要 (Description)\n\n本文\n');

describe('LocalGitProvider', () => {
  describe('list', () => {
    it('.tickets 直下の .md を読み、既定ではアーカイブを含めない', async () => {
      const io = makeIo({
        [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT,
        [`${ROOT}/.tickets/archive/T-0-old.md`]: TICKET_TEXT,
      });

      const result = await makeProvider(io).list();

      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].path).toBe('.tickets/T-1-test.md');
      expect(result.tickets[0].archived).toBe(false);
      expect(result.invalid).toHaveLength(0);
    });

    it('includeArchive でアーカイブも返し archived を立てる', async () => {
      const io = makeIo({
        [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT,
        [`${ROOT}/.tickets/archive/T-0-old.md`]: TICKET_TEXT,
      });

      const result = await makeProvider(io).list({ includeArchive: true });

      expect(result.tickets).toHaveLength(2);
      expect(result.tickets.find((t) => t.path.includes('archive'))?.archived).toBe(true);
    });

    it('.md 以外は無視する', async () => {
      const io = makeIo({
        [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT,
        [`${ROOT}/.tickets/README.txt`]: 'not a ticket',
      });

      expect((await makeProvider(io).list()).tickets).toHaveLength(1);
    });

    it('壊れたチケットは invalid として返し、正常なものは落とさない', async () => {
      const io = makeIo({
        [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT,
        [`${ROOT}/.tickets/T-2-broken.md`]: 'フロントマターが無い本文だけ',
      });

      const result = await makeProvider(io).list();

      expect(result.tickets).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].path).toBe('.tickets/T-2-broken.md');
    });

    it('ディレクトリが無くても落ちない', async () => {
      expect((await makeProvider(makeIo()).list()).tickets).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('書き込み後に add / commit / push する', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      const version = io.hash(TICKET_TEXT);

      const result = await makeProvider(io).update({
        path: '.tickets/T-1-test.md',
        content: '更新後の内容',
        version,
        message: 'ticket: update T-1',
      });

      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBe('更新後の内容');
      expect(io.gitCalls).toEqual([
        ['add', '--', '.tickets/T-1-test.md'],
        ['commit', '-m', 'ticket: update T-1'],
        ['push'],
      ]);
      expect(result.version).toBe(io.hash('更新後の内容'));
    });

    it('読み込み後に中身が変わっていたら競合として拒否し、書き込まない', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await expect(
        makeProvider(io).update({
          path: '.tickets/T-1-test.md',
          content: '上書き',
          version: 'stale-version',
          message: 'm',
        }),
      ).rejects.toBeInstanceOf(LocalGitConflictError);

      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBe(TICKET_TEXT);
      expect(io.gitCalls).toHaveLength(0);
    });

    it('競合エラーは status 409 を持つ（UI の再読込導線へ写像するため）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await expect(
        makeProvider(io).update({ path: '.tickets/T-1-test.md', content: 'x', version: 'stale', message: 'm' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('push 拒否は競合として返す（コミットは残す）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      io.failPush = true;

      await expect(
        makeProvider(io).update({
          path: '.tickets/T-1-test.md',
          content: '更新',
          version: io.hash(TICKET_TEXT),
          message: 'm',
        }),
      ).rejects.toMatchObject({ status: 409 });

      // commit までは済んでいる（ローカルに残る）
      expect(io.gitCalls.map((c) => c[0])).toEqual(['add', 'commit', 'push']);
      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBe('更新');
    });
  });

  describe('create', () => {
    it('既存の最大 id + 1 で採番し、commit / push する', async () => {
      const io = makeIo({
        [`${ROOT}/.tickets/T-5-a.md`]: TICKET_TEXT,
        [`${ROOT}/.tickets/archive/T-9-b.md`]: TICKET_TEXT,
      });

      const record = await makeProvider(io).create({
        title: '新規チケット',
        status: 'backlog',
        priority: 'high',
        now: '2026-07-30T01:00:00.000Z',
      });

      expect(record.frontmatter.id).toBe('T-10');
      expect(record.path).toMatch(/^\.tickets\/T-10-/);
      expect(io.gitCalls.map((c) => c[0])).toEqual(['add', 'commit', 'push']);
    });

    it('アーカイブ済みの id も採番に含める（再利用しない）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/archive/T-3-old.md`]: TICKET_TEXT });

      const record = await makeProvider(io).create({
        title: 'x',
        status: 'backlog',
        priority: 'low',
        now: '2026-07-30T01:00:00.000Z',
      });

      expect(record.frontmatter.id).toBe('T-4');
    });
  });

  describe('archive / remove', () => {
    it('archive は .tickets/archive へ移動し、両方のパスを commit 対象にする', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      const result = await makeProvider(io).archive({
        path: '.tickets/T-1-test.md',
        version: io.hash(TICKET_TEXT),
      });

      expect(result.newPath).toBe('.tickets/archive/T-1-test.md');
      expect(io.files[`${ROOT}/.tickets/archive/T-1-test.md`]).toBe(TICKET_TEXT);
      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBeUndefined();
      expect(io.gitCalls.filter((c) => c[0] === 'add').map((c) => c[2])).toEqual([
        '.tickets/T-1-test.md',
        '.tickets/archive/T-1-test.md',
      ]);
    });

    it('remove はファイルを消して commit / push する', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await makeProvider(io).remove({ path: '.tickets/T-1-test.md', version: io.hash(TICKET_TEXT) });

      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBeUndefined();
      expect(io.gitCalls.map((c) => c[0])).toEqual(['add', 'commit', 'push']);
    });

    it('archive も版数不一致なら拒否し、ファイルを動かさない', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await expect(
        makeProvider(io).archive({ path: '.tickets/T-1-test.md', version: 'stale' }),
      ).rejects.toBeInstanceOf(LocalGitConflictError);

      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBe(TICKET_TEXT);
      expect(io.gitCalls).toHaveLength(0);
    });
  });
});
