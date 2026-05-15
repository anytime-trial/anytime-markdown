import * as path from 'node:path';

export function getTraceDir(): string {
  return process.env['TRACE_OUTPUT_DIR'] ?? path.join(process.cwd(), '.anytime', 'trace');
}
