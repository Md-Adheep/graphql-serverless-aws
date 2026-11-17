import { timeAgo } from '../utils/time';
import { IconBolt } from './icons';

export interface Activity {
  id: string;
  kind: 'created' | 'updated' | 'deleted';
  title: string;
  detail?: string;
  at: string;
}

const VERB = { created: 'Created', updated: 'Updated', deleted: 'Deleted' };

export function ActivityFeed({ items, now }: { items: Activity[]; now: number }) {
  return (
    <aside className="activity" aria-label="Live activity">
      <h2>
        <IconBolt />
        Live activity
      </h2>
      <p className="activity-hint">Real-time events pushed by AppSync subscriptions. Open this page in two windows to see it work.</p>
      {items.length === 0 ? (
        <p className="empty">Waiting for changes…</p>
      ) : (
        <ol>
          {items.map((a) => (
            <li key={a.id} className={`event event-${a.kind}`}>
              <span className="event-dot" />
              <div>
                <div className="event-text">
                  <strong>{VERB[a.kind]}</strong> {a.title}
                  {a.detail && <span className="event-detail"> → {a.detail}</span>}
                </div>
                <div className="event-time">{timeAgo(a.at, now)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
