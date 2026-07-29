import {
  serializeTicket,
  TICKET_ASSIGNEES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  type CreateTicketInput,
  type FrontmatterValue,
  type TicketAssignee,
  type TicketFrontmatter,
  type TicketPriority,
  type TicketProvider,
  type TicketStatus,
  type TicketWorkspace,
} from '@anytime-markdown/tickets-core';

import type { Logger } from './logger';

export const TICKETS_RPC_METHODS = ['list', 'save', 'create', 'remove', 'archive'] as const;
export type TicketsRpcMethod = (typeof TICKETS_RPC_METHODS)[number];

export interface TicketsRpcRequest {
  type: 'rpc';
  id: string;
  method: TicketsRpcMethod;
  /** webview からの信頼できない入力。各メソッドの dispatch 内でバリデーションしてから使う */
  params: unknown;
}

export interface TicketsRpcError {
  message: string;
  status: number;
  conflict: boolean;
  validationErrors: string[];
}

export interface TicketsRpcResponse {
  type: 'rpcResult';
  id: string;
  result?: unknown;
  error?: TicketsRpcError;
}

// ---------------------------------------------------------------------------
// バリデーション基盤
// ---------------------------------------------------------------------------

type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * params のバリデーション失敗を表す。webview からの不正な形の RPC 要求は
 * TicketProvider の異常（409 等）とは異なる性質のため、専用クラスで判別できるようにする。
 */
class RpcValidationError extends Error {
  readonly status = 400;
  readonly validationErrors: string[];

  constructor(errors: string[]) {
    super(`RPC パラメータが不正です: ${errors.join(', ')}`);
    this.name = 'RpcValidationError';
    this.validationErrors = errors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

function isFrontmatterValue(value: unknown): value is FrontmatterValue {
  return typeof value === 'string' || typeof value === 'number' || isStringArray(value);
}

function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

function isTicketPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

function isTicketAssignee(value: unknown): value is TicketAssignee {
  return typeof value === 'string' && (TICKET_ASSIGNEES as readonly string[]).includes(value);
}

function isTicketWorkspace(value: unknown): value is TicketWorkspace {
  return typeof value === 'string' && (TICKET_WORKSPACES as readonly string[]).includes(value);
}

function readRequiredString(source: Record<string, unknown>, key: string, errors: string[]): string | undefined {
  const value = source[key];
  if (typeof value === 'string') {
    return value;
  }
  errors.push(`${key} は string である必要があります`);
  return undefined;
}

function readOptionalString(source: Record<string, unknown>, key: string, errors: string[]): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  errors.push(`${key} は string である必要があります`);
  return undefined;
}

function readOptionalNumber(source: Record<string, unknown>, key: string, errors: string[]): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  errors.push(`${key} は number である必要があります`);
  return undefined;
}

function readOptionalStringArray(source: Record<string, unknown>, key: string, errors: string[]): string[] | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (isStringArray(value)) {
    return value;
  }
  errors.push(`${key} は string[] である必要があります`);
  return undefined;
}

function readOptionalAssignee(source: Record<string, unknown>, errors: string[]): TicketAssignee | undefined {
  const value = source.assignee;
  if (value === undefined) {
    return undefined;
  }
  if (isTicketAssignee(value)) {
    return value;
  }
  errors.push('assignee は不正な値です');
  return undefined;
}

function readOptionalWorkspace(source: Record<string, unknown>, errors: string[]): TicketWorkspace | undefined {
  const value = source.workspace;
  if (value === undefined) {
    return undefined;
  }
  if (isTicketWorkspace(value)) {
    return value;
  }
  errors.push('workspace は不正な値です');
  return undefined;
}

function readTicketStatus(source: Record<string, unknown>, errors: string[]): TicketStatus | undefined {
  if (isTicketStatus(source.status)) {
    return source.status;
  }
  errors.push('status は不正な値です');
  return undefined;
}

function readTicketPriority(source: Record<string, unknown>, errors: string[]): TicketPriority | undefined {
  if (isTicketPriority(source.priority)) {
    return source.priority;
  }
  errors.push('priority は不正な値です');
  return undefined;
}

