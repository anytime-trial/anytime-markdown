import { parseArgs } from '../cli';
import type { CliArgs } from '../cli';

describe('parseArgs', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('should return default values with no arguments', () => {
    const result: CliArgs = parseArgs(['node', 'trail']);
    expect(result.tsconfigPath).toBe('./tsconfig.json');
    expect(result.output).toBe('./trail.json');
    expect(result.exclude).toEqual([]);
    expect(result.includeTests).toBe(false);
    expect(result.format).toBe('cytoscape');
  });

  it('should parse --tsconfig', () => {
    const result = parseArgs(['node', 'trail', '--tsconfig', './custom.json']);
    expect(result.tsconfigPath).toBe('./custom.json');
  });

  it('should parse --format mermaid and set default output', () => {
    const result = parseArgs(['node', 'trail', '--format', 'mermaid']);
    expect(result.format).toBe('mermaid');
    expect(result.output).toBe('./trail.md');
  });

  it('should call process.exit(0) on --help', () => {
    expect(() => parseArgs(['node', 'trail', '--help'])).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should call process.exit(0) on -h', () => {
    expect(() => parseArgs(['node', 'trail', '-h'])).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should error on invalid --format value', () => {
    expect(() => parseArgs(['node', 'trail', '--format', 'xml'])).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith('Invalid format: xml. Valid: cytoscape, mermaid');
  });

  it('should error on unknown argument with available options', () => {
    expect(() => parseArgs(['node', 'trail', '--unknown'])).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorMessage: string = stderrSpy.mock.calls[0][0];
    expect(errorMessage).toContain('Unknown argument: --unknown');
    expect(errorMessage).toContain('Available options:');
    expect(errorMessage).toContain('--help');
  });

  it('should parse multiple --exclude options', () => {
    const result = parseArgs([
      'node', 'trail',
      '--exclude', 'src/gen/**',
      '--exclude', 'src/__tests__/**',
    ]);
    expect(result.exclude).toEqual(['src/gen/**', 'src/__tests__/**']);
  });

  it('should parse --include-tests flag', () => {
    const result = parseArgs(['node', 'trail', '--include-tests']);
    expect(result.includeTests).toBe(true);
  });
});
