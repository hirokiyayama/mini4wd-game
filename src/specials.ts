// マシンごとの必殺技定義。レース3周目に一定確率で発動し、レース画面を一時停止して
// 技名を大きく演出表示したのち、実際のゲーム効果（加速・コーナー無敵・敵妨害）を適用する。
export type SpecialKind = 'boost' | 'corner' | 'attack_cone' | 'attack_single' | 'attack_homing';

export interface SpecialMove {
  bodyId: string;
  name: string;
  quote: string;
  kind: SpecialKind;
  color: string;
  glow: string;
  description: string;
}

export const SPECIAL_MOVES: Record<string, SpecialMove> = {
  b_magnum: {
    bodyId: 'b_magnum',
    name: 'マグナムトルネード',
    quote: 'いけっ！マグナムトルネード！',
    kind: 'boost',
    color: '#5aabff',
    glow: '#8fc4ff',
    description: '直線で超加速！一定時間、最高速度が大幅アップ！',
  },
  b_sonic: {
    bodyId: 'b_sonic',
    name: 'ソニックウインド',
    quote: 'いっけぇぇぇ！ソニックーっ！',
    kind: 'corner',
    color: '#22d3ee',
    glow: '#7ce9fb',
    description: 'コーナーでの減速を大幅軽減！高速でコーナーを突破！',
  },
  b_tridagger: {
    bodyId: 'b_tridagger',
    name: '壁走り',
    quote: 'トライダガー！壁走りだっ！',
    kind: 'corner',
    color: '#ffb020',
    glow: '#ffd27a',
    description: '壁面を走行してコーナーを高速突破！速度低下をほぼ無効化！',
  },
  b_spinaxe: {
    bodyId: 'b_spinaxe',
    name: 'サンダードリフト',
    quote: 'サンダードリフト走行でげすっ！',
    kind: 'corner',
    color: '#f4a300',
    glow: '#ffd27a',
    description: 'ドリフトしながらコーナーを高速突破！コーナー脱出時に加速！',
  },
  b_protosaberjb: {
    bodyId: 'b_protosaberjb',
    name: 'JBブースト',
    quote: 'いけっ！プロトセイバーJB！',
    kind: 'boost',
    color: '#5aabff',
    glow: '#c3e0ff',
    description: '一定時間、マシンの速度を大幅アップ！',
  },
  b_beakspider: {
    bodyId: 'b_beakspider',
    name: '空気の刃',
    quote: '切り裂け！ビークスパイダー！',
    kind: 'attack_cone',
    color: '#22d3ee',
    glow: '#a5f3fc',
    description: '前方の敵を攻撃！一定範囲の敵にダメージ！',
  },
  b_brockeng: {
    bodyId: 'b_brockeng',
    name: 'ハンマーGクラッシュ',
    quote: 'いけっ！ハンマーGクラッシュ！',
    kind: 'attack_single',
    color: '#ff5a5a',
    glow: '#ffb3b3',
    description: '前方の敵を吹き飛ばし、大きく減速させる！',
  },
  b_raystinger: {
    bodyId: 'b_raystinger',
    name: '針攻撃',
    quote: 'いけっ！レイスティンガー！',
    kind: 'attack_homing',
    color: '#dc2626',
    glow: '#ff8080',
    description: '敵をロックオンして追尾攻撃！命中した敵を大幅減速！',
  },
};

export const DEFAULT_SPECIAL: SpecialMove = SPECIAL_MOVES.b_magnum;

export function getSpecialMove(bodyId: string | null): SpecialMove {
  return (bodyId && SPECIAL_MOVES[bodyId]) || DEFAULT_SPECIAL;
}
