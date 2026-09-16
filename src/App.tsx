import { useState, useMemo } from 'react';
import { Garage } from './Garage';
import { Race } from './Race';
import type { MachineSetting, PartStats } from './types';
import { PARTS } from './data';
import './index.css';

const DEFAULT_SETTING: MachineSetting = {
  body: 'b_magnum',
  chassis: 'c_super1',
  motor: 'm_normal',
  gear: 'g_std',
  tire_front: 'tf_slick',
  tire_rear: 'tr_slick',
  roller_front: 'rf_plastic',
  roller_rear: 'rr_plastic',
  frp: null,
  mass_damper: null,
};

function App() {
  const [currentScreen, setCurrentScreen] = useState<'garage' | 'race'>('garage');
  const [setting, setSetting] = useState<MachineSetting>(DEFAULT_SETTING);

  const totalStats = useMemo(() => {
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
  }, [setting]);

  return (
    <div className="app-container">
      {currentScreen === 'garage' && (
        <Garage 
          setting={setting} 
          setSetting={setSetting} 
          totalStats={totalStats}
          onStartRace={() => setCurrentScreen('race')} 
        />
      )}
      {currentScreen === 'race' && (
        <Race 
          setting={setting}
          totalStats={totalStats}
          onBackToGarage={() => setCurrentScreen('garage')} 
        />
      )}
    </div>
  );
}

export default App;
