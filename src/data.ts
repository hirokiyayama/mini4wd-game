import type { CPULevel, MachineSetting, Part, PartStats } from './types';

import bodyMagnum from './assets/magnum.jpg';
import bodySonic from './assets/sonic.jpg';
import bodyTridagger from './assets/tridagger.jpg';
import bodySpinAxe from './assets/spinaxe.jpg';
import bodyBeakSpider from './assets/beakspider.jpg';
import bodyBrockenG from './assets/brockeng.jpg';
import bodyProtoSaberJB from './assets/protosaberjb.jpg';
import bodyRayStinger from './assets/raystinger.jpg';

import chassisAr from './assets/parts/chassis_ar.jpg';
import chassisTz from './assets/parts/chassis_tz.jpg';
import chassisSuper2 from './assets/parts/chassis_super2.jpg';
import motorNormal from './assets/parts/motor_normal.jpg';
import motorRev2 from './assets/parts/motor_rev2.jpg';
import motorTorque2 from './assets/parts/motor_torque2.jpg';
import motorHyperdash from './assets/parts/motor_hyperdash.jpg';
import motorPowerdash from './assets/parts/motor_powerdash.jpg';
import motorLightdash from './assets/parts/motor_lightdash.jpg';
import gearStd from './assets/parts/gear_std.jpg';
import gearSuper from './assets/parts/gear_super.jpg';
import tireSponge from './assets/parts/tire_sponge.jpg';
import tireLowhi from './assets/parts/tire_lowhi.jpg';
import rollerPlastic from './assets/parts/roller_plastic.jpg';
import rollerAlum from './assets/parts/roller_alum.jpg';
import rollerAlum2step from './assets/parts/roller_alum2step.jpg';
import massDamperSquare from './assets/parts/mass_damper_square.jpg';

