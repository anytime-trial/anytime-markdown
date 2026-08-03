import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * ロケールを保持するナビゲーション API。
 *
 * 内部リンクは素の `next/link` ではなくここの `Link` を使う。素の `Link` は
 * `/en/...` から辿ったときにロケールが既定（ja）へ落ちるが、ビルドもテストも
 * 通ってしまうため、失敗が「リンクを踏むまで分からない」形で出る。
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
