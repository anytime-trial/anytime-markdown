import { greet } from './utils';
import type { Runnable, AppConfig } from './types';
import { LogLevel } from './types';

export class BaseApp {
  log(level: LogLevel): void {
    // noop
  }
}

export class App extends BaseApp implements Runnable {
  private config: AppConfig | undefined;

  override log(level: LogLevel): void {
    greet(String(level));
  }

  run(): void {
    greet('world');
  }
}
