import React, { useEffect, useState } from 'react';
import { isMuted, subscribeMuted, toggleMuted } from './audioSettings';

// BGM・効果音のオン/オフを切り替えるボタン。ガレージ・レース両画面で共有し、
// 状態はaudioSettingsモジュール経由で同期される（どちらの画面から切り替えても反映される）
export const SoundToggle: React.FC<{ className?: string }> = ({ className }) => {
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => subscribeMuted(setMutedState), []);

  return (
    <button
      type="button"
      className={`sound-toggle-btn${muted ? ' is-muted' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => toggleMuted()}
      title={muted ? 'サウンドをオンにする' : 'サウンドをオフにする'}
      aria-pressed={!muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
};
