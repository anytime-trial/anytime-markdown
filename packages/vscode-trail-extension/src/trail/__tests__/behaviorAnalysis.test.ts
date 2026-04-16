import {
  classifyErrorType,
  extractFilePath,
  extractCommand,
} from '../behaviorAnalysis';

describe('classifyErrorType', () => {
  it('Path does not exist → file_not_found', () => {
    expect(classifyErrorType('Path does not exist: /foo/bar.ts')).toBe('file_not_found');
  });

  it('No such file → file_not_found', () => {
    expect(classifyErrorType('No such file or directory: /foo')).toBe('file_not_found');
  });

  it('Exit code 127 → invalid_params', () => {
    expect(classifyErrorType('Exit code 127\n/bin/bash: python3: command not found')).toBe('invalid_params');
  });

  it('Exit code 1 → cmd_failed', () => {
    expect(classifyErrorType('Exit code 1\nsome error output')).toBe('cmd_failed');
  });

  it('user_rejected → user_rejected', () => {
    expect(classifyErrorType("The user doesn't want to proceed with this tool use.")).toBe('user_rejected');
  });

  it('File has not been read yet → constraint_violation', () => {
    expect(classifyErrorType('File has not been read yet. Read it first before writing to it.')).toBe('constraint_violation');
  });

  it('InputValidationError → constraint_violation', () => {
    expect(classifyErrorType('InputValidationError: Read failed due to the following issue:')).toBe('constraint_violation');
  });

  it('不明なエラー → cmd_failed にフォールバック', () => {
    expect(classifyErrorType('Some unknown error message')).toBe('cmd_failed');
  });

  it('空文字列 → cmd_failed にフォールバック', () => {
    expect(classifyErrorType('')).toBe('cmd_failed');
  });
});

describe('extractFilePath', () => {
  it('Read の file_path を抽出する', () => {
    const input = { file_path: '/anytime-markdown/foo.ts' };
    expect(extractFilePath('Read', input)).toBe('/anytime-markdown/foo.ts');
  });

  it('Edit の file_path を抽出する', () => {
    const input = { file_path: '/anytime-markdown/bar.tsx', old_string: 'a', new_string: 'b' };
    expect(extractFilePath('Edit', input)).toBe('/anytime-markdown/bar.tsx');
  });

  it('Bash には null を返す', () => {
    expect(extractFilePath('Bash', { command: 'ls' })).toBeNull();
  });

  it('input が undefined → null', () => {
    expect(extractFilePath('Read', undefined)).toBeNull();
  });
});

describe('extractCommand', () => {
  it('Bash の command を抽出する', () => {
    const input = { command: 'npm run build' };
    expect(extractCommand('Bash', input)).toBe('npm run build');
  });

  it('Agent の description を抽出する', () => {
    const input = { description: 'Search for API endpoints', prompt: '...' };
    expect(extractCommand('Agent', input)).toBe('Search for API endpoints');
  });

  it('Read には null を返す', () => {
    expect(extractCommand('Read', { file_path: '/foo' })).toBeNull();
  });

  it('input が undefined → null', () => {
    expect(extractCommand('Bash', undefined)).toBeNull();
  });
});
