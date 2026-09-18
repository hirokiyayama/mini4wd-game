// ガレージ画面で流すBGM。添付された2曲からランダムに1つを選び、ループ再生する。
import track1 from './assets/bgm/garage_bgm1.mp3';
import track2 from './assets/bgm/garage_bgm2.mp3';
import { isMuted, subscribeMuted, onFirstInteraction } from './audioSettings';

const TRACKS = [track1, track2];

let audioEl: HTMLAudioElement | null = null;

function ensureAudioEl(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.loop = true;
    audioEl.volume = 0.5;
    subscribeMuted(next => {
      if (audioEl) audioEl.muted = next;
    });
  }
  return audioEl;
}

// ブラウザは「ミュート状態での自動再生」は常に許可するため、まずミュートで
// 再生を開始し、成功したら希望のミュート状態（サウンド設定）へ同期する。
// それでもブロックされる場合は、最初のユーザー操作を待ってから再試行する
function tryPlay(el: HTMLAudioElement): void {
  el.muted = true;
  const playPromise = el.play();
  const syncMuted = () => { el.muted = isMuted(); };
  if (!playPromise) {
    syncMuted();
    return;
  }
  playPromise.then(syncMuted).catch(() => {
    onFirstInteraction(() => {
      el.muted = true;
      el.play().then(syncMuted).catch(() => {});
    });
  });
}

// ガレージ画面が表示されるたびに呼ぶ：2曲からランダムに1つを選んでループ再生
export function playGarageBgm(): void {
  const el = ensureAudioEl();
  const pick = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  el.src = pick;
  el.currentTime = 0;
  tryPlay(el);
}

export function stopGarageBgm(): void {
  if (audioEl) audioEl.pause();
}
