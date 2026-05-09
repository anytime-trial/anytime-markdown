/**
 * @jest-environment jsdom
 */
import { buildTrailTabUrl, openReleasesPopup } from '../releasePopupUrl';

describe('buildTrailTabUrl', () => {
  it('sets the requested tab while preserving existing query parameters and hash', () => {
    const url = buildTrailTabUrl('https://example.test/trail?foo=bar&tab=0#section', 3);

    expect(url).toBe('https://example.test/trail?foo=bar&tab=3#section');
  });

  it('returns null for invalid href values', () => {
    expect(buildTrailTabUrl('not a url', 3)).toBeNull();
  });

  it('opens the releases tab as a popup window', () => {
    window.history.pushState({}, '', '/trail?foo=bar&tab=0');
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);

    openReleasesPopup();

    expect(open).toHaveBeenCalledWith(
      'http://localhost/trail?foo=bar&tab=3',
      'anytime-trail-releases',
      'popup,width=1280,height=860,noopener,noreferrer',
    );
    open.mockRestore();
  });
});
