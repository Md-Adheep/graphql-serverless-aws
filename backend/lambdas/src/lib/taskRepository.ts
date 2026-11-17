import type pg from 'pg';
import type { TaskStatus } from './validation';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, title, description, status, created_at, updated_at';

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/** Read-only queries used by the `queries` Lambda (read path goes straight to RDS via the proxy). */
export async function listTasks(pool: pg.Pool, status: TaskStatus | null | undefined, limit: number): Promise<Task[]> {
  const { rows } = await pool.query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [status ?? null, limit],
  );
  return rows.map(toTask);
}

export async function getTask(pool: pg.Pool, id: string): Promise<Task | null> {
  const { rows } = await pool.query<TaskRow>(`SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
  return rows[0] ? toTask(rows[0]) : null;
}
