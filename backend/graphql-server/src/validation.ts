import { GraphQLError } from 'graphql';
import type { CreateTaskInput, UpdateTaskInput } from './repository.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 2000;

export function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

export function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) throw badInput('id must be a valid UUID');
}

export function clampLimit(limit?: number | null): number {
  if (limit == null) return 50;
  if (!Number.isInteger(limit) || limit < 1) throw badInput('limit must be a positive integer');
  return Math.min(limit, 100);
}

function cleanTitle(title: string): string {
  const t = title.trim();
  if (t.length === 0) throw badInput('title must not be empty');
  if (t.length > MAX_TITLE) throw badInput(`title must be at most ${MAX_TITLE} characters`);
  return t;
}

function cleanDescription(description?: string | null): string | null | undefined {
  if (description == null) return description;
  if (description.length > MAX_DESCRIPTION) throw badInput(`description must be at most ${MAX_DESCRIPTION} characters`);
  return description.trim();
}

export function validateCreate(input: CreateTaskInput): CreateTaskInput {
  return { ...input, title: cleanTitle(input.title), description: cleanDescription(input.description) };
}

export function validateUpdate(input: UpdateTaskInput): UpdateTaskInput {
  const out: UpdateTaskInput = { ...input, description: cleanDescription(input.description) };
  if (input.title != null) out.title = cleanTitle(input.title);
  if (out.title == null && out.description == null && out.status == null) {
    throw badInput('at least one of title, description or status is required');
  }
  return out;
}
