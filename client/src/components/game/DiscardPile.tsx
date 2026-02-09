/**
 * DiscardPile - Shows the discard pile and allows taking/dropping cards
 */

import { useCallback, useState, useEffect } from 'react';
import { Card } from './Card';
import { useGameStore, useUIStore } from '../../store';
import { usePlayerActions, useHaptics } from '../../hooks';
import type { Card as CardType } from '@shared/game-engine/types';

interface DiscardPileProps {
  topCard?: CardType;
}

export function DiscardPile({ topCard }: DiscardPileProps) {
  const { canTakeDiscard, isMyTurn, gamePhase, buyWindowActive, buyWindowRemaining } = useGameStore();
  const { dragOverDiscard, setDragOverDiscard, discardAnimation } = useUIStore();
  const { takeDiscard, discard } = usePlayerActions();
  const { tap, cardDrop } = useHaptics();

  // Track local buy window state with a countdown timer
  const [localBuyWindowExpired, setLocalBuyWindowExpired] = useState(false);

  // When buy window state changes from server, reset local state
  useEffect(() => {
    if (buyWindowActive && (buyWindowRemaining ?? 0) > 0) {
      setLocalBuyWindowExpired(false);
      // Set a timer to mark window as expired
      const timer = setTimeout(() => {
        setLocalBuyWindowExpired(true);
      }, (buyWindowRemaining ?? 0) * 1000);
      return () => clearTimeout(timer);
    } else if (!buyWindowActive) {
      setLocalBuyWindowExpired(true);
    }
  }, [buyWindowActive, buyWindowRemaining]);

  // Calculate if we can interact - use local window tracking
  const canInteractLocal = isMyTurn && gamePhase === 'draw' && (canTakeDiscard || localBuyWindowExpired);

  const handleClick = useCallback(() => {
    if (!canInteractLocal) return;
    tap();
    takeDiscard();
  }, [canInteractLocal, tap, takeDiscard]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedCardId = useUIStore.getState().draggedCardId;
    if (draggedCardId && isMyTurn && gamePhase === 'discard') {
      cardDrop();
      discard(draggedCardId);
    }
    setDragOverDiscard(false);
  }, [isMyTurn, gamePhase, cardDrop, discard, setDragOverDiscard]);

  const canInteract = canInteractLocal;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-emerald-300 font-medium">Discard</span>

      <div
        className={`
          relative w-16 h-24 sm:w-20 sm:h-28 rounded-lg
          ${!topCard ? 'border-2 border-dashed border-emerald-600/50' : ''}
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
            <span className="text-emerald-600 text-xs">Empty</span>
          </div>
        )}

        {/* Take indicator */}
        {canInteract && topCard && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-yellow-400 whitespace-nowrap">
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
