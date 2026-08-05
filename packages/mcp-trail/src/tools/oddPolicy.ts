import * as fs from 'node:fs';
import * as os from 'node:os';
import { z } from 'zod';
import {
  evaluateApprovalPolicy,
  OPERATION_KINDS,
  type ApprovalEvaluation,
  type OddResolution,
} from '@anytime-markdown/trail-core';
import { workspacePathParam } from './workspaceParam';
import { resolveWorkspacePath } from '../dbPath';
import { resolveOddConfig } from '../doctrine/oddRoots';

const OPERATION_KIND_VALUES = OPERATION_KINDS as unknown as [string, ...string[]];

export const GetOddPolicyInputSchema = z.object({
  workspacePath: workspacePathParam,
});

export const EvaluateApprovalPolicyInputSchema = z.object({
  operation_kind: z
    .enum(OPERATION_KIND_VALUES)
    .describe('Operation being evaluated. Everything except code_change is treated as always-human unless the registry says otherwise'),
  target_paths: z
    .array(z.string())
    .describe('Absolute paths the operation affects. Empty = ODD boundary undecidable, which resolves to confirm'),
  language: z
    .string()
    .optional()
    .describe('Language of the target. Omitted = no language check is applied'),
  is_god_node: z
    .boolean()
    .optional()
    .describe('Whether the target is a God Node (high centrality). Omitted = centrality data unavailable, which does NOT suppress allow (reported as impact_unknown)'),
  workspacePath: workspacePathParam,
});

export type GetOddPolicyInput = z.infer<typeof GetOddPolicyInputSchema>;
export type EvaluateApprovalPolicyInput = z.infer<typeof EvaluateApprovalPolicyInputSchema>;

function readTextFile(path: string): string | null {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    // 不在・権限エラーは「解決不能」として扱う (呼び出し側が既定値へ倒す)
    return null;
  }
}

function resolve(workspacePathArg: string | undefined): OddResolution {
  const workspacePath = resolveWorkspacePath(workspacePathArg).path;
  return resolveOddConfig({
    workspacePath: workspacePath ?? process.cwd(),
    homeDir: os.homedir(),
    readFile: readTextFile,
  });
}

export function handleGetOddPolicy(input: GetOddPolicyInput): OddResolution {
  return resolve(input.workspacePath);
}

export function handleEvaluateApprovalPolicy(
  input: EvaluateApprovalPolicyInput,
): ApprovalEvaluation {
  return evaluateApprovalPolicy(resolve(input.workspacePath), {
    operationKind: input.operation_kind as ApprovalRequestKind,
    targetPaths: input.target_paths,
    language: input.language ?? null,
    isGodNode: input.is_god_node ?? null,
  });
}

type ApprovalRequestKind = Parameters<typeof evaluateApprovalPolicy>[1]['operationKind'];
