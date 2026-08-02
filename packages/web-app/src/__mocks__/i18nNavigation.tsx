/**
 * `src/i18n/navigation` の差し替え（jest moduleNameMapper 経由）。
 *
 * 実体は next-intl の ESM をレンダリング時に辿り、`NextIntlClientProvider` の外では
 * `useLocale` が投げるため、単体テストでは Link を描画できない。ここでは素の `<a>` と
 * 呼び出し記録付きの router を提供し、「どこへ遷移させたか」をテストから検証できるようにする。
 *
 * ロケールプレフィックスが実際に付くかどうかは単体テストの守備範囲外で、
 * `next build` + 実機 curl（受け入れ基準 1〜5）が担保する。
 */
import React from 'react';

export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
};

export let mockPathname = '/';

export function __setMockPathname(value: string): void {
  mockPathname = value;
}

export function __resetNavigationMock(): void {
  mockPathname = '/';
  for (const fn of Object.values(mockRouter)) fn.mockReset();
}

type LinkProps = React.ComponentProps<'a'> & { href: string; locale?: string };

export function Link({ href, locale, children, ...rest }: Readonly<LinkProps>) {
  return (
    <a href={href} data-locale={locale} {...rest}>
      {children}
    </a>
  );
}

export function useRouter() {
  return mockRouter;
}

export function usePathname() {
  return mockPathname;
}

export function getPathname({ href }: { href: string }) {
  return href;
}

export function redirect() {
  throw new Error('redirect is not implemented in the navigation mock');
}
