// ガレージ画面・レース画面で流すBGM。それぞれの曲リストからランダムに1つを選んで
// 再生し、曲が終わるたびに（同じ曲が連続しないよう）ランダムに選び直して流し続ける。
import garageTrack1 from './assets/bgm/garage_bgm1.mp3';
import garageTrack2 from './assets/bgm/garage_bgm2.mp3';
import raceTrack1 from './assets/bgm/race_bgm1.mp3';
import raceTrack2 from './assets/bgm/race_bgm2.mp3';
import raceTrack3 from './assets/bgm/race_bgm3.mp3';
import { isMuted, subscribeMuted, onFirstInteraction } from './audioSettings';

interface BgmPlayer {
  play(): void;
  stop(): void;
}

function createBgmPlayer(tracks: string[]): BgmPlayer {
  let audioEl: HTMLAudioElement | null = null;
  let currentIndex = -1;

  function nextRandomIndex(): number {
    if (tracks.length <= 1) return 0;
    let idx = Math.floor(Math.random() * tracks.length);
    // 同じ曲が連続で選ばれた場合は選び直す（体感で「ランダムに切り替わっている」と分かるように）
    let guard = 0;
    while (idx === currentIndex && guard < 10) {
      idx = Math.floor(Math.random() * tracks.length);
      guard++;
    }
    return idx;
  }

  function ensureAudioEl(): HTMLAudioElement {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.volume = 0.5;
      // 1曲が終わるたびに、次の曲をランダムに選んで流し続ける
      audioEl.addEventListener('ended', () => playIndex(nextRandomIndex()));
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

  function playIndex(index: number): void {
    const el = ensureAudioEl();
    currentIndex = index;
    el.src = tracks[index];
    el.currentTime = 0;
    tryPlay(el);
  }

  return {
    play(): void {
      playIndex(nextRandomIndex());
    },
    stop(): void {
      if (audioEl) audioEl.pause();
    },
  };
}

const garagePlayer = createBgmPlayer([garageTrack1, garageTrack2]);
const racePlayer = createBgmPlayer([raceTrack1, raceTrack2, raceTrack3]);

// ガレージ画面が表示されるたびに呼ぶ
export function playGarageBgm(): void {
  garagePlayer.play();
}

export function stopGarageBgm(): void {
  garagePlayer.stop();
}

// レース画面が表示されるたびに呼ぶ
export function playRaceBgm(): void {
  racePlayer.play();
}

export function stopRaceBgm(): void {
  racePlayer.stop();
}
