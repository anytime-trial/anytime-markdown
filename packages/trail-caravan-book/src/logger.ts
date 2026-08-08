export interface MemoryLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
  warn?(message: string): void;
}

export const noopLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
};
