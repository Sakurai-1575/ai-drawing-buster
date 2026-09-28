/**
 * Thin PeerJS transport: a host that owns the room code, and guests that connect to it.
 * No game rules live here — see multiplayer/useMatch.ts.
 */
import Peer, { type DataConnection } from 'peerjs';
import { randomRoomCode, roomPeerId, type GuestMsg, type HostMsg, type PlayerId } from './protocol';

/** Our error vocabulary, mapped from PeerJS error types. */
export type RoomErrorCode = 'room-not-found' | 'network' | 'server' | 'browser-unsupported' | 'unknown';

export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function toRoomError(err: { type?: string; message?: string }): RoomError {
  switch (err.type) {
    case 'peer-unavailable':
      return new RoomError('room-not-found', err.message ?? '');
    case 'network':
    case 'socket-error':
    case 'socket-closed':
    case 'disconnected':
      return new RoomError('network', err.message ?? '');
    case 'server-error':
    case 'ssl-unavailable':
      return new RoomError('server', err.message ?? '');
    case 'browser-incompatible':
    case 'webrtc':
      return new RoomError('browser-unsupported', err.message ?? '');
    default:
      return new RoomError('unknown', err.message ?? String(err.type));
  }
}

const OPEN_TIMEOUT_MS = 12_000;
const CREATE_ATTEMPTS = 5;

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 1 }) : new Peer({ debug: 1 });
    const timer = window.setTimeout(() => {
      peer.destroy();
      reject(new RoomError('server', 'Timed out connecting to the PeerServer'));
    }, OPEN_TIMEOUT_MS);
    peer.once('open', () => {
      window.clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (err) => {
      window.clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
  });
}

export interface HostHandlers {
  onMessage: (from: PlayerId, msg: GuestMsg) => void;
  /** Data channel closed or errored (the peer may already be gone). */
  onLeave: (id: PlayerId) => void;
  /** Fatal: lost the signalling server and could not recover. */
  onError: (err: RoomError) => void;
}

export class HostRoom {
  private conns = new Map<PlayerId, DataConnection>();
  private closed = false;

  private constructor(
    private peer: Peer,
    readonly code: string,
    private handlers: HostHandlers,
  ) {
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      // Signalling dropped: existing data channels still work; try to get new joins working again.
      if (!this.closed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') return; // not relevant for a host
      if (!this.closed) handlers.onError(toRoomError(err));
    });
  }

  /** Registers a fresh room code on the PeerServer, retrying on collisions. */
  static async create(handlers: HostHandlers): Promise<HostRoom> {
    let lastErr: unknown;
    for (let i = 0; i < CREATE_ATTEMPTS; i++) {
      const code = randomRoomCode();
      try {
        const peer = await openPeer(roomPeerId(code));
        return new HostRoom(peer, code, handlers);
      } catch (err) {
        lastErr = err;
        if ((err as { type?: string }).type !== 'unavailable-id') break;
      }
    }
    throw lastErr instanceof RoomError ? lastErr : toRoomError(lastErr as { type?: string });
  }

  get selfId(): PlayerId {
    return this.peer.id;
  }

  private accept(conn: DataConnection) {
    conn.on('open', () => this.conns.set(conn.peer, conn));
    conn.on('data', (data) => {
      if (this.conns.get(conn.peer) !== conn) this.conns.set(conn.peer, conn);
      this.handlers.onMessage(conn.peer, data as GuestMsg);
    });
    const leave = () => {
      if (this.conns.get(conn.peer) !== conn) return;
      this.conns.delete(conn.peer);
      if (!this.closed) this.handlers.onLeave(conn.peer);
    };
    conn.on('close', leave);
    conn.on('error', leave);
  }

  send(to: PlayerId, msg: HostMsg) {
    const conn = this.conns.get(to);
    if (conn?.open) void conn.send(msg);
  }

  /** Send to every guest, optionally skipping one (e.g. relaying a drawer's strokes back to everyone else). */
  broadcast(msg: HostMsg, except?: PlayerId) {
    for (const [id, conn] of this.conns) if (id !== except && conn.open) void conn.send(msg);
  }

  /** Drop one guest (reject, kick, or heartbeat timeout). */
  disconnect(id: PlayerId) {
    const conn = this.conns.get(id);
    this.conns.delete(id);
    // Give a just-sent message (e.g. a reject) a moment to flush before closing.
    if (conn) window.setTimeout(() => conn.close(), 300);
  }

  close() {
    if (this.closed) return;
    this.broadcast({ t: 'closed' });
    this.closed = true;
    const peer = this.peer;
    window.setTimeout(() => peer.destroy(), 300);
  }
}

export interface GuestHandlers {
  onMessage: (msg: HostMsg) => void;
  /** The channel to the host closed (host left, network dropped). */
  onClose: () => void;
  onError: (err: RoomError) => void;
}

export class GuestRoom {
  private closed = false;

  private constructor(
    private peer: Peer,
    private conn: DataConnection,
  ) {}

  static async join(code: string, handlers: GuestHandlers): Promise<GuestRoom> {
    const peer = await openPeer().catch((err) => {
      throw err instanceof RoomError ? err : toRoomError(err);
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      const conn = peer.connect(roomPeerId(code), { reliable: true, serialization: 'json' });
      const fail = (err: RoomError) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        peer.destroy();
        reject(err);
      };
      const timer = window.setTimeout(() => fail(new RoomError('room-not-found', 'Timed out reaching the host')), OPEN_TIMEOUT_MS);
      peer.on('error', (err) => {
        const e = toRoomError(err);
        if (!settled) fail(e);
        else if (!room.closed) handlers.onError(e);
      });
      const room = new GuestRoom(peer, conn);
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(room);
      });
      conn.on('data', (data) => handlers.onMessage(data as HostMsg));
      const onClose = () => {
        if (!settled) fail(new RoomError('room-not-found', 'Connection closed'));
        else if (!room.closed) handlers.onClose();
      };
      conn.on('close', onClose);
      conn.on('error', onClose);
    });
  }

  get selfId(): PlayerId {
    return this.peer.id;
  }

  send(msg: GuestMsg) {
    if (this.conn.open) void this.conn.send(msg);
  }

  close() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    const peer = this.peer;
    window.setTimeout(() => peer.destroy(), 300);
  }
}

