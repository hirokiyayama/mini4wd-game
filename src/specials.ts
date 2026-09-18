// マシンごとの必殺技定義。レース3周目に一定確率で発動し、レース画面を一時停止して
// セリフ・顔画像を大きく演出表示したのち、実際のゲーム効果（加速・コーナー無敵・敵妨害）を適用する。
import faceMagnum from './assets/faces/face_magnum.jpg';
import faceSonic from './assets/faces/face_sonic.jpg';
import faceTridagger from './assets/faces/face_tridagger.jpg';
import faceSpinaxe from './assets/faces/face_spinaxe.jpg';
import faceProtoSaberJB from './assets/faces/face_protosaberjb.jpg';
import faceBeakSpider from './assets/faces/face_beakspider.jpg';
import faceBrockenG from './assets/faces/face_brockeng.jpg';
import faceRayStinger from './assets/faces/face_raystinger.jpg';

export type SpecialKind = 'boost' | 'corner' | 'attack_cone' | 'attack_single' | 'attack_homing';
// エフェクトの見た目パターン（マシンごとに異なる演出をCSS側で切り替えるためのキー）
export type SpecialFxKey = 'tornado' | 'wind' | 'wallrun' | 'thunder' | 'afterimage' | 'blade' | 'hammer' | 'needle';

export interface SpecialMove {
  bodyId: string;
  name: string;
  quote: string;
  kind: SpecialKind;
  fxKey: SpecialFxKey;
  color: string;
  glow: string;
  description: string;
  faceImage: string;
}

export const SPECIAL_MOVES: Record<string, SpecialMove> = {
  b_magnum: {
    bodyId: 'b_magnum',
    name: 'マグナムトルネード',
    quote: 'いけっ！マグナムトルネード！',
    kind: 'boost',
    fxKey: 'tornado',
    color: '#5aabff',
    glow: '#8fc4ff',
    description: '直線で超加速！一定時間、最高速度が大幅アップ！',
    faceImage: faceMagnum,
  },
  b_sonic: {
    bodyId: 'b_sonic',
    name: 'ソニックウインド',
    quote: 'いっけぇぇぇ！ソニックーっ！',
    kind: 'corner',
    fxKey: 'wind',
    color: '#22d3ee',
    glow: '#7ce9fb',
    description: 'コーナーでの減速とコースアウトを無効化！さらに最高速も大幅アップ！',
    faceImage: faceSonic,
  },
  b_tridagger: {
    bodyId: 'b_tridagger',
    name: '壁走り',
    quote: 'トライダガー！壁走りだっ！',
    kind: 'corner',
    fxKey: 'wallrun',
    color: '#ffb020',
    glow: '#ffd27a',
    description: '壁面を走行してコーナーを高速突破！最高速が大幅アップ！',
    faceImage: faceTridagger,
  },
  b_spinaxe: {
    bodyId: 'b_spinaxe',
    name: 'サンダードリフト',
    quote: 'サンダードリフト走行でげすっ！',
    kind: 'corner',
    fxKey: 'thunder',
    color: '#f4a300',
    glow: '#ffd27a',
    description: 'ドリフトしながらコーナーを高速突破！さらに最高速も大幅アップ！',
    faceImage: faceSpinaxe,
  },
  b_protosaberjb: {
    bodyId: 'b_protosaberjb',
    name: 'JBブースト',
    quote: 'いけっ！プロトセイバーJB！',
    kind: 'boost',
    fxKey: 'afterimage',
    color: '#5aabff',
    glow: '#c3e0ff',
    description: '一定時間、マシンの速度を大幅アップ！',
    faceImage: faceProtoSaberJB,
  },
  b_beakspider: {
    bodyId: 'b_beakspider',
    name: '空気の刃',
    quote: '切り裂け！ビークスパイダー！',
    kind: 'attack_cone',
    fxKey: 'blade',
    color: '#22d3ee',
    glow: '#a5f3fc',
    description: '前方の敵を攻撃！一定範囲の敵にダメージ！',
    faceImage: faceBeakSpider,
  },
  b_brockeng: {
    bodyId: 'b_brockeng',
    name: 'ハンマーGクラッシュ',
    quote: 'いけっ！ハンマーGクラッシュ！',
    kind: 'attack_cone',
    fxKey: 'hammer',
    color: '#ff5a5a',
    glow: '#ffb3b3',
    description: '前方の敵をまとめて吹き飛ばし、範囲内の相手を大きく減速させる！',
    faceImage: faceBrockenG,
  },
  b_raystinger: {
    bodyId: 'b_raystinger',
    name: '針攻撃',
    quote: 'いけっ！レイスティンガー！',
    kind: 'attack_homing',
    fxKey: 'needle',
    color: '#dc2626',
    glow: '#ff8080',
    description: '敵をロックオンして追尾攻撃！命中した敵を大幅減速！',
    faceImage: faceRayStinger,
  },
};

export const DEFAULT_SPECIAL: SpecialMove = SPECIAL_MOVES.b_magnum;

export function getSpecialMove(bodyId: string | null): SpecialMove {
  return (bodyId && SPECIAL_MOVES[bodyId]) || DEFAULT_SPECIAL;
}
