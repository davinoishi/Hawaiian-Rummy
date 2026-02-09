/**
 * PlayerInfo - Displays player information
 */

import { memo } from 'react';
import type { ClientPlayer } from '@shared/game-engine/types';

interface PlayerInfoProps {
  player: ClientPlayer;
  isCurrentTurn: boolean;
}

function PlayerInfoComponent({ player, isCurrentTurn }: PlayerInfoProps) {
  return (
    <div className={`
      flex items-center gap-3 mb-2 p-2 rounded-lg
      ${isCurrentTurn ? 'bg-yellow-500/20 animate-turn-pulse' : ''}
    `}>
      {/* Avatar */}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-bold text-white
        ${player.isMe ? 'bg-emerald-500' : 'bg-emerald-600'}
        ${isCurrentTurn ? 'ring-2 ring-yellow-400' : ''}
      `}>
        {player.name[0].toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium truncate">
            {player.name}
          </span>
          {isCurrentTurn && (
            <span className="text-xs text-yellow-400 bg-yellow-400/20 px-1.5 py-0.5 rounded">
              Turn
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-emerald-200">
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
