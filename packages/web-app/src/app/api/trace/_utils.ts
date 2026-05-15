import * as path from 'node:path';

export function getTraceDir(): string {
  if (process.env['TRACE_OUTPUT_DIR']) return process.env['TRACE_OUTPUT_DIR'];
  const trailHome = process.env['TRAIL_HOME'] ?? path.join(process.cwd(), '.anytime', 'trail');
  return path.join(trailHome, 'trace');
}
