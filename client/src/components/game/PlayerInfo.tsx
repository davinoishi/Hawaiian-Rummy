/**
 * PlayerInfo - Displays player information
 */

import { memo, useState, useEffect } from 'react';
import type { ClientPlayer } from '@shared/game-engine/types';
import { useGameStore } from '../../store/game-store';
import { useSettingsStore } from '../../store/settings-store';

interface PlayerInfoProps {
  player: ClientPlayer;
  isCurrentTurn: boolean;
}

function PlayerInfoComponent({ player, isCurrentTurn }: PlayerInfoProps) {
  const disconnectedPlayers = useGameStore((state) => state.disconnectedPlayers);
  const [countdown, setCountdown] = useState<number | null>(null);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  // Find if this player is disconnected
  const disconnectedInfo = disconnectedPlayers.find(d => d.playerId === player.id);
  const isDisconnected = !!disconnectedInfo;

  // Update countdown timer
  useEffect(() => {
    if (!disconnectedInfo) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((disconnectedInfo.gracePeriodEnds - Date.now()) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [disconnectedInfo]);

  // Check if player is AI controlled
  const isAI = player.isAI;

  return (
    <div className={`
      flex items-center gap-3 mb-2 p-2 rounded-lg
      ${isCurrentTurn ? 'bg-yellow-500/20 animate-turn-pulse' : ''}
      ${isDisconnected ? 'opacity-60' : ''}
    `}>
      {/* Avatar */}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-bold text-white relative
        ${player.isMe ? 'bg-emerald-500' : 'bg-emerald-600'}
        ${isCurrentTurn ? 'ring-2 ring-yellow-400' : ''}
        ${isDisconnected ? 'bg-gray-500' : ''}
        ${isAI && !player.isMe ? 'bg-purple-600' : ''}
      `}>
        {player.name[0].toUpperCase()}
        {isDisconnected && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        )}
        {isAI && !isDisconnected && !player.isMe && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">AI</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${isLight ? 'text-emerald-900' : 'text-white'} font-medium truncate ${isDisconnected ? (isLight ? 'text-emerald-600' : 'text-gray-300') : ''}`}>
            {player.name}
          </span>
          {isCurrentTurn && !isDisconnected && (
            <span className={`text-xs ${isLight ? 'text-amber-900 bg-amber-200' : 'text-yellow-400 bg-yellow-400/20'} px-1.5 py-0.5 rounded`}>
              Turn
            </span>
          )}
          {isDisconnected && countdown !== null && (
            <span className={`text-xs ${isLight ? 'text-orange-700 bg-orange-200' : 'text-orange-400 bg-orange-400/20'} px-1.5 py-0.5 rounded animate-pulse`}>
              Disconnected ({countdown}s)
            </span>
          )}
          {isAI && !isDisconnected && !player.isMe && (
            <span className={`text-xs ${isLight ? 'text-purple-700 bg-purple-200' : 'text-purple-400 bg-purple-400/20'} px-1.5 py-0.5 rounded`}>
              AI
            </span>
          )}
        </div>
        <div className={`flex items-center gap-3 text-xs ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`}>
          <span>{player.handSize} cards</span>
          <span>{player.score} pts</span>
          {player.wins > 0 && <span>{player.wins} wins</span>}
        </div>
      </div>

      {/* Met requirements indicator */}
      {player.hasMetRequirements && (
        <div className="text-green-400" title="Met requirements">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )}
    </div>
  );
}

export const PlayerInfo = memo(PlayerInfoComponent);
