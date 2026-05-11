import { execFile, type ExecFileOptions } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface GitExecOptions extends Omit<ExecFileOptions, 'encoding'> {
  /** stdout/stderr のエンコーディング。既定 utf-8 */
  encoding?: BufferEncoding;
  /** stdout の最大バイト数。既定 10MB (git log --graph --all 等を想定) */
  maxBuffer?: number;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export class GitExecError extends Error {
  override name = 'GitExecError';
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly cwd: string | undefined,
  ) {
    super(message);
  }
}

/** git child_process を非同期で実行する。失敗時は GitExecError を throw する。 */
export async function gitExec(
  args: readonly string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> {
  const { encoding = 'utf-8', maxBuffer = 10 * 1024 * 1024, ...rest } = options;
  try {
    const { stdout, stderr } = await execFileP('git', args as string[], {
      ...rest,
      encoding,
      maxBuffer,
    });
    return { stdout: String(stdout), stderr: String(stderr) };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stderr' in err) {
      const e = err as { code?: string | number | null; stdout?: string; stderr?: string; message: string };
      throw new GitExecError(
        e.message,
        typeof e.code === 'number' ? e.code : null,
        String(e.stdout ?? ''),
        String(e.stderr ?? ''),
        rest.cwd as string | undefined,
      );
    }
    throw err;
  }
}
