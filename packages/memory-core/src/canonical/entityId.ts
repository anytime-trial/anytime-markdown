import { createHash } from 'crypto';

/**
 * Generates a stable 16-character hex ID from an entity type and canonical name.
 * Uses SHA-1 of "type:canonicalName", sliced to the first 16 hex chars.
 */
export function entityId(type: string, canonicalName: string): string {
  return createHash('sha1')
    .update(`${type}:${canonicalName}`)
    .digest('hex')
    .slice(0, 16);
}
