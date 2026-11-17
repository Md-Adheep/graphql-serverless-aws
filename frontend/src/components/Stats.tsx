import type { Task } from '../types';
import { IconCheck, IconCircle, IconLayers, IconProgress } from './icons';

const R = 26;
const CIRC = 2 * Math.PI * R;

export function Stats({ tasks }: { tasks: Task[] }) {
  const todo = tasks.filter((t) => t.status === 'TODO').length;
  const doing = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const done = tasks.filter((t) => t.status === 'DONE').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const cards = [
    { key: 'total', label: 'Total tasks', value: tasks.length, Icon: IconLayers },
    { key: 'todo', label: 'To do', value: todo, Icon: IconCircle },
    { key: 'doing', label: 'In progress', value: doing, Icon: IconProgress },
    { key: 'done', label: 'Completed', value: done, Icon: IconCheck },
  ];

  return (
    <section className="stats" aria-label="Summary">
      {cards.map(({ key, label, value, Icon }) => (
        <div key={key} className={`stat stat-${key}`}>
          <span className="stat-icon">
            <Icon />
          </span>
          <div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        </div>
      ))}

      <div className="stat stat-ring">
        {/* SVG attributes (not inline CSS) so the strict Content-Security-Policy is respected */}
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <defs>
            <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#22c55e" />
              <stop offset="1" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r={R} className="ring-track" strokeWidth="7" fill="none" />
          <circle
            cx="32"
            cy="32"
            r={R}
            stroke="url(#ring-g)"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * CIRC} ${CIRC}`}
            transform="rotate(-90 32 32)"
          />
          <text x="32" y="37" textAnchor="middle" className="ring-text">
            {pct}%
          </text>
        </svg>
        <div className="stat-label">Completion</div>
      </div>
    </section>
  );
}
