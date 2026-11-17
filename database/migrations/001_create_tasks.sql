-- 001: core schema for the task board.
-- gen_random_uuid() is built into PostgreSQL 13+, no extension required.

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200) NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'TODO'
              CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
