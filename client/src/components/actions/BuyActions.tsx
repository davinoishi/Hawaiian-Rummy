/**
 * BuyActions - Buy request controls
 */

import { useState, useEffect } from 'react';
import { useGameStore, useUIStore, useSettingsStore } from '../../store';
import { usePlayerActions, useAudio, useHaptics } from '../../hooks';

const BUY_WINDOW_DURATION_SEC = 5; // 5 seconds total

export function BuyActions() {
  const {
    canBuy,
    hasBuyRequest,
    myBuyCount,
    maxBuys,
    buyWindowRemaining,
    buyWindowActive
  } = useGameStore();

  const { requestBuy, cancelBuy } = usePlayerActions();
  const { playBuyRequest, playClick } = useAudio();
  const { buyRequest, tap } = useHaptics();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const buysRemaining = (maxBuys || 3) - (myBuyCount || 0);

  // Local countdown timer that updates every 100ms for smooth animation
  const [localRemaining, setLocalRemaining] = useState(buyWindowRemaining ?? 0);
  const [lastServerValue, setLastServerValue] = useState(buyWindowRemaining ?? 0);

  useEffect(() => {
    const serverValue = buyWindowRemaining ?? 0;

    // If buy window is not active, reset to 0
    if (!buyWindowActive) {
      setLocalRemaining(0);
      setLastServerValue(0);
      return;
    }

    // Only reset if the server value increased (new buy window started)
    // or if it's significantly different (more than 1 second higher)
    if (serverValue > lastServerValue + 0.5) {
      setLocalRemaining(serverValue);
    }
    setLastServerValue(serverValue);

    // Start countdown
    if (serverValue > 0) {
      const interval = setInterval(() => {
        setLocalRemaining(prev => Math.max(0, prev - 0.1));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [buyWindowRemaining, buyWindowActive, lastServerValue]);

  const handleRequestBuy = () => {
    playBuyRequest();
    buyRequest();
    requestBuy();
  };

  const handleCancelBuy = () => {
    playClick();
    tap();
    cancelBuy();
  };

  return (
    <div className="panel p-4 animate-slide-up">
      <div className="flex flex-col items-center gap-3">
        {/* Timer */}
        <div className="flex items-center gap-2">
          <div className={`w-full h-2 ${isLight ? 'bg-emerald-200' : 'bg-emerald-800'} rounded-full overflow-hidden`} style={{ width: '120px' }}>
            <div
              className={`h-full ${isLight ? 'bg-amber-500' : 'bg-yellow-500'} transition-all duration-100`}
              style={{ width: `${(localRemaining / BUY_WINDOW_DURATION_SEC) * 100}%` }}
            />
          </div>
          <span className={`text-sm ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
            {Math.ceil(localRemaining)}s
          </span>
        </div>

        {/* Status */}
        <div className="text-center">
          <p className={`${isLight ? 'text-emerald-900' : 'text-white'} font-medium`}>
            {hasBuyRequest ? 'Buy Requested!' : 'Buy this card?'}
          </p>
          <p className={`text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`}>
            {buysRemaining} buy{buysRemaining !== 1 ? 's' : ''} remaining this round
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {!hasBuyRequest && canBuy && (
            <button
              onClick={handleRequestBuy}
              disabled={buysRemaining <= 0}
              className="btn-primary animate-buy-pulse"
            >
              Buy (+1 card)
            </button>
          )}

          {hasBuyRequest && (
            <button
              onClick={handleCancelBuy}
              className="btn-secondary"
            >
              Cancel Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
