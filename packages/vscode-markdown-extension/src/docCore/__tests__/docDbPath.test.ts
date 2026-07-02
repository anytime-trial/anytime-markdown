import * as path from 'path';
import { resolveDocDbPath } from '../docDbPath';

const WS = path.resolve('/ws');

describe('resolveDocDbPath', () => {
  it('returns the default path under the workspace root when unconfigured', () => {
    const warn = jest.fn();
    expect(resolveDocDbPath(WS, undefined, warn)).toBe(path.join(WS, '.anytime', 'markdown', 'doc-core.db'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns the default path when configured is blank', () => {
    const warn = jest.fn();
    expect(resolveDocDbPath(WS, '   ', warn)).toBe(path.join(WS, '.anytime', 'markdown', 'doc-core.db'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves a configured relative path against the workspace root', () => {
    const warn = jest.fn();
    expect(resolveDocDbPath(WS, 'custom/doc.db', warn)).toBe(path.join(WS, 'custom', 'doc.db'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts a configured absolute path that stays within the workspace root', () => {
    const warn = jest.fn();
    const inside = path.join(WS, 'sub', 'doc.db');
    expect(resolveDocDbPath(WS, inside, warn)).toBe(inside);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the default path and warns when configured escapes the workspace root via traversal', () => {
    const warn = jest.fn();
    expect(resolveDocDbPath(WS, '../../etc/evil.db', warn)).toBe(path.join(WS, '.anytime', 'markdown', 'doc-core.db'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual(expect.stringContaining('../../etc/evil.db'));
  });

  it('falls back to the default path and warns when configured is an absolute path outside the workspace root', () => {
    const warn = jest.fn();
    const outside = path.resolve('/etc/evil.db');
    expect(resolveDocDbPath(WS, outside, warn)).toBe(path.join(WS, '.anytime', 'markdown', 'doc-core.db'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual(expect.stringContaining(outside));
  });
});
