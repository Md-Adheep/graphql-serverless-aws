import { STATUSES, type Task, type TaskStatus } from '../types';

interface Props {
  tasks: Task[];
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}

export function TaskBoard({ tasks, onMove, onDelete }: Props) {
  return (
    <div className="board">
      {STATUSES.map((col) => {
        const items = tasks.filter((t) => t.status === col.value);
        return (
          <section key={col.value} className="column" aria-label={col.label}>
            <h2>
              {col.label} <span className="count">{items.length}</span>
            </h2>
            {items.length === 0 && <p className="empty">Nothing here</p>}
            {items.map((task) => (
              <article key={task.id} className="card">
                <h3>{task.title}</h3>
                {task.description && <p>{task.description}</p>}
                <div className="card-actions">
                  <select
                    aria-label={`Status of ${task.title}`}
                    value={task.status}
                    onChange={(e) => onMove(task.id, e.target.value as TaskStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button className="link danger" onClick={() => onDelete(task.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
