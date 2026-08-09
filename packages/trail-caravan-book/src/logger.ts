export interface CaravanLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
  warn?(message: string): void;
}

export const noopLogger: CaravanLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
};
