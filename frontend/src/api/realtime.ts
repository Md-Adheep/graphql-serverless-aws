/**
 * Tiny client for the AWS AppSync real-time (WebSocket) protocol, so we don't need the
 * Amplify library just for subscriptions.
 * Protocol: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-websocket-client.html
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface Sub {
  query: string;
  variables: Record<string, unknown>;
  onData: (data: unknown) => void;
}

export class AppSyncRealtimeClient {
  private ws?: WebSocket;
  private subs = new Map<string, Sub>();
  private keepAliveTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private closedByUser = false;
  private readonly auth: Record<string, string>;

  constructor(
    graphqlUrl: string,
    private readonly realtimeUrl: string,
    apiKey: string,
    private readonly onState: (s: ConnectionState) => void = () => {},
  ) {
    this.auth = { host: new URL(graphqlUrl).host, 'x-api-key': apiKey };
  }

  connect() {
    this.closedByUser = false;
    this.onState('connecting');
    const header = btoa(JSON.stringify(this.auth));
    const url = `${this.realtimeUrl}?header=${encodeURIComponent(header)}&payload=e30=`;
    const ws = new WebSocket(url, ['graphql-ws']);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }));
    ws.onmessage = (ev) => this.handle(JSON.parse(ev.data as string));
    ws.onclose = () => {
      clearTimeout(this.keepAliveTimer);
      this.onState('disconnected');
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  subscribe(query: string, onData: (data: unknown) => void, variables: Record<string, unknown> = {}): () => void {
    const id = crypto.randomUUID();
    this.subs.set(id, { query, variables, onData });
    this.start(id);
    return () => {
      this.subs.delete(id);
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ id, type: 'stop' }));
    };
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.keepAliveTimer);
    this.ws?.close();
  }

  private connected = false;

  private start(id: string) {
    const sub = this.subs.get(id);
    if (!sub || !this.connected || this.ws?.readyState !== WebSocket.OPEN) return; // sent on ack
    this.ws.send(
      JSON.stringify({
        id,
        type: 'start',
        payload: {
          data: JSON.stringify({ query: sub.query, variables: sub.variables }),
          extensions: { authorization: this.auth },
        },
      }),
    );
  }

  private handle(msg: { type: string; id?: string; payload?: any }) {
    switch (msg.type) {
      case 'connection_ack':
        this.connected = true;
        this.reconnectAttempt = 0;
        this.onState('connected');
        this.resetKeepAlive(msg.payload?.connectionTimeoutMs ?? 300_000);
        for (const id of this.subs.keys()) this.start(id);
        break;
      case 'ka':
        this.resetKeepAlive();
        break;
      case 'data':
        if (msg.id) this.subs.get(msg.id)?.onData(msg.payload?.data);
        break;
      case 'error':
      case 'connection_error':
        console.error('AppSync realtime error', msg.payload);
        break;
    }
  }

  private keepAliveMs = 300_000;
  private resetKeepAlive(ms?: number) {
    if (ms) this.keepAliveMs = ms;
    clearTimeout(this.keepAliveTimer);
    // No keep-alive from the server within the timeout -> connection is dead; reconnect.
    this.keepAliveTimer = setTimeout(() => this.ws?.close(), this.keepAliveMs);
  }

  private scheduleReconnect() {
    this.connected = false;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt++);
    setTimeout(() => this.connect(), delay);
  }
}
