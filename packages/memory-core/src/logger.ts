export interface MemoryLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export const noopLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};
