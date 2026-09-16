import React, { useState } from 'react';
import { PARTS } from './data';
import type { MachineSetting, PartType, PartStats, Player } from './types';
import { CircuitScene } from './CircuitScene';
import { COURSES, type CourseId } from './courses';

interface GarageProps {
  players: Player[];
  activePlayerIndex: number;
  setActivePlayerIndex: (i: number) => void;
  onChangeSetting: (updater: (s: MachineSetting) => MachineSetting) => void;
  onChangeName: (name: string) => void;
  totalStats: PartStats;
  courseId: CourseId;
  setCourseId: (id: CourseId) => void;
  onStartRace: () => void;
}

const SLOT_LABELS: Record<PartType, string> = {
  body: 'ボディ',
  chassis: 'シャーシ',
  motor: 'モーター',
  gear: 'ギヤ',
  tire_front: 'フロントタイヤ',
  tire_rear: 'リアタイヤ',
  roller_front: 'フロントローラー',
  roller_rear: 'リアローラー',
  mass_damper: 'マスダンパー',
};

// パーツカテゴリのTabシステム
const PART_TABS: PartType[] = ['body', 'chassis', 'motor', 'gear', 'tire_front', 'tire_rear', 'roller_front', 'roller_rear', 'mass_damper'];

// ゲージの最大値（ステータスのスケーリング用）
const STAT_MAX = { speed: 400, power: 400, cornering: 300, stamina: 100, weight: 200 };

interface StatGaugeProps { label: string; icon: string; value: number; max: number; color: string; }
const StatGauge: React.FC<StatGaugeProps> = ({ label, icon, value, max, color }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="stat-row">
      <div className="stat-row-head">
        <span className="stat-row-label">
          <span className="stat-row-icon">{icon}</span>{label}
        </span>
        <span className="stat-row-value">{value}</span>
      </div>
      <div className="stat-gauge-track">
        <div
          className="stat-gauge-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 10px ${color}, 0 0 2px ${color}`,
          }}
        />
        <div className="stat-gauge-sheen" />
      </div>
    </div>
  );
};

const DEFAULT_BODY_IMAGE = PARTS.find(p => p.id === 'b_magnum')!.image!;

function getBodyImage(id: string | null): string {
  return PARTS.find(p => p.id === id)?.image ?? DEFAULT_BODY_IMAGE;
}

