// プロジェクトに音声アセットがないため、必殺技の効果音は Web Audio API で
// その場で合成する。「ぎゅいーん」とエンジンが唸って吹け上がり、
// 「ズキューン」と一気に駆け抜ける、モーターの吹き上がり音をイメージした構成。
import type { SpecialKind } from './specials';

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

// レース開始などのユーザー操作直後に呼んでおくと、ブラウザの自動再生制限で
// AudioContext が suspended のままになるのを避けやすい
export function primeAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

const ATTACK_KINDS: SpecialKind[] = ['attack_cone', 'attack_single', 'attack_homing'];

export function playSpecialSound(kind: SpecialKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const isAttack = ATTACK_KINDS.includes(kind);
  const now = ctx.currentTime;

  // ①「ぎゅいいいん」：モーターが唸りながら一気に吹け上がるレブ音
  //   （一瞬タメてから急加速するとエンジン音らしく聞こえる）
  const revFilter = ctx.createBiquadFilter();
  revFilter.type = 'lowpass';
  revFilter.frequency.setValueAtTime(450, now);
  revFilter.frequency.exponentialRampToValueAtTime(4500, now + 0.3);
  const revMaster = ctx.createGain();
  revMaster.gain.setValueAtTime(0.0001, now);
  revMaster.gain.exponentialRampToValueAtTime(0.42, now + 0.09);
  revMaster.gain.exponentialRampToValueAtTime(0.3, now + 0.26);
  revMaster.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
  revFilter.connect(revMaster).connect(ctx.destination);

  const revA = ctx.createOscillator();
  revA.type = 'sawtooth';
  revA.frequency.setValueAtTime(90, now);
  revA.frequency.linearRampToValueAtTime(58, now + 0.06);
  revA.frequency.exponentialRampToValueAtTime(isAttack ? 430 : 500, now + 0.3);
  revA.connect(revFilter);
  revA.start(now);
  revA.stop(now + 0.38);

  const revB = ctx.createOscillator();
  revB.type = 'square';
  revB.detune.setValueAtTime(-22, now);
  revB.frequency.setValueAtTime(90, now);
  revB.frequency.linearRampToValueAtTime(58, now + 0.06);
  revB.frequency.exponentialRampToValueAtTime(isAttack ? 430 : 500, now + 0.3);
  revB.connect(revFilter);
  revB.start(now);
  revB.stop(now + 0.38);

  // ②「ズキューン」：レブのピークから一気に駆け抜ける発射音（下降ピッチスイープ）
  const launchOsc = ctx.createOscillator();
  launchOsc.type = isAttack ? 'sawtooth' : 'sine';
  const launchGain = ctx.createGain();
  launchOsc.frequency.setValueAtTime(isAttack ? 1900 : 1500, now + 0.28);
  launchOsc.frequency.exponentialRampToValueAtTime(160, now + 0.62);
  launchGain.gain.setValueAtTime(0.0001, now + 0.28);
  launchGain.gain.exponentialRampToValueAtTime(0.48, now + 0.32);
  launchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.64);
  launchOsc.connect(launchGain).connect(ctx.destination);
  launchOsc.start(now + 0.28);
  launchOsc.stop(now + 0.66);

  // ③ 発射の勢いを支える「シュッ」というノイズの風切り音
  const bufferSize = Math.floor(ctx.sampleRate * 0.36);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.Q.value = 0.7;
  noiseFilter.frequency.setValueAtTime(1300, now + 0.28);
  noiseFilter.frequency.exponentialRampToValueAtTime(280, now + 0.6);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now + 0.28);
  noiseGain.gain.exponentialRampToValueAtTime(isAttack ? 0.5 : 0.32, now + 0.31);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  noise.start(now + 0.28);
  noise.stop(now + 0.62);
}
