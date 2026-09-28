'use client';

import { Link as MuiLink } from '@mui/material';
import type { ReactNode } from 'react';

import { Link } from '../../../i18n/navigation';

/**
 * 記法別 LP へのリンク（クライアントコンポーネント）。
 *
 * `MarkdownGuide` はサーバーコンポーネントで、MUI の `Link` へ `component={Link}` を
 * 直接渡すと、コンポーネント参照（関数）がサーバー → クライアント境界を越えられず
 * `/markdown` が 500 になる（jest の render は通るため実行時にしか出ない）。
 * 境界を越えるのは href と文字列だけにし、ロケール保持の `Link` との合成は
 * クライアント側で行う。素の `<a>` を使わないのはブラウザ既定の #0000EE が
 * ダーク地で 2.01:1 になるため（design.md 11 章）。
 */
export function TopicLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <MuiLink component={Link} href={href}>
      {children}
    </MuiLink>
  );
}
