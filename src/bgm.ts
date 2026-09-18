// ガレージ画面で流すBGM。添付された2曲からランダムに1つを選び、ループ再生する。
import track1 from './assets/bgm/garage_bgm1.mp3';
import track2 from './assets/bgm/garage_bgm2.mp3';

const TRACKS = [track1, track2];

let audioEl: HTMLAudioElement | null = null;
let unlockListenerAdded = false;

function ensureAudioEl(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.loop = true;
    audioEl.volume = 0.5;
  }
  return audioEl;
}

// ブラウザの自動再生制限で再生がブロックされた場合、最初のユーザー操作で再生を試みる
function tryPlay(el: HTMLAudioElement): void {
  const playPromise = el.play();
  if (!playPromise) return;
  playPromise.catch(() => {
    if (unlockListenerAdded) return;
    unlockListenerAdded = true;
    const unlock = () => {
      el.play().catch(() => {});
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);
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
