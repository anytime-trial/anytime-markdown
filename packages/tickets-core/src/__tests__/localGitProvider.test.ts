import {
  LocalGitConflictError,
  LocalGitPathError,
  LocalGitProvider,
  type LocalGitIo,
} from '../localGitProvider';
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
  /** push 失敗時に git が吐く文言。null なら push は成功する */
  pushError: string | null;
  commitError: string | null;
  warnings: string[];
} {
  const state = {
    files: { ...files },
    gitCalls: [] as string[][],
    pushError: null as string | null,
    commitError: null as string | null,
    warnings: [] as string[],
    exists: async (path: string) => state.files[path] !== undefined,
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
      if (args[0] === 'push' && state.pushError !== null) {
        throw new Error(state.pushError);
      }
      if (args[0] === 'commit' && state.commitError !== null) {
        throw new Error(state.commitError);
      }
      return '';
    },
  };
  return state;
}

function makeProvider(io: ReturnType<typeof makeIo>) {
  return new LocalGitProvider({
    provider: 'local-git',
    repoRoot: ROOT,
    io,
    onWarn: (message) => io.warnings.push(message),
  });
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
        ['commit', '-m', 'ticket: update T-1', '--', '.tickets/T-1-test.md'],
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

    it('push の非 fast-forward 拒否は競合として返す（コミットは残す）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      io.pushError = '! [rejected] main -> main (fetch first)';

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

  describe('commit / push の失敗の扱い', () => {
    it('commit は対象パスだけを指定する（利用者が別途 stage した変更を巻き込まない）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await makeProvider(io).update({
        path: '.tickets/T-1-test.md',
        content: 'x',
        version: io.hash(TICKET_TEXT),
        message: 'm',
      });

      // パススペック無しの `git commit -m` はインデックス全体をコミットするため、
      // チケット保存が無関係な stage 済み変更まで push してしまう（実測で再現済み）。
      const commit = io.gitCalls.find((c) => c[0] === 'commit');
      expect(commit).toEqual(['commit', '-m', 'm', '--', '.tickets/T-1-test.md']);
    });

    it('archive の commit は移動元と移動先の両方を指定する', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await makeProvider(io).archive({ path: '.tickets/T-1-test.md', version: io.hash(TICKET_TEXT) });

      const commit = io.gitCalls.find((c) => c[0] === 'commit');
      expect(commit?.slice(-2)).toEqual(['.tickets/T-1-test.md', '.tickets/archive/T-1-test.md']);
    });

    it('push 先が無いだけなら競合にせず警告に留める（remote 未設定のクローンでも前進できる）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      io.pushError = 'fatal: No configured push destination.';

      await expect(
        makeProvider(io).update({
          path: '.tickets/T-1-test.md',
          content: 'x',
          version: io.hash(TICKET_TEXT),
          message: 'm',
        }),
      ).resolves.toBeDefined();

      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBe('x');
      expect(io.warnings.join(' ')).toContain('push 先');
    });

    it('push のその他の失敗は競合にしない（再読込しても解決しないため）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      io.pushError = 'fatal: Authentication failed';

      await expect(
        makeProvider(io).update({
          path: '.tickets/T-1-test.md',
          content: 'x',
          version: io.hash(TICKET_TEXT),
          message: 'm',
        }),
      ).rejects.not.toBeInstanceOf(LocalGitConflictError);
    });

    it('commit の失敗は「書き込み済みだが commit できていない」と伝える', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      io.commitError = 'nothing to commit, working tree clean';

      await expect(
        makeProvider(io).update({
          path: '.tickets/T-1-test.md',
          content: 'x',
          version: io.hash(TICKET_TEXT),
          message: 'm',
        }),
      ).rejects.toThrow(/commit できませんでした/);
    });
  });

  describe('パス検証（チケット置き場の外へ出さない）', () => {
    const OUTSIDE = ['.tickets/../../etc/passwd.md', '/etc/passwd.md', '.tickets/sub/../../x.md', 'other.md'];

    it.each(OUTSIDE)('get は %s を拒否する', async (path) => {
      await expect(makeProvider(makeIo()).get(path)).rejects.toBeInstanceOf(LocalGitPathError);
    });

    it.each(OUTSIDE)('update は %s を拒否し、書き込みも git 実行もしない', async (path) => {
      const io = makeIo();
      await expect(
        makeProvider(io).update({ path, content: 'PWNED', version: 'v', message: 'm' }),
      ).rejects.toBeInstanceOf(LocalGitPathError);
      expect(Object.keys(io.files)).toHaveLength(0);
      expect(io.gitCalls).toHaveLength(0);
    });

    it.each(OUTSIDE)('remove は %s を拒否し、削除しない', async (path) => {
      const io = makeIo({ [`${ROOT}/${path}`]: 'victim' });
      await expect(makeProvider(io).remove({ path, version: 'v' })).rejects.toBeInstanceOf(
        LocalGitPathError,
      );
      expect(io.files[`${ROOT}/${path}`]).toBe('victim');
    });

    it.each(OUTSIDE)('archive は %s を拒否する', async (path) => {
      await expect(
        makeProvider(makeIo()).archive({ path, version: 'v' }),
      ).rejects.toBeInstanceOf(LocalGitPathError);
    });

    it('不正パスは 400（サーバー障害ではなく受理できない要求として区別する）', async () => {
      await expect(makeProvider(makeIo()).get('../x.md')).rejects.toMatchObject({ status: 400 });
    });

    it('正当なパス（直下・アーカイブ）は通す', async () => {
      const io = makeIo({
        [`${ROOT}/.tickets/T-1-a.md`]: TICKET_TEXT,
        [`${ROOT}/.tickets/archive/T-2-b.md`]: TICKET_TEXT,
      });
      await expect(makeProvider(io).get('.tickets/T-1-a.md')).resolves.toBeDefined();
      await expect(makeProvider(io).get('.tickets/archive/T-2-b.md')).resolves.toBeDefined();
    });
  });

  describe('remove の楽観ロック', () => {
    it('版数不一致なら拒否し、削除も git 実行もしない', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });

      await expect(
        makeProvider(io).remove({ path: '.tickets/T-1-test.md', version: 'stale' }),
      ).rejects.toBeInstanceOf(LocalGitConflictError);

      expect(io.files[`${ROOT}/.tickets/T-1-test.md`]).toBe(TICKET_TEXT);
      expect(io.gitCalls).toHaveLength(0);
    });

    it('読み込み後に他者が削除していたら競合として返す（生の ENOENT にしない）', async () => {
      const io = makeIo({ [`${ROOT}/.tickets/T-1-test.md`]: TICKET_TEXT });
      const version = io.hash(TICKET_TEXT);
      delete io.files[`${ROOT}/.tickets/T-1-test.md`];

      await expect(
        makeProvider(io).update({ path: '.tickets/T-1-test.md', content: 'x', version, message: 'm' }),
      ).rejects.toBeInstanceOf(LocalGitConflictError);
    });
  });
});
