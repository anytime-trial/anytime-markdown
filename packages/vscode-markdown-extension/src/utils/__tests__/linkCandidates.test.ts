/**
 * buildLinkCandidates のテスト（host 側リンクパス解決）。
 *
 * リグレッション: `/README.ja.md` のような先頭 '/' リンクが「Invalid file path」で
 * 開けなかったバグ。VS Code 組込プレビュー同様、先頭 '/' はワークスペースルート相対と
 * して解決し、ワークスペース外への脱出は拒否する。相対パスの従来挙動は維持する。
 */
import * as path from 'path';
import { buildLinkCandidates } from '../linkCandidates';

const WS = path.resolve('/ws');
const DOC_DIR = path.resolve('/ws/notes');

describe('buildLinkCandidates', () => {
  it('先頭 / の絶対パスをワークスペースルート相対として解決する', () => {
    expect(buildLinkCandidates('/README.ja.md', DOC_DIR, WS)).toEqual([
      path.resolve(WS, 'README.ja.md'),
    ]);
  });

  it('先頭 / のサブディレクトリも解決する', () => {
    expect(buildLinkCandidates('/docs/spec.md', DOC_DIR, WS)).toEqual([
      path.resolve(WS, 'docs/spec.md'),
    ]);
  });

  it('先頭 / でワークスペース外へ脱出するパスは拒否する', () => {
    expect(buildLinkCandidates('/../../etc/passwd', DOC_DIR, WS)).toBeNull();
  });

  it('ワークスペース未定義時の絶対パスは拒否する', () => {
    expect(buildLinkCandidates('/README.ja.md', DOC_DIR, undefined)).toBeNull();
  });

  it('相対パスでワークスペース外へ脱出するパスは拒否する', () => {
    expect(buildLinkCandidates('../../etc/passwd', DOC_DIR, WS)).toBeNull();
  });

  it('相対パスはドキュメント位置を最初の候補にする', () => {
    const result = buildLinkCandidates('./other.md', DOC_DIR, WS);
    expect(result?.[0]).toBe(path.resolve(DOC_DIR, 'other.md'));
  });

  it('相対パスはワークスペースルート基準も候補に含める', () => {
    const result = buildLinkCandidates('other.md', DOC_DIR, WS);
    expect(result).toContain(path.resolve(WS, 'other.md'));
  });

  it('空文字は null', () => {
    expect(buildLinkCandidates('', DOC_DIR, WS)).toBeNull();
  });
});
