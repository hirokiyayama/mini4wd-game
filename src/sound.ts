// 必殺技発動時の効果音。添付された3種類のSEからランダムに1つを再生する。
import sfx1 from './assets/sfx/special1.mp3';
import sfx2 from './assets/sfx/special2.mp3';
import sfx3 from './assets/sfx/special3.mp3';
import { isMuted, onFirstInteraction } from './audioSettings';

const SPECIAL_SFX_URLS = [sfx1, sfx2, sfx3];
const audioPool: HTMLAudioElement[] = SPECIAL_SFX_URLS.map(url => {
  const audio = new Audio(url);
  audio.preload = 'auto';
  return audio;
});

export function playSpecialSound(): void {
  if (isMuted()) return;
  const base = audioPool[Math.floor(Math.random() * audioPool.length)];
  // 直前の再生がまだ終わっていない場合でも頭から鳴らせるよう複製して再生する
  const clone = base.cloneNode(true) as HTMLAudioElement;
  const attempt = () => clone.play().catch(() => {});
  attempt();
  // ブラウザの自動再生制限でブロックされていた場合、最初のユーザー操作で再試行する
  onFirstInteraction(attempt);
}
