import * as fs from 'node:fs';
import * as path from 'node:path';
import { TrailLogger } from '../utils/TrailLogger';

const DEBOUNCE_MS = 500;

export class CoverageWatcher {
  private watcher: fs.FSWatcher | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onFileChanged: (filePath: string) => void,
    private readonly logger: typeof TrailLogger,
  ) {}

  start(filePath: string): void {
    this.stop();
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    if (!fs.existsSync(dir)) {
      this.logger.info(`CoverageWatcher: directory not found: ${dir}`);
      return;
    }

    // 起動時にファイルが既に存在する場合は即座に読み込む
    if (fs.existsSync(filePath)) {
      this.debounce(filePath);
    }

    try {
      this.watcher = fs.watch(dir, { persistent: false }, (_eventType, filename) => {
        if (filename === basename) {
          this.debounce(filePath);
        }
      });

      this.watcher.on('error', (err) => {
        this.logger.warn(`CoverageWatcher error: ${err.message}`);
      });

      this.logger.info(`CoverageWatcher: watching ${dir} for ${basename}`);
    } catch {
      this.logger.warn(`CoverageWatcher: cannot watch ${dir}, will retry on config change`);
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  private debounce(filePath: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      if (fs.existsSync(filePath)) {
        this.onFileChanged(filePath);
      }
    }, DEBOUNCE_MS);
  }
}