export const Garage: React.FC<GarageProps> = ({
  players,
  activePlayerIndex,
  setActivePlayerIndex,
  onChangeSetting,
  onChangeName,
  totalStats,
  courseId,
  setCourseId,
  onStartRace,
}) => {
  const [activeTab, setActiveTab] = useState<PartType>('body');
  const [pressedBtn, setPressedBtn] = useState(false);

  const activePlayer = players[activePlayerIndex];
  const setting = activePlayer.setting;

  const handleSelectPart = (partId: string | null) => {
    onChangeSetting(prev => ({ ...prev, [activeTab]: partId }));
  };

  // ボディ画像のパスを取得
  const carImage = getBodyImage(setting.body);

  // 現在のタブのパーツ一覧
  const tabParts = PARTS.filter(p => p.type === activeTab);
  const nullable = activeTab === 'mass_damper';

  // 選択中のボディ名
  const selectedBodyName = PARTS.find(p => p.id === setting.body)?.name ?? '未選択';

  return (
    <div className="mini4wd-screen">
      <CircuitScene courseId={courseId} compact />

      {/* subtle vignette + scanline for depth/polish */}
      <div className="screen-vignette" />
      <div className="screen-scanline" />

      {/* ─── HEADER ─── */}
      <div className="hud-header">
        <div className="brand-badge">
          <span className="brand-flag">🏁</span>
          <div className="brand-text">
            <span className="brand-line1">MINI 4WD</span>
            <span className="brand-line2">SPEED BATTLE</span>
          </div>
        </div>
        <div className="course-select">
          <span className="course-select-label">コース</span>
          {COURSES.map(c => (
            <button
              key={c.id}
              className={`course-btn${courseId === c.id ? ' is-active' : ''}`}
              onClick={() => setCourseId(c.id)}
              title={c.description}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="selected-pill">
          <span className="selected-pill-label">選択中のマシン</span>
          <span className="selected-pill-value">{selectedBodyName}</span>
        </div>
      </div>

      {/* ─── MAIN LAYOUT ─── */}
      <div className="main-layout">

        {/* ══════ LEFT PANEL: STATS ══════ */}
        <div className="glass-panel stats-panel">
          <div className="player-tabs">
            {players.map((p, i) => (
              <button
                key={p.id}
                className={`player-tab${i === activePlayerIndex ? ' is-active' : ''}`}
                onClick={() => setActivePlayerIndex(i)}
              >
                P{i + 1}
              </button>
            ))}
          </div>
          <input
            className="player-name-input"
            value={activePlayer.name}
            onChange={e => onChangeName(e.target.value)}
            maxLength={12}
            placeholder={`プレイヤー${activePlayerIndex + 1}`}
          />

          <div className="panel-title">マシンステータス</div>
          <StatGauge label="スピード" icon="⚡" value={totalStats.speed}    max={STAT_MAX.speed}    color="#5aabff" />
          <StatGauge label="パワー"   icon="🔥" value={totalStats.power}    max={STAT_MAX.power}    color="#ff6b35" />
          <StatGauge label="コーナー" icon="🎯" value={totalStats.cornering} max={STAT_MAX.cornering} color="#00e5ff" />
          <StatGauge label="スタミナ" icon="💚" value={totalStats.stamina}  max={STAT_MAX.stamina}  color="#4ade80" />
          <div className="weight-box">
            <span className="weight-label">🔩 重さ</span>
            <span className="weight-value">{totalStats.weight}g</span>
          </div>

          <div className="loadout-list">
            <div className="loadout-title">現在の装備</div>
            {PART_TABS.map(slot => {
              const partId = setting[slot];
              const part = partId ? PARTS.find(p => p.id === partId) : null;
              return (
                <div
                  key={slot}
                  className={`loadout-row${activeTab === slot ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(slot)}
                >
                  <span className="loadout-slot">{SLOT_LABELS[slot]}</span>
                  <span className={`loadout-part${part ? '' : ' is-empty'}`}>{part ? part.name : '未装着'}</span>
                </div>
              );
            })}
          </div>

          <div className="catchphrase">
            小さなマシンに<br />無限の可能性を。
          </div>
        </div>

        {/* ══════ CENTER: CAR PREVIEW ══════ */}
        <div className="car-stage">
          <div className="podium-floor" />
          <div className="podium-dais" />
          <div className="podium-spotlight" />

          <div className="car-float-wrap">
            <img src={carImage} alt="Machine" className="car-photo" />
            <img src={carImage} alt="" aria-hidden className="car-reflection" />
          </div>

          {/* Race start button */}
          <div className="start-btn-wrap">
            <button
              className={`start-btn${pressedBtn ? ' is-pressed' : ''}`}
              onMouseDown={() => setPressedBtn(true)}
              onMouseUp={() => { setPressedBtn(false); onStartRace(); }}
              onMouseLeave={() => setPressedBtn(false)}
            >
              <span className="start-btn-flag">🏁</span>
              レース開始！
            </button>
          </div>
        </div>

        {/* ══════ RIGHT PANEL: PARTS ══════ */}
        <div className="glass-panel parts-panel">
          {/* Tabs */}
          <div className="tab-bar">
            {PART_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`tab-btn${activeTab === tab ? ' is-active' : ''}`}
              >
                {SLOT_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Part cards */}
          <div className="part-list">
            {nullable && (
              <PartCard
                name="外す"
                description="このスロットのパーツを取り外す"
                icon="✕"
                selected={setting[activeTab] === null}
                onClick={() => handleSelectPart(null)}
                stats={null}
              />
            )}
            {tabParts.map(part => (
              <PartCard
                key={part.id}
                name={part.name}
                description={getPartDescription(part.id)}
                icon={getPartIcon(activeTab)}
                thumbnail={activeTab === 'body' ? getBodyImage(part.id) : part.image}
                thumbnailFit={activeTab === 'body' ? 'crop' : 'contain'}
                selected={setting[activeTab] === part.id}
                onClick={() => handleSelectPart(part.id)}
                stats={`SP ${part.stats.speed} / PW ${part.stats.power} / CO ${part.stats.cornering} / ${part.stats.weight}g`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Part Card Component ──────────────────────────
interface PartCardProps {
  name: string;
  description: string;
  icon: string;
  thumbnail?: string;
  thumbnailFit?: 'crop' | 'contain';
  selected: boolean;
  onClick: () => void;
  stats: string | null;
}
const PartCard: React.FC<PartCardProps> = ({ name, description, icon, thumbnail, thumbnailFit = 'contain', selected, onClick, stats }) => {
  return (
    <div
      onClick={onClick}
      className={`part-card${selected ? ' is-selected' : ''}`}
    >
      {selected && <div className="part-card-ribbon">✓</div>}
      <div className="part-card-icon">
        {thumbnail ? <img src={thumbnail} alt="" className={`part-card-thumb part-card-thumb--${thumbnailFit}`} /> : icon}
      </div>
      <div className="part-card-body">
        <div className="part-card-name">{name}</div>
        <div className="part-card-desc">{description}</div>
        {stats && <div className="part-card-stats">{stats}</div>}
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────
function getPartIcon(type: PartType): string {
  const icons: Record<PartType, string> = {
    body: '🚗', chassis: '⚙️', motor: '⚡', gear: '🔧',
    tire_front: '⭕', tire_rear: '⭕', roller_front: '🔵', roller_rear: '🔵',
    mass_damper: '🔩',
  };
  return icons[type];
}

function getPartDescription(id: string): string {
  const desc: Record<string, string> = {
    b_magnum:      '圧倒的な最高速を誇るスピード特化ボディ。コーナーはやや苦手。',
    b_tridagger:   '高い最高速を誇るスピード特化ボディ。パワーはやや控えめ。',
    b_beakspider:  '超軽量・低重心でコーナリング性能はトップクラス。パワーは控えめ。',
    b_sonic:       '空力特性に優れたコーナリング特化ボディ。',
    b_spinaxe:     '軽快なハンドリングが持ち味のコーナリング特化ボディ。',
    b_brockeng:    '重量級ボディに強力なパワーを秘めたパワーファイター。',
    b_protosaberjb:'スピード・パワー・コーナーを高い次元でまとめたバランス型ボディ。',
    b_raystinger:  '弱点のないオールラウンダー。安定して走れるバランス型ボディ。',
    c_super1:    '安定した走行性能を発揮するベーシックシャーシ。',
    c_tz:        'コーナー安定性に定評のある人気シャーシ。',
    c_ar:        'スタミナ重視の高耐久アドバンスドシャーシ。',
    m_normal:    '標準的なモーター。扱いやすさが魅力。',
    m_rev:       '最高速に特化したハイレスポンスモーター。',
    m_torque:    'パワー重視で加速力に優れたトルク系。',
    m_hyper:     '圧倒的なパワーを誇る最強モーター。',
    g_std:       'バランスの取れたスタンダードギヤ比。',
    g_super:     'スピード特化の超高速ギヤ比。',
    tf_slick:    'グリップ力の高いフロントタイヤ。',
    tf_sponge:   'コーナーで真価を発揮するスポンジタイヤ。',
    tf_lowhi:    '重心を下げて安定性を高めるローハイトタイヤ。',
    tr_slick:    '安定性の高いリアスリックタイヤ。',
    tr_sponge:   'コーナリングを支えるリアスポンジタイヤ。',
    tr_lowhi:    '重心を下げて安定性を高めるローハイトタイヤ。',
    rf_plastic:  'コーナーでの安定性を高めるパーツ。',
    rf_alum:     '高精度アルミ製で摩擦が少ないローラー。',
    rf_alum2:    '2段構造でさらに安定性を高めたアルミローラー。',
    rr_plastic:  'リアの安定性を向上させるローラー。',
    rr_alum:     '超低摩擦のアルミ製リアローラー。',
    rr_alum2:    '2段構造でさらに安定性を高めたアルミローラー。',
    md_std:      'ジャンプ後の着地を安定させる重り。',
  };
  return desc[id] ?? '詳細情報なし';
}
