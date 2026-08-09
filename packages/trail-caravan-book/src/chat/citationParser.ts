import type { ChatChunk } from './types';

const CITATION_RE = /\[\^(entity|episode|drift):([a-zA-Z0-9_-]+)\]/g;

export class CitationStreamParser {
  private buffer = '';

  feed(delta: string, emit: (chunk: ChatChunk) => void): void {
    this.buffer += delta;
    let lastEmitted = 0;
    CITATION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CITATION_RE.exec(this.buffer)) !== null) {
      const before = this.buffer.slice(lastEmitted, match.index);
      if (before) emit({ type: 'token', payload: { delta: before } });
      emit({
        type: 'citation',
        payload: { tag: `${match[1]}:${match[2]}`, sourceId: match[2] },
      });
      lastEmitted = match.index + match[0].length;
    }
    const tail = this.buffer.slice(lastEmitted);
    // `[^` で始まり閉じカッコがまだ来ていない場合は次回まで保留する
    const openPos = tail.lastIndexOf('[^');
    if (openPos >= 0 && !tail.slice(openPos).includes(']')) {
      const safe = tail.slice(0, openPos);
      if (safe) emit({ type: 'token', payload: { delta: safe } });
      this.buffer = tail.slice(openPos);
    } else {
      if (tail) emit({ type: 'token', payload: { delta: tail } });
      this.buffer = '';
    }
  }

  flush(emit: (chunk: ChatChunk) => void): void {
    if (this.buffer) {
      emit({ type: 'token', payload: { delta: this.buffer } });
      this.buffer = '';
    }
  }
}
