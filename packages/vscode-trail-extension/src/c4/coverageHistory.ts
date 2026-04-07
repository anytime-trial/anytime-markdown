import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CoverageMatrix } from '@anytime-markdown/c4-kernel';

export class CoverageHistory {
  constructor(
    private readonly historyDir: string,
    private readonly maxEntries: number,
  ) {}

  save(matrix: CoverageMatrix): void {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
    const filePath = path.join(this.historyDir, `${matrix.generatedAt}.json`);
    fs.writeFileSync(filePath, JSON.stringify(matrix));
    this.rotate();
  }

  loadLatest(): CoverageMatrix | null {
    const files = this.listFiles();
    if (files.length === 0) return null;
    return this.readFile(files.at(-1)!);
  }

  loadPrevious(): CoverageMatrix | null {
    const files = this.listFiles();
    if (files.length < 2) return null;
    return this.readFile(files.at(-2)!);
  }

  private listFiles(): string[] {
    if (!fs.existsSync(this.historyDir)) return [];
    return fs.readdirSync(this.historyDir)
      .filter(f => f.endsWith('.json'))
      .sort();
  }

  private readFile(fileName: string): CoverageMatrix | null {
    try {
      const content = fs.readFileSync(
        path.join(this.historyDir, fileName),
        'utf-8',
      );
      return JSON.parse(content) as CoverageMatrix;
    } catch {
      return null;
    }
  }

  private rotate(): void {
    const files = this.listFiles();
    if (files.length <= this.maxEntries) return;
    const toRemove = files.slice(0, files.length - this.maxEntries);
    for (const f of toRemove) {
      fs.unlinkSync(path.join(this.historyDir, f));
    }
  }
}