export const PARTS: Part[] = [
  // Body — grouped into 4 clear archetypes (big stat swings between
  // groups, not just +/-5) so each machine's role is obvious at a glance.
  // スピード特化
  { id: 'b_magnum', name: 'マグナムセイバー', type: 'body', stats: { speed: 45, power: 10, cornering: -15, stamina: 0, weight: 16 }, image: bodyMagnum },
  { id: 'b_tridagger', name: 'トライダガーX', type: 'body', stats: { speed: 40, power: 15, cornering: -10, stamina: -5, weight: 19 }, image: bodyTridagger },
  // コーナー特化
  { id: 'b_beakspider', name: 'ビークスパイダー', type: 'body', stats: { speed: 25, power: -10, cornering: 30, stamina: 10, weight: 10 }, image: bodyBeakSpider },
  { id: 'b_sonic', name: 'ソニックセイバー', type: 'body', stats: { speed: -10, power: -5, cornering: 50, stamina: 5, weight: 13 }, image: bodySonic },
  { id: 'b_spinaxe', name: 'スピンアックス', type: 'body', stats: { speed: -5, power: -5, cornering: 45, stamina: 0, weight: 15 }, image: bodySpinAxe },
  // パワー特化
  { id: 'b_brockeng', name: 'ブロッケンG', type: 'body', stats: { speed: 0, power: 55, cornering: -20, stamina: 15, weight: 26 }, image: bodyBrockenG },
  // バランス型
  { id: 'b_protosaberjb', name: 'プロトセイバーJB', type: 'body', stats: { speed: 20, power: 20, cornering: 20, stamina: 15, weight: 17 }, image: bodyProtoSaberJB },
  { id: 'b_raystinger', name: 'レイスティンガー', type: 'body', stats: { speed: 22, power: 18, cornering: 18, stamina: 10, weight: 15 }, image: bodyRayStinger },

  // Chassis
  { id: 'c_super1', name: 'スーパーIIシャーシ', type: 'chassis', stats: { speed: 10, power: 10, cornering: 20, stamina: 5, weight: 15 }, image: chassisSuper2 },
  { id: 'c_tz', name: 'スーパーTZシャーシ', type: 'chassis', stats: { speed: 15, power: 10, cornering: 30, stamina: 6, weight: 18 }, image: chassisTz },
  { id: 'c_ar', name: 'ARシャーシ', type: 'chassis', stats: { speed: 20, power: 15, cornering: 25, stamina: 10, weight: 22 }, image: chassisAr },

  // Motor
  { id: 'm_lightdash', name: 'ライトダッシュモーター', type: 'motor', stats: { speed: 120, power: 90, cornering: 0, stamina: -5, weight: 14 }, image: motorLightdash },
  { id: 'm_normal', name: 'タイプノーマルモーター', type: 'motor', stats: { speed: 50, power: 50, cornering: 0, stamina: 0, weight: 17 }, image: motorNormal },
  { id: 'm_rev', name: 'レブチューン2モーター', type: 'motor', stats: { speed: 120, power: 40, cornering: 0, stamina: 0, weight: 17 }, image: motorRev2 },
  { id: 'm_torque', name: 'トルクチューン2モーター', type: 'motor', stats: { speed: 70, power: 110, cornering: 0, stamina: 0, weight: 17 }, image: motorTorque2 },
  { id: 'm_powerdash', name: 'パワーダッシュモーター', type: 'motor', stats: { speed: 90, power: 120, cornering: 0, stamina: -20, weight: 17 }, image: motorPowerdash },
  { id: 'm_hyper', name: 'ハイパーダッシュモーター', type: 'motor', stats: { speed: 150, power: 90, cornering: 0, stamina: -40, weight: 17 }, image: motorHyperdash },

  // Gear
  { id: 'g_std', name: '標準ギヤ (4:1)', type: 'gear', stats: { speed: 20, power: 40, cornering: 0, stamina: 0, weight: 2 }, image: gearStd },
  { id: 'g_super', name: '超速ギヤ (3.5:1)', type: 'gear', stats: { speed: 50, power: 20, cornering: 0, stamina: 0, weight: 2 }, image: gearSuper },

  // Tires
  { id: 'tf_slick', name: 'スリックタイヤ(前)', type: 'tire_front', stats: { speed: 30, power: 10, cornering: 10, stamina: 0, weight: 5 } },
  { id: 'tf_sponge', name: 'スポンジタイヤ(前)', type: 'tire_front', stats: { speed: 20, power: 20, cornering: 30, stamina: 0, weight: 3 }, image: tireSponge },
  { id: 'tf_lowhi', name: 'ローハイトタイヤ(前)', type: 'tire_front', stats: { speed: 15, power: 5, cornering: 25, stamina: 0, weight: 4 }, image: tireLowhi },
  { id: 'tr_slick', name: 'スリックタイヤ(後)', type: 'tire_rear', stats: { speed: 30, power: 10, cornering: 10, stamina: 0, weight: 5 } },
  { id: 'tr_sponge', name: 'スポンジタイヤ(後)', type: 'tire_rear', stats: { speed: 20, power: 20, cornering: 30, stamina: 0, weight: 3 }, image: tireSponge },
  { id: 'tr_lowhi', name: 'ローハイトタイヤ(後)', type: 'tire_rear', stats: { speed: 15, power: 5, cornering: 25, stamina: 0, weight: 4 }, image: tireLowhi },

  // Rollers
  { id: 'rf_plastic', name: 'プラローラー(前)', type: 'roller_front', stats: { speed: 0, power: 0, cornering: 20, stamina: 0, weight: 2 }, image: rollerPlastic },
  { id: 'rf_alum', name: 'アルミベアリングローラー(前)', type: 'roller_front', stats: { speed: -5, power: 0, cornering: 50, stamina: 0, weight: 4 }, image: rollerAlum },
  { id: 'rf_alum2', name: '2段アルミローラー(前)', type: 'roller_front', stats: { speed: -8, power: 0, cornering: 65, stamina: 0, weight: 6 }, image: rollerAlum2step },
  { id: 'rr_plastic', name: 'プラローラー(後)', type: 'roller_rear', stats: { speed: 0, power: 0, cornering: 20, stamina: 0, weight: 2 }, image: rollerPlastic },
  { id: 'rr_alum', name: 'アルミベアリングローラー(後)', type: 'roller_rear', stats: { speed: -5, power: 0, cornering: 50, stamina: 0, weight: 4 }, image: rollerAlum },
  { id: 'rr_alum2', name: '2段アルミローラー(後)', type: 'roller_rear', stats: { speed: -8, power: 0, cornering: 65, stamina: 0, weight: 6 }, image: rollerAlum2step },

  // Mass Damper
  { id: 'md_std', name: 'マスダンパー スクエア', type: 'mass_damper', stats: { speed: -10, power: 0, cornering: 30, stamina: 6, weight: 10 }, image: massDamperSquare },
];

