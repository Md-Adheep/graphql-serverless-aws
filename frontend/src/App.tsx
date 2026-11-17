import { useCallback, useEffect, useReducer, useState } from 'react';
import { config, isConfigured } from './config';
import { gql } from './api/client';
import { AppSyncRealtimeClient, type ConnectionState } from './api/realtime';
import * as ops from './api/operations';
import { tasksReducer } from './state/tasks';
import { TaskForm } from './components/TaskForm';
import { TaskBoard } from './components/TaskBoard';
import type { Task, TaskStatus } from './types';

export default function App() {
  const [tasks, dispatch] = useReducer(tasksReducer, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<ConnectionState>('connecting');

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Initial load (Query -> queries Lambda -> RDS Proxy -> RDS)
  useEffect(() => {
    if (!isConfigured) return;
    run(async () => {
      const data = await gql<{ tasks: Task[] }>(ops.LIST_TASKS);
      dispatch({ type: 'loaded', tasks: data.tasks });
    }).finally(() => setLoading(false));
  }, [run]);

  // Real-time updates (Subscription over AppSync WebSockets)
  useEffect(() => {
    if (!isConfigured) return;
    const client = new AppSyncRealtimeClient(config.graphqlUrl, config.realtimeUrl, config.apiKey, setLive);
    client.connect();
    const unsubs = [
      client.subscribe(ops.ON_TASK_CREATED, (d: any) => d?.onTaskCreated && dispatch({ type: 'upsert', task: d.onTaskCreated })),
      client.subscribe(ops.ON_TASK_UPDATED, (d: any) => d?.onTaskUpdated && dispatch({ type: 'upsert', task: d.onTaskUpdated })),
      client.subscribe(ops.ON_TASK_DELETED, (d: any) => d?.onTaskDeleted && dispatch({ type: 'remove', id: d.onTaskDeleted.id })),
    ];
    return () => {
      unsubs.forEach((u) => u());
      client.close();
    };
  }, []);

  // Mutations (Mutation -> mutations Lambda -> private GraphQL server on Fargate -> RDS)
  const create = (title: string, description: string) =>
    run(async () => {
      const d = await gql<{ createTask: Task }>(ops.CREATE_TASK, { input: { title, description: description || null } });
      dispatch({ type: 'upsert', task: d.createTask });
    });

  const move = (id: string, status: TaskStatus) =>
    run(async () => {
      const d = await gql<{ updateTask: Task }>(ops.UPDATE_TASK, { id, input: { status } });
      dispatch({ type: 'upsert', task: d.updateTask });
    });

  const remove = (id: string) =>
    run(async () => {
      await gql(ops.DELETE_TASK, { id });
      dispatch({ type: 'remove', id });
    });

  if (!isConfigured) {
    return (
      <main className="container">
        <h1>Task Board</h1>
        <p className="error">
          Missing AppSync configuration. Copy <code>.env.example</code> to <code>.env.local</code> and fill in the values.
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Task Board</h1>
        <span className={`live live-${live}`} title="Real-time subscription status">
          {live === 'connected' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Offline'}
        </span>
      </header>
      <p className="subtitle">React · AppSync GraphQL · Lambda · ECS Fargate · RDS PostgreSQL</p>

      <TaskForm onCreate={create} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? <p>Loading…</p> : <TaskBoard tasks={tasks} onMove={move} onDelete={remove} />}
    </main>
  );
}
