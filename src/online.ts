// オンライン対戦の通信部分。
// 部屋番号（4桁）を決めた側が「ホスト」、番号を入れて入る側が「ゲスト」。ブラウザ同士が直接つながる（WebRTC / PeerJS）。
// ※つなぎ合わせには PeerJS の無料の公開サーバーを使う（自前のサーバーは不要）。
// テスト用に、同じブラウザの別タブ同士でつなぐ BroadcastChannel 版も用意（URL に ?mock=1）。
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export type Msg = { t: string; [k: string]: unknown };

export interface Link {
  send: (m: Msg) => void;
  close: () => void;
  onMsg: (m: Msg) => void;
  onClose: () => void;
}

const useMock = () => new URLSearchParams(window.location.search).get('mock') === '1';
const peerId = (code: string) => `beyx-battle-${code}`;

// 4桁の部屋番号
export const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));

type Handlers = { onLink: (l: Link) => void; onError: (msg: string) => void };

function wrap(conn: DataConnection, extraClose?: () => void): Link {
  const link: Link = {
    send: m => { if (conn.open) conn.send(m); },
    close: () => { try { conn.close(); } catch { /* 閉じ済み */ } extraClose?.(); },
    onMsg: () => {}, onClose: () => {},
  };
  conn.on('data', d => link.onMsg(d as Msg));
  conn.on('close', () => link.onClose());
  conn.on('error', () => link.onClose());
  return link;
}

// ---- テスト用（同じブラウザの別タブ同士）
function mockLink(code: string, role: 'host' | 'guest'): Link {
  const ch = new BroadcastChannel(`beyx-mock-${code}`);
  const link: Link = { send: m => ch.postMessage({ from: role, m }), close: () => { ch.postMessage({ from: role, m: { t: 'bye' } }); ch.close(); }, onMsg: () => {}, onClose: () => {} };
  ch.onmessage = e => {
    if (e.data.from === role) return;
    if (e.data.m.t === 'bye') link.onClose(); else link.onMsg(e.data.m);
  };
  return link;
}

// 部屋を作る：番号で待つ。相手が入ってきたら onLink が呼ばれる
export function createRoom(code: string, h: Handlers): () => void {
  if (useMock()) {
    const ch = new BroadcastChannel(`beyx-mock-wait-${code}`);
    ch.onmessage = e => { if (e.data === 'join') { const l = mockLink(code, 'host'); ch.postMessage('ok'); h.onLink(l); } };
    return () => ch.close();
  }
  const peer = new Peer(peerId(code));
  peer.on('error', e => h.onError((e as { type?: string }).type === 'unavailable-id' ? 'unavailable' : '通信サーバーにつなげませんでした。しばらくしてからもう一度お試しください'));
  peer.on('connection', conn => {
    conn.on('open', () => h.onLink(wrap(conn, () => peer.destroy())));
  });
  return () => peer.destroy();
}

// 部屋に入る：番号を入れて、ホストにつなぐ
export function joinRoom(code: string, h: Handlers): () => void {
  if (useMock()) {
    const ch = new BroadcastChannel(`beyx-mock-wait-${code}`);
    let done = false;
    ch.onmessage = e => { if (e.data === 'ok' && !done) { done = true; h.onLink(mockLink(code, 'guest')); ch.close(); } };
    ch.postMessage('join');
    const t = window.setTimeout(() => { if (!done) { h.onError('その番号の部屋が見つかりません'); ch.close(); } }, 2500);
    return () => { window.clearTimeout(t); ch.close(); };
  }
  const peer = new Peer();
  let opened = false;
  const timer = window.setTimeout(() => { if (!opened) { h.onError('その番号の部屋が見つかりません'); peer.destroy(); } }, 12000);
  peer.on('error', e => {
    window.clearTimeout(timer);
    h.onError((e as { type?: string }).type === 'peer-unavailable' ? 'その番号の部屋が見つかりません' : '通信サーバーにつなげませんでした。しばらくしてからもう一度お試しください');
  });
  peer.on('open', () => {
    const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
    conn.on('open', () => { opened = true; window.clearTimeout(timer); h.onLink(wrap(conn, () => peer.destroy())); });
  });
  return () => { window.clearTimeout(timer); peer.destroy(); };
}
