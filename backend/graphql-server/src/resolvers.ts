import { GraphQLError } from 'graphql';
import type { CreateTaskInput, TaskRepository, TaskStatus, UpdateTaskInput } from './repository.js';
import { assertUuid, clampLimit, validateCreate, validateUpdate } from './validation.js';
import { logger } from './logger.js';

export interface Context {
  repo: TaskRepository;
  requestId: string;
}

export const resolvers = {
  Query: {
    tasks: (_: unknown, args: { status?: TaskStatus | null; limit?: number | null }, ctx: Context) =>
      ctx.repo.list(args.status, clampLimit(args.limit)),

    task: (_: unknown, args: { id: string }, ctx: Context) => {
      assertUuid(args.id);
      return ctx.repo.get(args.id);
    },
  },

  Mutation: {
    createTask: async (_: unknown, args: { input: CreateTaskInput }, ctx: Context) => {
      const task = await ctx.repo.create(validateCreate(args.input));
      logger.info('task created', { requestId: ctx.requestId, taskId: task.id });
      return task;
    },

    updateTask: async (_: unknown, args: { id: string; input: UpdateTaskInput }, ctx: Context) => {
      assertUuid(args.id);
      const task = await ctx.repo.update(args.id, validateUpdate(args.input));
      if (!task) throw new GraphQLError(`Task ${args.id} not found`, { extensions: { code: 'NOT_FOUND' } });
      logger.info('task updated', { requestId: ctx.requestId, taskId: task.id });
      return task;
    },

    deleteTask: async (_: unknown, args: { id: string }, ctx: Context) => {
      assertUuid(args.id);
      const task = await ctx.repo.delete(args.id);
      if (task) logger.info('task deleted', { requestId: ctx.requestId, taskId: task.id });
      return task;
    },
  },
};
