export type PartType = 'body' | 'chassis' | 'motor' | 'gear' | 'tire_front' | 'tire_rear' | 'roller_front' | 'roller_rear' | 'mass_damper';

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
  image?: string;
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
  mass_damper: string | null;
}

export type CPULevel = 1 | 2 | 3;

export interface Player {
  id: string;
  name: string;
  setting: MachineSetting;
  isCPU: boolean;
  cpuLevel: CPULevel;
}
