// サウンドのオン/オフ設定と、自動再生解除（ユーザー操作待ち）の共通管理。
// BGM（bgm.ts）と必殺技SE（sound.ts）の両方から使う。
const STORAGE_KEY = 'mini4wd_sound_muted';

function readInitialMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = readInitialMuted();
const listeners = new Set<(muted: boolean) => void>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // localStorageが使えない環境（プライベートモード等）では保存をあきらめる
  }
  listeners.forEach(fn => fn(muted));
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

export function subscribeMuted(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ブラウザの自動再生制限を解除するため、ページ内での最初のユーザー操作を検知する
let interacted = false;
const pendingUnlockCallbacks: (() => void)[] = [];

function handleFirstInteraction(): void {
  interacted = true;
  document.removeEventListener('click', handleFirstInteraction);
  document.removeEventListener('touchstart', handleFirstInteraction);
  document.removeEventListener('keydown', handleFirstInteraction);
  pendingUnlockCallbacks.splice(0).forEach(fn => fn());
}
document.addEventListener('click', handleFirstInteraction);
document.addEventListener('touchstart', handleFirstInteraction);
document.addEventListener('keydown', handleFirstInteraction);

export function onFirstInteraction(fn: () => void): void {
  if (interacted) {
    fn();
    return;
  }
  pendingUnlockCallbacks.push(fn);
}
