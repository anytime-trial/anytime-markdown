import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getSectionFromText, getSection } from '../../tools/getSection';

describe('getSectionFromText', () => {
  const doc = [
    '# Title',
    '',
    'Intro text.',
    '',
    '## Section A',
    '',
    'Content A.',
    '',
    '## Section B',
    '',
    'Content B.',
    '',
    '### Subsection B1',
    '',
    'Sub content.',
    '',
    '## Section C',
    '',
    'Content C.',
  ].join('\n');

  it('should extract section by heading text', () => {
    const result = getSectionFromText(doc, '## Section A');
    expect(result).toBe('## Section A\n\nContent A.\n');
  });

  it('should include subsections', () => {
    const result = getSectionFromText(doc, '## Section B');
    expect(result).toBe('## Section B\n\nContent B.\n\n### Subsection B1\n\nSub content.\n');
  });

  it('should extract last section until end', () => {
    const result = getSectionFromText(doc, '## Section C');
    expect(result).toBe('## Section C\n\nContent C.');
  });

  it('should return null for non-existent heading', () => {
    const result = getSectionFromText(doc, '## Not Exist');
    expect(result).toBeNull();
  });

  it('should extract top-level heading with all content', () => {
    const result = getSectionFromText(doc, '# Title');
    expect(result).toBe(doc);
  });

  it('should match heading exactly', () => {
    const result = getSectionFromText(doc, '## Section');
    expect(result).toBeNull();
  });
});

describe('getSection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should get section from file', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Title\n\n## A\n\nContent A\n\n## B\n\nContent B\n');
    const result = await getSection({ path: 'test.md', heading: '## A' }, tmpDir);
    expect(result).toBe('## A\n\nContent A\n');
  });

  it('should throw for non-existent heading', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Title\n');
    await expect(getSection({ path: 'test.md', heading: '## Missing' }, tmpDir)).rejects.toThrow('not found');
  });
});
