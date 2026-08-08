import { normalizeTargetPath } from '../../../src/ingest/review/normalizeTargetPath';

/**
 * 異常値のケースはすべて本番 caravan-book.db の実データ（2026-08-05 時点 1,094 行）から
 * 採取した。想像で作った入力ではないため、ここを緩めると実データが再び通り抜ける。
 */
const file = (path: string) => ({ path, kind: 'file', absolute: false });
/**
 * 既知拡張子でも明らかなファイルでもない形は `unknown`。
 * 拡張子ヒューリスティックで file/directory を二分すると、
 * `spec/92.doctrine`（ドット入りディレクトリ）と `scripts/post-commit`
 * （拡張子なしファイル）が必ず 0 件になる述語へ落ちる。
 */
const unknown = (path: string) => ({ path, kind: 'unknown', absolute: false });

describe('normalizeTargetPath', () => {
  describe('正常系: リポジトリ相対のファイルパス', () => {
    it.each([
      'packages/memory-core/src/db/attach.ts',
      'packages/web-app/src/app/press/press.module.css',
      '.github/workflows/daily-companies.yml',
      'scripts/check-skill-refs.mjs',
      'src/hooks/useHydrated.ts',
    ])('%s をファイルとして返す', (raw) => {
      expect(normalizeTargetPath(raw)).toEqual(file(raw));
    });
  });

  describe('正常系: 断定できない形は unknown（照合側で両方式を試す）', () => {
    it.each([
      ['packages/markdown-viewer', 'packages/markdown-viewer'],
      ['packages/trail-viewer/src', 'packages/trail-viewer/src'],
      ['packages/trail-viewer/src/', 'packages/trail-viewer/src'],
      // 連番＋ドットのディレクトリ名（この monorepo の docs 構成で常用）
      ['spec/92.doctrine', 'spec/92.doctrine'],
      ['spec/31.trail/16.doctrine-judgment', 'spec/31.trail/16.doctrine-judgment'],
      // 拡張子なしの実ファイル
      ['scripts/ticket-hooks/post-commit', 'scripts/ticket-hooks/post-commit'],
    ])('%s を unknown として返す', (raw, expected) => {
      expect(normalizeTargetPath(raw)).toEqual(unknown(expected));
    });
  });

  // 実データ 4 件（/anytime-trade/docs/... と /Shared/anytime-markdown-docs/...）。
  // 先頭の / を剥がすと `Shared/anytime-markdown-docs/...` という実在しないパスに化け、
  // ワークスペースを特定できる唯一の情報が失われる。
  describe('正常系: 絶対パスは剥がさず absolute を立てる', () => {
    it.each([
      '/anytime-trade/docs/specs/2026-07-12-data-collection-architecture.md',
      '/Shared/anytime-markdown-docs/proposal/20260713-airspace-allocation-collision-awareness.ja.md',
    ])('%s を絶対パスのまま返す', (raw) => {
      expect(normalizeTargetPath(raw)).toEqual({ path: raw, kind: 'file', absolute: true });
    });

    it('重複したスラッシュは 1 個に畳む', () => {
      expect(normalizeTargetPath('//anytime-trade/docs/x.md')).toEqual({
        path: '/anytime-trade/docs/x.md',
        kind: 'file',
        absolute: true,
      });
    });

    it('ルート単独は拒否する', () => {
      expect(normalizeTargetPath('/')).toBeNull();
    });
  });

  describe('行番号サフィックスの除去', () => {
    it('単一行番号を落とす', () => {
      expect(normalizeTargetPath('packages/a/src/x.ts:24')).toEqual(file('packages/a/src/x.ts'));
    });

    it('行範囲を落とす', () => {
      expect(normalizeTargetPath('packages/a/src/x.ts:24-48')).toEqual(file('packages/a/src/x.ts'));
    });

    // 実データ: `installSkills.ts:243,262,338,346`（空白なしのカンマ列）
    it('空白なしのカンマ列も落とす', () => {
      expect(normalizeTargetPath('packages/a/src/x.ts:243,262,338,346')).toEqual(
        file('packages/a/src/x.ts'),
      );
    });

    // 実データ: `packages/trail-viewer/src/i18n/__tests__/i18n.test.ts:24, 48, 49`
    // 旧 stripLineSuffix は /:\d+(?:-\d+)?$/ でカンマ列に対応せず、丸ごと残していた。
    it('カンマ区切りの複数行番号を落とす', () => {
      expect(
        normalizeTargetPath('packages/trail-viewer/src/i18n/__tests__/i18n.test.ts:24, 48, 49'),
      ).toEqual(file('packages/trail-viewer/src/i18n/__tests__/i18n.test.ts'));
    });
  });

  describe('前置詞・囲み文字の除去', () => {
    it.each([
      ['./packages/a/src/x.ts', 'packages/a/src/x.ts'],
      ['`packages/a/src/x.ts`', 'packages/a/src/x.ts'],
      ['"packages/a/src/x.ts"', 'packages/a/src/x.ts'],
      ["'packages/a/src/x.ts'", 'packages/a/src/x.ts'],
      ['  packages/a/src/x.ts  ', 'packages/a/src/x.ts'],
    ])('%s を %s に正規化する', (raw, expected) => {
      expect(normalizeTargetPath(raw)).toEqual(file(expected));
    });
  });

  describe('異常系: 実データから採取した拒否ケース', () => {
    it('空・null・undefined は null', () => {
      expect(normalizeTargetPath(null)).toBeNull();
      expect(normalizeTargetPath(undefined)).toBeNull();
      expect(normalizeTargetPath('')).toBeNull();
      expect(normalizeTargetPath('   ')).toBeNull();
    });

    // 実データ: extractTargetFromFinding がバッククォート内容全体を積んだ結果
    it('複数行のシェル実行ログを拒否する', () => {
      const raw = [
        '$ node scripts/check-skill-manifest-bump.mjs 8191c2b8e',
        '[check-skill-manifest-bump] manifest の版数バンプが漏れています:',
        '  ✗ vscode-trail-extension/skills/anytime-dev-retro — 版数が上がっていない (base=12 head=12)',
        'exit 1',
      ].join('\n');
      expect(normalizeTargetPath(raw)).toBeNull();
    });

    // 実データ: `node --test scripts/check-skill-refs.test.mjs`
    it('コマンド行（空白を含む）を拒否する', () => {
      expect(normalizeTargetPath('node --test scripts/check-skill-refs.test.mjs')).toBeNull();
      expect(normalizeTargetPath('$ node scripts/x.mjs')).toBeNull();
    });

    // 実データ: `https://github.com/owner/repo/blob/feature/foo/docs/design.md`
    // ブランチ名にスラッシュを含み得るため ref とパスの境界を確定できない。推測で当てにいかない。
    it('URL を拒否する', () => {
      expect(
        normalizeTargetPath('https://github.com/owner/repo/blob/feature/foo/docs/design.md'),
      ).toBeNull();
      expect(normalizeTargetPath('http://example.com/a.ts')).toBeNull();
    });

    it('親ディレクトリ参照を拒否する', () => {
      expect(normalizeTargetPath('../outside/x.ts')).toBeNull();
      expect(normalizeTargetPath('packages/../../etc/passwd')).toBeNull();
    });

    it('グロブを拒否する', () => {
      expect(normalizeTargetPath('packages/*/src/x.ts')).toBeNull();
    });

    it('パス要素を持たない単語を拒否する', () => {
      expect(normalizeTargetPath('node')).toBeNull();
      expect(normalizeTargetPath('レビュー対象')).toBeNull();
    });

    it('異常に長い文字列を拒否する', () => {
      expect(normalizeTargetPath(`packages/${'a'.repeat(300)}/x.ts`)).toBeNull();
    });
  });

  describe('冪等性', () => {
    it('正規化済みの値を再度通しても変わらない', () => {
      const once = normalizeTargetPath('./packages/a/src/x.ts:24');
      expect(once).not.toBeNull();
      expect(normalizeTargetPath(once!.path)).toEqual(once);
    });
  });
});
