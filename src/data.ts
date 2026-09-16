import type { MachineSetting, Part, PartStats } from './types';

export const PARTS: Part[] = [
  // Body
  { id: 'b_magnum', name: 'マグナムセイバー', type: 'body', stats: { speed: 10, power: 0, cornering: 0, stamina: 0, weight: 15 } },
  { id: 'b_sonic', name: 'ソニックセイバー', type: 'body', stats: { speed: 0, power: 0, cornering: 15, stamina: 0, weight: 15 } },
  { id: 'b_tridagger', name: 'トライダガーX', type: 'body', stats: { speed: 5, power: 5, cornering: 5, stamina: 10, weight: 16 } },

  // Chassis
  { id: 'c_super1', name: 'スーパー1シャーシ', type: 'chassis', stats: { speed: 10, power: 10, cornering: 20, stamina: 10, weight: 15 } },
  { id: 'c_tz', name: 'スーパーTZシャーシ', type: 'chassis', stats: { speed: 15, power: 10, cornering: 30, stamina: 15, weight: 18 } },
  { id: 'c_ar', name: 'ARシャーシ', type: 'chassis', stats: { speed: 20, power: 15, cornering: 25, stamina: 30, weight: 22 } },
  
  // Motor
  { id: 'm_normal', name: 'ノーマルモーター', type: 'motor', stats: { speed: 50, power: 50, cornering: 0, stamina: 0, weight: 17 } },
  { id: 'm_rev', name: 'レブチューンモーター', type: 'motor', stats: { speed: 120, power: 40, cornering: 0, stamina: 0, weight: 17 } },
  { id: 'm_torque', name: 'トルクチューンモーター', type: 'motor', stats: { speed: 70, power: 110, cornering: 0, stamina: 0, weight: 17 } },
  { id: 'm_hyper', name: 'ハイパーダッシュ', type: 'motor', stats: { speed: 150, power: 130, cornering: 0, stamina: -10, weight: 17 } },

  // Gear
  { id: 'g_std', name: '標準ギヤ (4:1)', type: 'gear', stats: { speed: 20, power: 40, cornering: 0, stamina: 0, weight: 2 } },
  { id: 'g_super', name: '超速ギヤ (3.5:1)', type: 'gear', stats: { speed: 50, power: 20, cornering: 0, stamina: 0, weight: 2 } },
  
  // Tires
  { id: 'tf_slick', name: 'スリックタイヤ(前)', type: 'tire_front', stats: { speed: 30, power: 10, cornering: 10, stamina: 0, weight: 5 } },
  { id: 'tf_sponge', name: 'スポンジタイヤ(前)', type: 'tire_front', stats: { speed: 20, power: 20, cornering: 30, stamina: 0, weight: 3 } },
  { id: 'tr_slick', name: 'スリックタイヤ(後)', type: 'tire_rear', stats: { speed: 30, power: 10, cornering: 10, stamina: 0, weight: 5 } },
  { id: 'tr_sponge', name: 'スポンジタイヤ(後)', type: 'tire_rear', stats: { speed: 20, power: 20, cornering: 30, stamina: 0, weight: 3 } },

  // Rollers
  { id: 'rf_plastic', name: 'プラローラー(前)', type: 'roller_front', stats: { speed: 0, power: 0, cornering: 20, stamina: 0, weight: 2 } },
  { id: 'rf_alum', name: 'アルミローラー(前)', type: 'roller_front', stats: { speed: -5, power: 0, cornering: 50, stamina: 0, weight: 4 } },
  { id: 'rr_plastic', name: 'プラローラー(後)', type: 'roller_rear', stats: { speed: 0, power: 0, cornering: 20, stamina: 0, weight: 2 } },
  { id: 'rr_alum', name: 'アルミローラー(後)', type: 'roller_rear', stats: { speed: -5, power: 0, cornering: 50, stamina: 0, weight: 4 } },

  // FRP
  { id: 'frp_front', name: 'FRP強化マウント', type: 'frp', stats: { speed: 0, power: 0, cornering: 40, stamina: 10, weight: 3 } },
  
  // Mass Damper
  { id: 'md_std', name: 'マスダンパー', type: 'mass_damper', stats: { speed: -10, power: 0, cornering: 30, stamina: 20, weight: 10 } }
];

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