// CPUレーサーの強さレベル（1〜3）別パーツ構成。ボディとギヤは特性の違いで
// あって強弱ではないのでレベルを問わず完全ランダム、それ以外の対応パーツは
// レベルが上がるほど数値の高い（＝より最適化された）ものを選ぶ。
const CPU_TIER_CHASSIS = ['c_super1', 'c_tz', 'c_ar'];
const CPU_TIER_TIRE_FRONT = ['tf_slick', 'tf_lowhi', 'tf_sponge'];
const CPU_TIER_TIRE_REAR = ['tr_slick', 'tr_lowhi', 'tr_sponge'];
const CPU_TIER_ROLLER_FRONT = ['rf_plastic', 'rf_alum', 'rf_alum2'];
const CPU_TIER_ROLLER_REAR = ['rr_plastic', 'rr_alum', 'rr_alum2'];
const CPU_TIER_MOTOR: Record<CPULevel, string[]> = {
  1: ['m_normal', 'm_rev', 'm_torque'],
  2: ['m_lightdash', 'm_powerdash'],
  3: ['m_hyper', 'm_powerdash'],
};
const CPU_TIER_MD_CHANCE: Record<CPULevel, number> = { 1: 0.3, 2: 0.6, 3: 0.95 };

// CPUレーサー用：レベルに応じた強さでパーツを自動生成する
export function randomSetting(level: CPULevel = 2): MachineSetting {
  const pickAny = (type: Part['type']): string => {
    const options = PARTS.filter(p => p.type === type);
    return options[Math.floor(Math.random() * options.length)].id;
  };
  const pickFrom = (ids: string[]): string => ids[Math.floor(Math.random() * ids.length)];
  return {
    body: pickAny('body'),
    chassis: CPU_TIER_CHASSIS[level - 1],
    motor: pickFrom(CPU_TIER_MOTOR[level]),
    gear: pickAny('gear'),
    tire_front: CPU_TIER_TIRE_FRONT[level - 1],
    tire_rear: CPU_TIER_TIRE_REAR[level - 1],
    roller_front: CPU_TIER_ROLLER_FRONT[level - 1],
    roller_rear: CPU_TIER_ROLLER_REAR[level - 1],
    mass_damper: Math.random() < CPU_TIER_MD_CHANCE[level] ? 'md_std' : null,
  };
}

export function computeTotalStats(setting: MachineSetting): PartStats {
  const total: PartStats = { speed: 0, power: 0, cornering: 0, stamina: 0, weight: 0 };
  Object.values(setting).forEach(partId => {
    if (!partId) return;
    const part = PARTS.find(p => p.id === partId);
    if (part) {
      total.speed += part.stats.speed;
      total.power += part.stats.power;
      total.cornering += part.stats.cornering;
      total.stamina += part.stats.stamina;
      total.weight += part.stats.weight;
    }
  });
  return total;
}