function readExtras(source: Record<string, unknown>, errors: string[]): Record<string, FrontmatterValue> {
  const raw = source.extras;
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    errors.push('extras はオブジェクトである必要があります');
    return {};
  }
  const result: Record<string, FrontmatterValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isFrontmatterValue(value)) {
      result[key] = value;
    } else {
      errors.push(`extras.${key} の型が不正です`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// メソッド別 params バリデーション
// ---------------------------------------------------------------------------

interface ListParams {
  includeArchive: boolean;
}

function validateListParams(params: unknown): ValidationResult<ListParams> {
  if (params === undefined || params === null) {
    return { ok: true, value: { includeArchive: false } };
  }
  if (!isRecord(params)) {
    return { ok: false, errors: ['params はオブジェクトである必要があります'] };
  }
  const errors: string[] = [];
  const includeArchive = params.includeArchive;
  if (includeArchive !== undefined && typeof includeArchive !== 'boolean') {
    errors.push('includeArchive は boolean である必要があります');
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { includeArchive: includeArchive === true } };
}

function validateFrontmatter(value: unknown, errors: string[]): TicketFrontmatter | undefined {
  if (!isRecord(value)) {
    errors.push('frontmatter はオブジェクトである必要があります');
    return undefined;
  }
  const id = readRequiredString(value, 'id', errors);
  const title = readRequiredString(value, 'title', errors);
  const status = readTicketStatus(value, errors);
  const priority = readTicketPriority(value, errors);
  const createdAt = readRequiredString(value, 'created_at', errors);
  const updatedAt = readRequiredString(value, 'updated_at', errors);
  const assignee = readOptionalAssignee(value, errors);
  const workspace = readOptionalWorkspace(value, errors);
  const creator = readOptionalString(value, 'creator', errors);
  const dependencies = readOptionalStringArray(value, 'dependencies', errors);
  const estimate = readOptionalNumber(value, 'estimate', errors);
  const actual = readOptionalNumber(value, 'actual', errors);
  const aiConfidence = readOptionalNumber(value, 'ai_confidence', errors);

  if (id === undefined || title === undefined || status === undefined || priority === undefined) {
    return undefined;
  }
  if (createdAt === undefined || updatedAt === undefined) {
    return undefined;
  }

  return {
    id,
    title,
    status,
    priority,
    assignee,
    workspace,
    creator,
    created_at: createdAt,
    updated_at: updatedAt,
    dependencies,
    estimate,
    actual,
    ai_confidence: aiConfidence,
  };
}

interface SaveParams {
  path: string;
  version: string;
  frontmatter: TicketFrontmatter;
  extras: Record<string, FrontmatterValue>;
  body: string;
  message?: string;
}

function validateSaveParams(params: unknown): ValidationResult<SaveParams> {
  if (!isRecord(params)) {
    return { ok: false, errors: ['params はオブジェクトである必要があります'] };
  }
  const errors: string[] = [];
  const path = readRequiredString(params, 'path', errors);
  const version = readRequiredString(params, 'version', errors);
  const body = readRequiredString(params, 'body', errors);
  const message = readOptionalString(params, 'message', errors);
  const frontmatter = validateFrontmatter(params.frontmatter, errors);
  const extras = readExtras(params, errors);

  if (path === undefined || version === undefined || body === undefined || frontmatter === undefined || errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { path, version, frontmatter, extras, body, message } };
}

function validateCreateParams(params: unknown): ValidationResult<CreateTicketInput> {
  if (!isRecord(params)) {
    return { ok: false, errors: ['params はオブジェクトである必要があります'] };
  }
  const errors: string[] = [];
  const title = readRequiredString(params, 'title', errors);
  const status = readTicketStatus(params, errors);
  const priority = readTicketPriority(params, errors);
  const now = readRequiredString(params, 'now', errors);
  const assignee = readOptionalAssignee(params, errors);
  const workspace = readOptionalWorkspace(params, errors);
  const creator = readOptionalString(params, 'creator', errors);
  const dependencies = readOptionalStringArray(params, 'dependencies', errors);
  const estimate = readOptionalNumber(params, 'estimate', errors);
  const description = readOptionalString(params, 'description', errors);
  const message = readOptionalString(params, 'message', errors);

  if (title === undefined || status === undefined || priority === undefined || now === undefined || errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { title, status, priority, now, assignee, workspace, creator, dependencies, estimate, description, message },
  };
}

interface PathVersionParams {
  path: string;
  version: string;
  message?: string;
}

function validatePathVersionParams(params: unknown): ValidationResult<PathVersionParams> {
  if (!isRecord(params)) {
    return { ok: false, errors: ['params はオブジェクトである必要があります'] };
  }
  const errors: string[] = [];
  const path = readRequiredString(params, 'path', errors);
  const version = readRequiredString(params, 'version', errors);
  const message = readOptionalString(params, 'message', errors);
  if (path === undefined || version === undefined || errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { path, version, message } };
}

// ---------------------------------------------------------------------------
// dispatch / エラー写像
// ---------------------------------------------------------------------------

async function dispatch(provider: TicketProvider, request: TicketsRpcRequest): Promise<unknown> {
  switch (request.method) {
    case 'list': {
      const parsed = validateListParams(request.params);
      if (!parsed.ok) {
        throw new RpcValidationError(parsed.errors);
      }
      return provider.list({ includeArchive: parsed.value.includeArchive });
    }
    case 'save': {
      const parsed = validateSaveParams(request.params);
      if (!parsed.ok) {
        throw new RpcValidationError(parsed.errors);
      }
      const { path, version, frontmatter, extras, body, message } = parsed.value;
      // 引数順は serializeTicket(frontmatter, body, extras) — packages/tickets-core/src/ticketModel.ts で実物確認済み。
      const content = serializeTicket(frontmatter, body, extras);
      const updated = await provider.update({
        path,
        content,
        version,
        message: message ?? `ticket: update ${path}`,
      });
      return { version: updated.version, updated_at: new Date().toISOString() };
    }
    case 'create': {
      const parsed = validateCreateParams(request.params);
      if (!parsed.ok) {
        throw new RpcValidationError(parsed.errors);
      }
      return provider.create(parsed.value);
    }
    case 'remove': {
      const parsed = validatePathVersionParams(request.params);
      if (!parsed.ok) {
        throw new RpcValidationError(parsed.errors);
      }
      await provider.remove(parsed.value);
      return null;
    }
    case 'archive': {
      const parsed = validatePathVersionParams(request.params);
      if (!parsed.ok) {
        throw new RpcValidationError(parsed.errors);
      }
      return provider.archive(parsed.value);
    }
    default: {
      const exhaustive: never = request.method;
      throw new Error(`未知の RPC メソッドです: ${String(exhaustive)}`);
    }
  }
}

function isObjectWithStatus(value: unknown): value is { status: unknown } {
  return typeof value === 'object' && value !== null && 'status' in value;
}

function isObjectWithValidationErrors(value: unknown): value is { validationErrors: unknown } {
  return typeof value === 'object' && value !== null && 'validationErrors' in value;
}

function statusOf(error: unknown): number {
  if (isObjectWithStatus(error) && typeof error.status === 'number') {
    return error.status;
  }
  return 0;
}

function validationErrorsOf(error: unknown): string[] {
  if (isObjectWithValidationErrors(error) && isStringArray(error.validationErrors)) {
    return error.validationErrors;
  }
  return [];
}

function toRpcError(error: unknown): TicketsRpcError {
  const status = statusOf(error);
  return {
    message: error instanceof Error ? error.message : String(error),
    status,
    conflict: status === 409,
    validationErrors: validationErrorsOf(error),
  };
}

/**
 * webview からの RPC を TicketProvider へ委譲する。
 * エラーは握り潰さず、ログへ残したうえで webview 側の TicketsClientError へ写像できる形で返す。
 * GitHub アクセストークンは呼び出し元（拡張ホスト）に閉じており、本関数は一切トークンを扱わない。
 */
export async function handleTicketsRpc(input: {
  provider: TicketProvider;
  logger: Logger;
  request: TicketsRpcRequest;
}): Promise<TicketsRpcResponse> {
  const { provider, logger, request } = input;
  try {
    const result = await dispatch(provider, request);
    return { type: 'rpcResult', id: request.id, result };
  } catch (error) {
    if (error instanceof RpcValidationError) {
      // webview 側の入力不備であり TicketProvider の異常ではないため warn に留める（error は provider/実行時異常専用）。
      logger.warn(`RPC ${request.method} のパラメータ検証に失敗しました (id=${request.id}): ${error.validationErrors.join(', ')}`);
    } else {
      logger.error(`RPC ${request.method} が失敗しました (id=${request.id})`, error);
    }
    return { type: 'rpcResult', id: request.id, error: toRpcError(error) };
  }
}
