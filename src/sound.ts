// プロジェクトに音声アセットがないため、必殺技の効果音は Web Audio API で
// その場合成する（パワーアップの上昇音＋インパクト音）。
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

  // 上昇するパワーアップ音
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = isAttack ? 'sawtooth' : 'sine';
  osc.frequency.setValueAtTime(170, now);
  osc.frequency.exponentialRampToValueAtTime(isAttack ? 820 : 1150, now + 0.42);
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.32, now + 0.08);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.6);

  // 重ねるハーモニクス（きらびやかさを足す）
  const osc2 = ctx.createOscillator();
  const osc2Gain = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(340, now);
  osc2.frequency.exponentialRampToValueAtTime(isAttack ? 1400 : 1900, now + 0.4);
  osc2Gain.gain.setValueAtTime(0.0001, now);
  osc2Gain.gain.exponentialRampToValueAtTime(0.14, now + 0.1);
  osc2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc2.connect(osc2Gain).connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + 0.55);

  // 着地のインパクト（ノイズバースト）
  const bufferSize = Math.floor(ctx.sampleRate * 0.22);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = isAttack ? 'highpass' : 'lowpass';
  noiseFilter.frequency.value = isAttack ? 900 : 1800;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now + 0.34);
  noiseGain.gain.exponentialRampToValueAtTime(isAttack ? 0.55 : 0.3, now + 0.37);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  noise.start(now + 0.34);
  noise.stop(now + 0.7);
}
