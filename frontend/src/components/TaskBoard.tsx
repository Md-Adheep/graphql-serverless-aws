import { STATUSES, type Task, type TaskStatus } from '../types';
import { timeAgo } from '../utils/time';
import { IconArrowLeft, IconArrowRight, IconCheck, IconCircle, IconClock, IconProgress, IconTrash } from './icons';

interface Props {
  tasks: Task[];
  flashing: Set<string>;
  now: number;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}

const COLUMN = {
  TODO: { tone: 'todo', Icon: IconCircle, empty: 'No tasks yet. Add one above.' },
  IN_PROGRESS: { tone: 'doing', Icon: IconProgress, empty: 'Nothing in progress' },
  DONE: { tone: 'done', Icon: IconCheck, empty: 'Nothing completed yet' },
} as const;

export function TaskBoard({ tasks, flashing, now, onMove, onDelete }: Props) {
  return (
    <div className="board">
      {STATUSES.map((col, colIndex) => {
        const { tone, Icon, empty } = COLUMN[col.value];
        const items = tasks.filter((t) => t.status === col.value);
        const prev = STATUSES[colIndex - 1];
        const next = STATUSES[colIndex + 1];

        return (
          <section key={col.value} className={`column column-${tone}`} aria-label={col.label}>
            <header className="column-head">
              <span className="column-title">
                <Icon />
                {col.label}
              </span>
              <span className="badge">{items.length}</span>
            </header>

            <div className="column-body">
              {items.length === 0 && <p className="empty">{empty}</p>}

              {items.map((task) => (
                <article key={task.id} className={`card card-${tone}${flashing.has(task.id) ? ' flash' : ''}`}>
                  <h3>{task.title}</h3>
                  {task.description && <p>{task.description}</p>}

                  <footer className="card-foot">
                    <span className="time" title={new Date(task.updatedAt).toLocaleString()}>
                      <IconClock />
                      {timeAgo(task.updatedAt, now)}
                    </span>
                    <span className="actions">
                      {prev && (
                        <button
                          className="icon-btn"
                          title={`Move to ${prev.label}`}
                          aria-label={`Move "${task.title}" to ${prev.label}`}
                          onClick={() => onMove(task.id, prev.value)}
                        >
                          <IconArrowLeft />
                        </button>
                      )}
                      {next && (
                        <button
                          className={`icon-btn icon-btn-${tone}`}
                          title={`Move to ${next.label}`}
                          aria-label={`Move "${task.title}" to ${next.label}`}
                          onClick={() => onMove(task.id, next.value)}
                        >
                          <IconArrowRight />
                        </button>
                      )}
                      <button
                        className="icon-btn icon-btn-danger"
                        title="Delete"
                        aria-label={`Delete "${task.title}"`}
                        onClick={() => onDelete(task.id)}
                      >
                        <IconTrash />
                      </button>
                    </span>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
