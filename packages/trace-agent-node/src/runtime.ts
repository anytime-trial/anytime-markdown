import { globalRecorder } from './globalRecorder';
import { safeSerialize } from './serializer';
import type { JsonValue } from '@anytime-markdown/trace-core/types';

const lifelineMap = new Map<string, string>();
let lifelineCounter = 0;

export function __traceEnter(
    file: string, fn: string, args: unknown[], _depth: number, line: number
): number {
    // line が 0 のときは AST から位置が取れなかったケース。0 行目という嘘の位置を
    // 記録すると viewer が存在しない行へジャンプするため、loc ごと落とす。
    const loc = line > 0 ? { file, line } : undefined;
    return globalRecorder.enter(
        fileToLifelineId(file),
        null,
        fn,
        args.map(a => safeSerialize(a) as unknown),
        _depth,
        loc
    );
}

export function __traceExit(id: number, result: unknown): void {
    globalRecorder.exit(id, safeSerialize(result) as JsonValue);
}

export function __traceThrow(id: number, err: unknown): void {
    globalRecorder.throw(id, err);
}

export function fileToLifelineId(file: string): string {
    let id = lifelineMap.get(file);
    if (id === undefined) {
        id = `L${lifelineCounter++}`;
        lifelineMap.set(file, id);
    }
    return id;
}

export function getLifelineMap(): Map<string, string> {
    return lifelineMap;
}

export function resetLifelineMap(): void {
    lifelineMap.clear();
    lifelineCounter = 0;
}
