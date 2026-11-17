import type pg from 'pg';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus | null;
}

export interface UpdateTaskInput {
  title?: string | null;
  description?: string | null;
  status?: TaskStatus | null;
}

export interface TaskRepository {
  list(status?: TaskStatus | null, limit?: number): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  create(input: CreateTaskInput): Promise<Task>;
  update(id: string, input: UpdateTaskInput): Promise<Task | null>;
  delete(id: string): Promise<Task | null>;
  ping(): Promise<void>;
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

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** All SQL is parameterised - user input never gets concatenated into a query string. */
export class PgTaskRepository implements TaskRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(status?: TaskStatus | null, limit = 100): Promise<Task[]> {
    const { rows } = await this.pool.query<TaskRow>(
      `SELECT ${COLUMNS} FROM tasks
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY created_at DESC
        LIMIT $2`,
      [status ?? null, limit],
    );
    return rows.map(toTask);
  }

  async get(id: string): Promise<Task | null> {
    const { rows } = await this.pool.query<TaskRow>(`SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
    return rows[0] ? toTask(rows[0]) : null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const { rows } = await this.pool.query<TaskRow>(
      `INSERT INTO tasks (title, description, status)
       VALUES ($1, $2, COALESCE($3, 'TODO'))
       RETURNING ${COLUMNS}`,
      [input.title, input.description ?? null, input.status ?? null],
    );
    return toTask(rows[0]);
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const { rows } = await this.pool.query<TaskRow>(
      `UPDATE tasks
          SET title       = COALESCE($2, title),
              description = COALESCE($3, description),
              status      = COALESCE($4, status),
              updated_at  = now()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [id, input.title ?? null, input.description ?? null, input.status ?? null],
    );
    return rows[0] ? toTask(rows[0]) : null;
  }

  async delete(id: string): Promise<Task | null> {
    const { rows } = await this.pool.query<TaskRow>(`DELETE FROM tasks WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
    return rows[0] ? toTask(rows[0]) : null;
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
