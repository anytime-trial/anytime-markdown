import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeAnalysis } from './computeAnalysis';
import type { AnalyzeChildMessage, AnalyzeHostMessage } from './analyzeChildProtocol';

function send(msg: AnalyzeChildMessage): void {
  process.send?.(msg);
}

function writeResultAndExit(result: unknown): void {
  // os.tmpdir() に予測可能名で直接書くと symlink/race の対象になる (js/insecure-temporary-file)。
  // mkdtempSync でランダムサフィックス付きの private dir を作りその中に書く。host が読了後に削除する。
  const resultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-result-'));
  const resultPath = path.join(resultDir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result));
  send({ type: 'result', resultPath });
  process.exit(0);
}

process.on('message', (raw: AnalyzeHostMessage) => {
  if (raw?.type === 'analyze') void run(raw);
  else if (raw?.type === 'c4SourceAnalyze') void runC4SourceAnalyze(raw);
});

async function runC4SourceAnalyze(
  msg: Extract<AnalyzeHostMessage, { type: 'c4SourceAnalyze' }>,
): Promise<void> {
  try {
    // typescript を引く c4SourceAnalyze は dynamic import で analyze-child のみに閉じ込める。
    const { c4SourceAnalyze } = await import('./c4SourceAnalyze.js');
    writeResultAndExit(c4SourceAnalyze(msg.request));
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

async function run(msg: Extract<AnalyzeHostMessage, { type: 'analyze' }>): Promise<void> {
  try {
    const result = await computeAnalysis(msg.request, (phase, percent) =>
      send({ type: 'progress', phase, percent }),
    );
    writeResultAndExit(result);
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}
