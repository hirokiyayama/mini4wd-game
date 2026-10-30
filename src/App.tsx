import { useState, useMemo } from 'react';
import { Garage } from './Garage';
import { Race } from './Race';
import type { CPULevel, MachineSetting, Player } from './types';
import { computeTotalStats, randomSetting } from './data';
import type { CourseId } from './courses';
import './index.css';

const BASE_SETTING: MachineSetting = {
  body: 'b_magnum',
  chassis: 'c_super1',
  motor: 'm_normal',
  battery: 'bat_powerchamp',
  gear: 'g_std',
  tire_front: 'tf_slick',
  tire_rear: 'tr_slick',
  roller_front: 'rf_plastic',
  roller_rear: 'rr_plastic',
  mass_damper: null,
  stabilizer: null,
};

const DEFAULT_CPU_LEVEL: CPULevel = 2;

const DEFAULT_PLAYERS: Player[] = [
  { id: 'p1', name: 'プレイヤー1', setting: { ...BASE_SETTING, body: 'b_magnum' }, isCPU: false, cpuLevel: DEFAULT_CPU_LEVEL },
  { id: 'p2', name: 'CPU 1', setting: randomSetting(DEFAULT_CPU_LEVEL), isCPU: true, cpuLevel: DEFAULT_CPU_LEVEL },
  { id: 'p3', name: 'CPU 2', setting: randomSetting(DEFAULT_CPU_LEVEL), isCPU: true, cpuLevel: DEFAULT_CPU_LEVEL },
];

function App() {
  const [currentScreen, setCurrentScreen] = useState<'garage' | 'race'>('garage');
  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [courseId, setCourseId] = useState<CourseId>('oval');

  const updateActiveSetting = (updater: (s: MachineSetting) => MachineSetting) => {
    setPlayers(prev => prev.map((p, i) => (i === activePlayerIndex ? { ...p, setting: updater(p.setting) } : p)));
  };

  const updateActiveName = (name: string) => {
    setPlayers(prev => prev.map((p, i) => (i === activePlayerIndex ? { ...p, name } : p)));
  };

  const toggleActiveCPU = () => {
    setPlayers(prev => prev.map((p, i) => {
      if (i !== activePlayerIndex) return p;
      const isCPU = !p.isCPU;
      return { ...p, isCPU, setting: isCPU ? randomSetting(p.cpuLevel) : p.setting };
    }));
  };

  const rerollActiveCPU = () => {
    setPlayers(prev => prev.map((p, i) => (i === activePlayerIndex ? { ...p, setting: randomSetting(p.cpuLevel) } : p)));
  };

  const setActiveCPULevel = (level: CPULevel) => {
    setPlayers(prev => prev.map((p, i) => (i === activePlayerIndex ? { ...p, cpuLevel: level, setting: randomSetting(level) } : p)));
  };

  const activeTotalStats = useMemo(
    () => computeTotalStats(players[activePlayerIndex].setting),
    [players, activePlayerIndex]
  );

  const racePlayers = useMemo(
    () => players.map(p => ({ ...p, totalStats: computeTotalStats(p.setting) })),
    [players]
  );

  return (
    <div className="app-container">
      {currentScreen === 'garage' && (
        <Garage
          players={players}
          activePlayerIndex={activePlayerIndex}
          setActivePlayerIndex={setActivePlayerIndex}
          onChangeSetting={updateActiveSetting}
          onChangeName={updateActiveName}
          onToggleCPU={toggleActiveCPU}
          onRerollCPU={rerollActiveCPU}
          onSetCPULevel={setActiveCPULevel}
          totalStats={activeTotalStats}
          courseId={courseId}
          setCourseId={setCourseId}
          onStartRace={() => setCurrentScreen('race')}
        />
      )}
      {currentScreen === 'race' && (
        <Race
          players={racePlayers}
          courseId={courseId}
          onBackToGarage={() => setCurrentScreen('garage')}
        />
      )}
    </div>
  );
}

export default App;
