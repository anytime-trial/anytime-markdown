import * as fs from 'node:fs/promises';
import type { TraceFile } from '../types';

const REQUIRED_METADATA_FIELDS = ['startedAt', 'endedAt', 'command', 'cwd', 'nodeVersion', 'depthLimit'] as const;

export async function loadTraceFile(filePath: string): Promise<TraceFile> {
    const text = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(text);
    if (data.version !== 1) {
        throw new Error(`Unsupported trace version: ${data.version}`);
    }
    if (!data.metadata || typeof data.metadata !== 'object') {
        throw new Error('Missing metadata');
    }
    for (const k of REQUIRED_METADATA_FIELDS) {
        if (!(k in data.metadata)) {
            throw new Error(`Missing metadata.${k}`);
        }
    }
    if (!Array.isArray(data.lifelines)) {
        throw new TypeError('lifelines must be array');
    }
    if (!Array.isArray(data.events)) {
        throw new TypeError('events must be array');
    }
    return data as TraceFile;
}
