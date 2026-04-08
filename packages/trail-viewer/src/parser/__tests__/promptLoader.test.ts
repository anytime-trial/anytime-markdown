import {
  createPromptEntry,
  generatePromptId,
  extractPromptName,
  extractTags,
} from '../promptLoader';

describe('generatePromptId', () => {
  it('should convert file path to lowercase dash-separated ID', () => {
    expect(generatePromptId('.claude/rules/code-quality.md')).toBe(
      'claude-rules-code-quality-md',
    );
  });

  it('should handle leading dots and slashes', () => {
    expect(generatePromptId('./.claude/CLAUDE.md')).toBe('claude-claude-md');
  });

  it('should handle backslash separators', () => {
    expect(generatePromptId('.claude\\rules\\security.md')).toBe(
      'claude-rules-security-md',
    );
  });

  it('should handle spaces in path', () => {
    expect(generatePromptId('.claude/rules/my rule.md')).toBe(
      'claude-rules-my-rule-md',
    );
  });
});

describe('extractPromptName', () => {
  it('should extract filename without extension', () => {
    expect(extractPromptName('.claude/rules/code-quality.md')).toBe(
      'code-quality',
    );
  });

  it('should handle CLAUDE.md', () => {
    expect(extractPromptName('.claude/CLAUDE.md')).toBe('CLAUDE');
  });

  it('should handle nested paths', () => {
    expect(extractPromptName('.claude/skills/deep/my-skill.md')).toBe(
      'my-skill',
    );
  });

  it('should handle path without extension', () => {
    expect(extractPromptName('some/path/noext')).toBe('noext');
  });
});

describe('extractTags', () => {
  it('should tag rules/ files as rule', () => {
    expect(extractTags('.claude/rules/code-quality.md')).toEqual(['rule']);
  });

  it('should tag skills/ files as skill', () => {
    expect(extractTags('.claude/skills/my-skill.md')).toEqual(['skill']);
  });

  it('should tag CLAUDE.md as main', () => {
    expect(extractTags('.claude/CLAUDE.md')).toEqual(['main']);
  });

  it('should tag projects/ files as project', () => {
    expect(extractTags('.claude/projects/my-project/rules.md')).toEqual([
      'project',
    ]);
  });

  it('should return multiple tags when applicable', () => {
    const tags = extractTags('.claude/projects/my-project/CLAUDE.md');
    expect(tags).toContain('main');
    expect(tags).toContain('project');
  });

  it('should return empty array for unrecognized paths', () => {
    expect(extractTags('some/random/path.md')).toEqual([]);
  });
});

describe('createPromptEntry', () => {
  it('should create a TrailPromptEntry from file metadata', () => {
    const entry = createPromptEntry(
      '.claude/rules/code-quality.md',
      '# Code Quality\nSome rules here.',
      '2026-04-07T10:00:00Z',
    );

    expect(entry).toEqual({
      id: 'claude-rules-code-quality-md',
      name: 'code-quality',
      content: '# Code Quality\nSome rules here.',
      version: 1,
      tags: ['rule'],
      createdAt: '2026-04-07T10:00:00Z',
      updatedAt: '2026-04-07T10:00:00Z',
    });
  });

  it('should increment version when existingVersion is provided', () => {
    const entry = createPromptEntry(
      '.claude/CLAUDE.md',
      '# Main config',
      '2026-04-07T12:00:00Z',
      3,
    );

    expect(entry.version).toBe(4);
    expect(entry.tags).toContain('main');
  });

  it('should default version to 1 when no existing version', () => {
    const entry = createPromptEntry(
      '.claude/skills/deploy.md',
      'deploy skill',
      '2026-04-07T08:00:00Z',
    );

    expect(entry.version).toBe(1);
  });

  it('should handle empty content', () => {
    const entry = createPromptEntry(
      '.claude/rules/empty.md',
      '',
      '2026-04-07T09:00:00Z',
    );

    expect(entry.content).toBe('');
    expect(entry.name).toBe('empty');
  });
});
