export type PartType = 'body' | 'chassis' | 'motor' | 'gear' | 'tire_front' | 'tire_rear' | 'roller_front' | 'roller_rear' | 'frp' | 'mass_damper';

export interface PartStats {
  speed: number;       // スピード（最高速に影響）
  power: number;       // パワー（加速や登坂に影響）
  cornering: number;   // コーナー安定（コースアウトしにくさ）
  stamina: number;     // スタミナ（レース後半のバテにくさ）
  weight: number;      // 重さ（軽いほど速いが、軽すぎるとコースアウトしやすい）
}

export interface Part {
  id: string;
  name: string;
  type: PartType;
  stats: PartStats;
}

export interface MachineSetting {
  body: string | null;
  chassis: string | null;
  motor: string | null;
  gear: string | null;
  tire_front: string | null;
  tire_rear: string | null;
  roller_front: string | null;
  roller_rear: string | null;
  frp: string | null;
  mass_damper: string | null;
}

export interface Player {
  id: string;
  name: string;
  setting: MachineSetting;
}
