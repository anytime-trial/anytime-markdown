export const RELEASES_TAB_INDEX = 3;

export function buildTrailTabUrl(href: string, tab: number): string | null {
  try {
    const url = new URL(href);
    url.searchParams.set('tab', String(tab));
    return url.toString();
  } catch {
    return null;
  }
}

export function openReleasesPopup(): void {
  if (typeof window === 'undefined') return;

  const url = buildTrailTabUrl(window.location.href, RELEASES_TAB_INDEX);
  if (!url) return;

  window.open(url, 'anytime-trail-releases', 'popup,width=1280,height=860,noopener,noreferrer');
}
