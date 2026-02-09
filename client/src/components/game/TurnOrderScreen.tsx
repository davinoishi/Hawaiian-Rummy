/**
 * TurnOrderScreen - Shows turn order selection animation
 */

import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../store';
import { useAudio } from '../../hooks';

export function TurnOrderScreen() {
  const { turnOrderData, turnOrderCountdown } = useGameStore();
  const [showAnimation, setShowAnimation] = useState(false);
  const { playCountdown } = useAudio();
  const lastCountdown = useRef<number | null>(null);

  useEffect(() => {
    if (turnOrderData?.justSelected) {
      setShowAnimation(true);
      const timer = setTimeout(() => setShowAnimation(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [turnOrderData?.justSelected]);

  // Play countdown sound when countdown changes
  useEffect(() => {
    if (turnOrderCountdown !== null && turnOrderCountdown !== lastCountdown.current) {
      lastCountdown.current = turnOrderCountdown;
      if (turnOrderCountdown > 0 && turnOrderCountdown <= 5) {
        playCountdown();
      }
    }
  }, [turnOrderCountdown, playCountdown]);

  if (!turnOrderData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Setting up turn order...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel p-6 sm:p-8 w-full max-w-lg text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Turn Order</h2>
        <p className="text-emerald-200 mb-6">
          {turnOrderData.phase === 'selecting'
            ? 'Determining play order...'
            : 'Turn order set!'}
        </p>

        {/* Selected order */}
        {turnOrderData.selectedOrder.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-emerald-300 mb-3">Play Order</h3>
            <div className="space-y-2">
              {turnOrderData.selectedOrder.map((player, index) => (
                <div
                  key={player.playerId}
                  className={`
                    flex items-center justify-between p-3 rounded-lg
                    ${player.playerId === turnOrderData.justSelected && showAnimation
                      ? 'bg-yellow-500/30 animate-pulse'
                      : 'bg-emerald-700/50'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </span>
                    <span className="text-white">{player.name}</span>
                  </div>
                  {index === 0 && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded">
                      Goes First
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remaining players */}
        {turnOrderData.remainingPlayers && turnOrderData.remainingPlayers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-emerald-300 mb-3">Selecting...</h3>
            <div className="flex justify-center gap-2">
              {turnOrderData.remainingPlayers.map((player) => (
                <div
                  key={player.playerId}
                  className="px-4 py-2 rounded-lg bg-emerald-800/50 text-emerald-200 text-sm"
                >
                  {player.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Countdown */}
        {turnOrderCountdown !== null && (
          <div className="mt-4">
            <p className="text-emerald-200 text-sm mb-2">Game starting in...</p>
            <div className="text-4xl font-bold text-yellow-400">
              {turnOrderCountdown}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
