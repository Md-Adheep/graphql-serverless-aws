import type { ConnectionState } from '../api/realtime';
import { Logo } from './icons';

const LABEL: Record<ConnectionState, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  disconnected: 'Offline',
};

export function Header({ live }: { live: ConnectionState }) {
  return (
    <header className="hero">
      <div className="hero-inner">
        <div className="brand">
          <Logo />
          <div>
            <h1>TaskFlow</h1>
            <p>Real-time team task board</p>
          </div>
        </div>
        <span className={`live-pill live-${live}`} title="Real-time subscription status (AppSync WebSocket)">
          <span className="live-dot" />
          {LABEL[live]}
        </span>
      </div>
    </header>
  );
}
