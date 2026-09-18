// 必殺技発動時の効果音。添付された3種類のSEからランダムに1つを再生する。
import sfx1 from './assets/sfx/special1.mp3';
import sfx2 from './assets/sfx/special2.mp3';
import sfx3 from './assets/sfx/special3.mp3';

const SPECIAL_SFX_URLS = [sfx1, sfx2, sfx3];
const audioPool: HTMLAudioElement[] = SPECIAL_SFX_URLS.map(url => {
  const audio = new Audio(url);
  audio.preload = 'auto';
  return audio;
});

// レース開始などのユーザー操作直後に呼んでおくと、ブラウザの自動再生制限で
// 必殺技発動時の再生がブロックされにくくなる（一度再生→即停止して「解錠」する）
export function primeAudio(): void {
  audioPool.forEach(audio => {
    const p = audio.play();
    if (p) {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    }
  });
}

export function playSpecialSound(): void {
  const base = audioPool[Math.floor(Math.random() * audioPool.length)];
  // 直前の再生がまだ終わっていない場合でも頭から鳴らせるよう複製して再生する
  const clone = base.cloneNode(true) as HTMLAudioElement;
  clone.play().catch(() => {});
}
