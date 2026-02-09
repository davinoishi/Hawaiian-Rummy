/**
 * RoundInfo - Displays current round and requirements
 */

import { memo } from 'react';
import { useUIStore } from '../../store';
import type { RoundRequirement } from '@shared/game-engine/types';

interface RoundInfoProps {
  round: number;
  requirement: RoundRequirement;
  isMyTurn: boolean;
  hasMetRequirements: boolean;
}

function RoundInfoComponent({ round, requirement, isMyTurn, hasMetRequirements }: RoundInfoProps) {
  const setShowHowToPlay = useUIStore((state) => state.setShowHowToPlay);

  return (
    <div className="panel p-3 mb-4">
      <div className="flex items-center justify-between gap-4">
        {/* Round number */}
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">
            Round {round}
          </span>
          {isMyTurn && (
            <span className="text-xs bg-yellow-500 text-yellow-900 px-2 py-1 rounded-full font-medium">
              Your Turn
            </span>
          )}
        </div>

        {/* Requirement */}
        <div className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
          ${hasMetRequirements
            ? 'bg-green-500/20 text-green-300 border border-green-500/50'
            : 'bg-emerald-700/50 text-emerald-200'}
        `}>
          {hasMetRequirements && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span>
            {hasMetRequirements ? 'Requirements Met!' : `Goal: ${requirement?.description || ''}`}
          </span>
        </div>

        {/* Help button */}
        <button
          onClick={() => setShowHowToPlay(true)}
          className="btn-ghost p-2"
          title="How to Play"
        >
          <svg className="w-5 h-5 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const RoundInfo = memo(RoundInfoComponent);
