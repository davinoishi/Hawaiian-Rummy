/**
 * DeckArea - Shows the draw deck
 */

import { useCallback } from 'react';
import { Card } from './Card';
import { useGameStore } from '../../store';
import { usePlayerActions, useHaptics, useAudio } from '../../hooks';

export function DeckArea() {
  const { deckSize: rawDeckSize, canDraw, isMyTurn } = useGameStore();
  const deckSize = rawDeckSize ?? 0;
  const { drawCard } = usePlayerActions();
  const { tap } = useHaptics();
  const { playCardDraw } = useAudio();

  const handleClick = useCallback(() => {
    if (!isMyTurn || !canDraw || deckSize === 0) return;
    tap();
    playCardDraw();
    drawCard();
  }, [isMyTurn, canDraw, deckSize, tap, playCardDraw, drawCard]);

  const canInteract = isMyTurn && canDraw && deckSize > 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-emerald-300 font-medium">
        Deck ({deckSize})
      </span>

      <div
        className={`
          relative
          ${canInteract ? 'cursor-pointer' : ''}
        `}
        onClick={handleClick}
      >
        {/* Stack effect */}
        <div className="relative">
          {deckSize > 2 && (
            <div className="absolute top-1 left-1 w-16 h-24 sm:w-20 sm:h-28 rounded-lg card-back opacity-60" />
          )}
          {deckSize > 1 && (
            <div className="absolute top-0.5 left-0.5 w-16 h-24 sm:w-20 sm:h-28 rounded-lg card-back opacity-80" />
          )}

          {/* Top card */}
          {deckSize > 0 ? (
            <div className={`
              w-16 h-24 sm:w-20 sm:h-28 rounded-lg card-back shadow-md relative
              ${canInteract ? 'hover:ring-2 hover:ring-yellow-400 transition-all' : ''}
            `}>
              {canInteract && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/70 text-xs font-medium bg-blue-800/50 px-2 py-1 rounded">
                    Draw
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-emerald-600/50 flex items-center justify-center">
              <span className="text-emerald-600 text-xs">Empty</span>
            </div>
          )}
        </div>

        {/* Draw indicator */}
        {canInteract && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-yellow-400 whitespace-nowrap">
            Click to draw
          </div>
        )}
      </div>
    </div>
  );
}
