// Pattern 1: static type-only import
import type { LogLevel } from './types';

// Pattern 3: re-export
export { greet } from './utils';
export type { Runnable } from './types';

// Pattern 2: dynamic import
async function loadUtils() {
  const utils = await import('./utils');
  return utils;
}

// Pattern 6: type-position import
type GreetFn = typeof import('./utils').greet;

// Use type to avoid unused warning
const level: LogLevel = 1 as LogLevel;
export { loadUtils, level };
export type { GreetFn };
