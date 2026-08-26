/**
 * DiscardPile - Shows the discard pile and allows taking/dropping cards
 */

import { useCallback } from 'react';
import { Card } from './Card';
import { useGameStore, useUIStore, useSettingsStore } from '../../store';
import { usePlayerActions, useHaptics } from '../../hooks';
import type { Card as CardType } from '@shared/game-engine/types';

interface DiscardPileProps {
  topCard?: CardType;
}

export function DiscardPile({ topCard }: DiscardPileProps) {
  const { canTakeDiscard, isMyTurn, gamePhase, discardPile } = useGameStore();
  const { dragOverDiscard, setDragOverDiscard, discardAnimation } = useUIStore();
  const { takeDiscard, discard } = usePlayerActions();
  const { tap, cardDrop } = useHaptics();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  // The server re-broadcasts when the buy window closes, so canTakeDiscard is
  // authoritative here - no local expiry timer needed.
  const canInteract = canTakeDiscard ?? false;
  const pileSize = discardPile?.length ?? 0;

  const handleClick = useCallback(() => {
    if (!canInteract) return;
    tap();
    takeDiscard();
  }, [canInteract, tap, takeDiscard]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedCardId = useUIStore.getState().draggedCardId;
    if (draggedCardId && isMyTurn && gamePhase === 'discard') {
      cardDrop();
      discard(draggedCardId);
    }
    setDragOverDiscard(false);
  }, [isMyTurn, gamePhase, cardDrop, discard, setDragOverDiscard]);

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`text-xs ${isLight ? 'text-emerald-800' : 'text-emerald-300'} font-medium`}>
        Discard{pileSize > 0 ? ` (${pileSize})` : ''}
      </span>

      <div
        className={`
          relative w-16 h-24 sm:w-20 sm:h-28 rounded-lg
          ${!topCard ? `border-2 border-dashed ${isLight ? 'border-emerald-400' : 'border-emerald-600/50'}` : ''}
          ${canInteract ? 'cursor-pointer' : ''}
          ${dragOverDiscard ? 'ring-2 ring-green-400 bg-green-600/30' : ''}
          ${discardAnimation ? 'animate-meld-snap' : ''}
        `}
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          if (isMyTurn && gamePhase === 'discard') {
            setDragOverDiscard(true);
          }
        }}
        onDragLeave={() => setDragOverDiscard(false)}
        onDrop={handleDrop}
      >
        {topCard ? (
          <Card
            card={topCard}
            isDisabled={!canInteract}
            size="md"
            className={canInteract ? 'hover:ring-2 hover:ring-yellow-400' : ''}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className={`${isLight ? 'text-emerald-600' : 'text-emerald-600'} text-xs`}>Empty</span>
          </div>
        )}

        {/* Take indicator */}
        {canInteract && topCard && (
          <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] ${isLight ? 'text-amber-700 font-medium' : 'text-yellow-400'} whitespace-nowrap`}>
            Click to take
          </div>
        )}

        {/* Drop indicator */}
        {dragOverDiscard && (
          <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
            <span className="text-green-300 text-xs font-bold">Drop to discard</span>
          </div>
        )}
      </div>
    </div>
  );
}
