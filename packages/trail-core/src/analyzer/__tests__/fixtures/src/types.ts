export interface Runnable {
  run(): void;
}

export type AppConfig = {
  name: string;
  debug: boolean;
};

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export const DEFAULT_CONFIG: AppConfig = {
  name: 'app',
  debug: false,
};
