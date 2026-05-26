import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeAnalysis } from './computeAnalysis';
import type { AnalyzeChildMessage, AnalyzeHostMessage } from './analyzeChildProtocol';

function send(msg: AnalyzeChildMessage): void {
  process.send?.(msg);
}

process.on('message', (raw: AnalyzeHostMessage) => {
  if (raw?.type !== 'analyze') return;
  void run(raw);
});

async function run(msg: Extract<AnalyzeHostMessage, { type: 'analyze' }>): Promise<void> {
  try {
    const result = await computeAnalysis(msg.request, (phase, percent) =>
      send({ type: 'progress', phase, percent }),
    );
    // os.tmpdir() に予測可能名 (pid + 時刻) で直接書くと symlink/race の対象になる
    // (js/insecure-temporary-file)。mkdtempSync でランダムサフィックス付きの private dir
    // (mode 0700) を作り、その中に結果を書く。dir は host (AnalyzeChildRunner) が読了後に削除する。
    const resultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-result-'));
    const resultPath = path.join(resultDir, 'result.json');
    fs.writeFileSync(resultPath, JSON.stringify(result));
    send({ type: 'result', resultPath });
    process.exit(0);
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}
