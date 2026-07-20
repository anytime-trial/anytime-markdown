'use client';

/**
 * read-only・最小（chromeless）の markdown 表示を **Web Component
 * `<anytime-markdown-view>` 経由** で mount する web-app 用ラッパ（report / docs 記事ビュー向け）。
 *
 * `VanillaRichMarkdownEditor` と同じ仕組み（{@link VanillaMarkdownEditorMount} のライフサイクル流用 +
 * カスタム要素生成アダプタ）だが、tag が `anytime-markdown-view` のため read-only・ツールバー/
 * ステータスバー非表示が要素側で強制される。consumer は content（initialContent）と theme/locale だけ
 * 渡せばよい。
 *
 * 本文中の GitHub `.md` blob リンクはクリックを横取りし、新規タブの `/markdown`
 * エディタ（レビューモード）で開く（チケット本文からの設計書レビュー動線）。
 * 対象外のリンクは通常のブラウザ遷移のまま。
 */

import '@anytime-markdown/markdown-rich/src/view-element';
import {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from '@anytime-markdown/markdown-react-islands';
import { useCallback } from 'react';

import { buildMarkdownEditorUrl, parseGitHubMarkdownBlobUrl } from '../../lib/githubBlobUrl';
import { createWebComponentMount } from './markdownWebComponentMount';

const mountMarkdownView = createWebComponentMount('anytime-markdown-view');

export default function VanillaMarkdownView(
  props: Readonly<Omit<VanillaMarkdownEditorMountProps, 'mount'>>,
) {
  // capture 段で横取りする: エディタ内部（ProseMirror）のリンク処理より先に判定し、
  // 対象なら preventDefault + stopPropagation で既定遷移と内部処理の双方を抑止する。
  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest('a[href]');
    if (!anchor) return;
    const blobRef = parseGitHubMarkdownBlobUrl(anchor.getAttribute('href') ?? '');
    if (!blobRef) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(buildMarkdownEditorUrl(blobRef), '_blank', 'noopener,noreferrer');
  }, []);

  return (
    // display:contents でレイアウトに影響させずクリック委譲だけを担う
    <div style={{ display: 'contents' }} onClickCapture={handleClickCapture}>
      <VanillaMarkdownEditorMount mount={mountMarkdownView} {...props} />
    </div>
  );
}
