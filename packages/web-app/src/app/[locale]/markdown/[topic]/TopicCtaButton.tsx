'use client';

import { Button } from '@mui/material';

import { Link } from '../../../../i18n/navigation';

/**
 * LP から `/markdown` へ送る CTA。
 *
 * Why not: これを `TopicLanding`（server component）へ直接書かない。MUI の `Button` は
 * client component なので、`component={Link}` は「関数（コンポーネント）を client component
 * の prop として渡す」ことになり、サーバー描画が
 * `Functions cannot be passed directly to Client Components` で落ちる。落ちても Suspense の
 * フォールバックへ縮退してクライアントで描き直されるため、画面は正しく見えるのに
 * **サーバーが返す HTML から本文が丸ごと消える**（実測: h1/h2/h3 が 0 個）。SSR 本文が
 * 目的のページでは、これは機能の消失にあたる。境界をこちら側へ 1 枚挟んで防ぐ。
 */

/** design.md §2.1 の唯一の差し色。CTA にだけ使う */
const ACCENT_AMBER = '#E8A012';
const ACCENT_AMBER_HOVER = '#D4920E';

export function TopicCtaButton({ label }: Readonly<{ label: string }>) {
  return (
    <Button
      component={Link}
      href="/markdown"
      variant="contained"
      sx={{
        bgcolor: ACCENT_AMBER,
        // アンバー地に白文字だとコントラストが足りない。design.md の CTA は暗い前景を取る
        color: '#1A1A1A',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        '&:hover': { bgcolor: ACCENT_AMBER_HOVER },
      }}
    >
      {label}
    </Button>
  );
}
