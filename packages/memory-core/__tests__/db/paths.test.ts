import { getMemoryCoreDbPath, getTrailHome } from '../../src/db/paths';

describe('getTrailHome', () => {
  const ORIGINAL_TRAIL_HOME = process.env.TRAIL_HOME;

  afterEach(() => {
    if (ORIGINAL_TRAIL_HOME === undefined) {
      delete process.env.TRAIL_HOME;
    } else {
      process.env.TRAIL_HOME = ORIGINAL_TRAIL_HOME;
    }
  });

  it('uses TRAIL_HOME env variable when set', () => {
    process.env.TRAIL_HOME = '/custom/trail/home';
    expect(getTrailHome('/anywhere')).toBe('/custom/trail/home');
  });

  it('returns <workspaceRoot>/.anytime/trail when env is unset and workspaceRoot is given', () => {
    delete process.env.TRAIL_HOME;
    expect(getTrailHome('/workspace/foo')).toBe('/workspace/foo/.anytime/trail');
  });

  it('falls back to process.cwd() when workspaceRoot is undefined and cwd is safe', () => {
    delete process.env.TRAIL_HOME;
    const cwd = process.cwd();
    // Spy on cwd to control the fallback path deterministically
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/safe/workspace');
    try {
      expect(getTrailHome()).toBe('/safe/workspace/.anytime/trail');
    } finally {
      cwdSpy.mockRestore();
    }
    // Original cwd was not mutated
    expect(process.cwd()).toBe(cwd);
  });

  it('refuses to fall back to a protected vscode-server path when workspaceRoot is missing', () => {
    delete process.env.TRAIL_HOME;
    const cwdSpy = jest
      .spyOn(process, 'cwd')
      .mockReturnValue('/home/user/.vscode-server/cli/servers/foo');
    try {
      expect(() => getTrailHome()).toThrow(/refusing to fall back to protected path/);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('refuses to fall back to a .vscode path when workspaceRoot is missing', () => {
    delete process.env.TRAIL_HOME;
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/home/user/.vscode');
    try {
      expect(() => getTrailHome()).toThrow(/refusing to fall back to protected path/);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('does not enforce the protected-path check when workspaceRoot is explicitly given', () => {
    delete process.env.TRAIL_HOME;
    // Explicit workspaceRoot bypasses the assertion (caller is trusted).
    expect(getTrailHome('/home/user/.vscode-server')).toBe(
      '/home/user/.vscode-server/.anytime/trail',
    );
  });
});

describe('getMemoryCoreDbPath', () => {
  const ORIGINAL_TRAIL_HOME = process.env.TRAIL_HOME;

  afterEach(() => {
    if (ORIGINAL_TRAIL_HOME === undefined) {
      delete process.env.TRAIL_HOME;
    } else {
      process.env.TRAIL_HOME = ORIGINAL_TRAIL_HOME;
    }
  });

  it('returns <trail_home>/db/memory-core.db', () => {
    process.env.TRAIL_HOME = '/x/trail';
    expect(getMemoryCoreDbPath()).toBe('/x/trail/db/memory-core.db');
  });

  it('honors workspaceRoot when TRAIL_HOME is unset', () => {
    delete process.env.TRAIL_HOME;
    expect(getMemoryCoreDbPath('/ws')).toBe('/ws/.anytime/trail/db/memory-core.db');
  });
});
