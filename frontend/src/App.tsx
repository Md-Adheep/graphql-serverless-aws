import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { config, isConfigured } from './config';
import { gql } from './api/client';
import { AppSyncRealtimeClient, type ConnectionState } from './api/realtime';
import * as ops from './api/operations';
import { tasksReducer } from './state/tasks';
import { Header } from './components/Header';
import { Stats } from './components/Stats';
import { TaskForm } from './components/TaskForm';
import { TaskBoard } from './components/TaskBoard';
import { ActivityFeed, type Activity } from './components/ActivityFeed';
import { STATUSES, type Task, type TaskStatus } from './types';

const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;
const STACK = ['CloudFront', 'AppSync', 'Lambda', 'ECS Fargate', 'RDS PostgreSQL'];

export default function App() {
  const [tasks, dispatch] = useReducer(tasksReducer, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<ConnectionState>('connecting');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const timers = useRef<number[]>([]);

  // Re-render relative timestamps ("2m ago") every 30 seconds.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /** Highlight a card briefly and log the event in the activity feed. */
  const recordEvent = useCallback((kind: Activity['kind'], task: Task, detail?: string) => {
    setActivity((a) => [{ id: crypto.randomUUID(), kind, title: task.title, detail, at: new Date().toISOString() }, ...a].slice(0, 15));
    if (kind !== 'deleted') {
      setFlashing((s) => new Set(s).add(task.id));
      timers.current.push(
        window.setTimeout(() => {
          setFlashing((s) => {
            const n = new Set(s);
            n.delete(task.id);
            return n;
          });
        }, 1600),
      );
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
      client.subscribe(ops.ON_TASK_CREATED, (d: any) => {
        const t: Task | undefined = d?.onTaskCreated;
        if (!t) return;
        dispatch({ type: 'upsert', task: t });
        recordEvent('created', t);
      }),
      client.subscribe(ops.ON_TASK_UPDATED, (d: any) => {
        const t: Task | undefined = d?.onTaskUpdated;
        if (!t) return;
        dispatch({ type: 'upsert', task: t });
        recordEvent('updated', t, statusLabel(t.status));
      }),
      client.subscribe(ops.ON_TASK_DELETED, (d: any) => {
        const t: Task | undefined = d?.onTaskDeleted;
        if (!t) return;
        dispatch({ type: 'remove', id: t.id });
        recordEvent('deleted', t);
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      client.close();
    };
  }, [recordEvent]);

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
      <>
        <Header live="disconnected" />
        <main className="container">
          <div className="alert" role="alert">
            Missing AppSync configuration. Copy <code>.env.example</code> to <code>.env.local</code> and fill in the values.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header live={live} />
      <main className="container">
        <Stats tasks={tasks} />
        <TaskForm onCreate={create} />

        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button className="alert-close" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="layout">
          {loading ? (
            <div className="board">
              {[0, 1, 2].map((i) => (
                <div key={i} className="column skeleton" />
              ))}
            </div>
          ) : (
            <TaskBoard tasks={tasks} flashing={flashing} now={now} onMove={move} onDelete={remove} />
          )}
          <ActivityFeed items={activity} now={now} />
        </div>
      </main>

      <footer className="site-footer">
        <span>Powered by</span>
        {STACK.map((s) => (
          <span key={s} className="chip">
            {s}
          </span>
        ))}
      </footer>
    </>
  );
}
