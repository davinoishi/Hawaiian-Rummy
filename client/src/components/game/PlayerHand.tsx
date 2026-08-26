/**
 * PlayerHand - Displays the player's hand of cards
 */

import { useCallback } from 'react';
import { Card } from './Card';
import { useGameStore, useUIStore, useSettingsStore } from '../../store';
import { useCardSelection, usePlayerActions, useHaptics } from '../../hooks';
import { sortHand, type HandSortMode } from '@shared/game-engine/card-utils';

export function PlayerHand() {
  const myHand = useGameStore((state) => state.myHand) || [];
  const isMyTurn = useGameStore((state) => state.isMyTurn);
  const focusedCardIndex = useUIStore((state) => state.focusedCardIndex);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const {
    selectedCardIds,
    handleCardClick,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDropOnCard,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isCardSelected,
    isCardHighlighted,
    draggedCardId,
    dragOverCardId,
    touchDraggedCardId,
    touchDragPosition
  } = useCardSelection();
  const { reorderHand } = usePlayerActions();
  const { tap } = useHaptics();

  // Handle card reorder via drag and drop
  const handleReorder = useCallback((fromId: string, toId: string) => {
    const fromIndex = myHand.findIndex(c => c.id === fromId);
    const toIndex = myHand.findIndex(c => c.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const newHand = [...myHand];
    const [removed] = newHand.splice(fromIndex, 1);
    newHand.splice(toIndex, 0, removed);
    reorderHand(newHand.map(c => c.id));
  }, [myHand, reorderHand]);

  // Sorting is a one-shot action, deliberately. An earlier version kept a
  // sticky sort and re-applied it whenever the hand changed, which made manual
  // arrangement impossible: a dragged card was reordered by the server, echoed
  // back, and immediately sorted away again. In later rounds players group
  // their hand into prospective sets and runs by hand, and that grouping has to
  // survive a draw.
  const handleSort = useCallback((mode: HandSortMode) => {
    tap();
    reorderHand(sortHand(myHand, mode).map(c => c.id));
  }, [myHand, reorderHand, tap]);

  if (!myHand || myHand.length === 0) {
    return (
      <div className={`p-4 text-center ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
        No cards in hand
      </div>
    );
  }

  const focusedCardId =
    focusedCardIndex >= 0 && focusedCardIndex < myHand.length
      ? myHand[focusedCardIndex]?.id ?? null
      : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={`${isLight ? 'text-emerald-900' : 'text-white'} font-medium`}>
          Your Hand ({myHand.length} cards)
          {selectedCardIds.length > 0 && (
            <span className={`${isLight ? 'text-emerald-700' : 'text-emerald-200'} font-normal ml-2`}>
              • {selectedCardIds.length} selected
            </span>
          )}
        </h3>
      </div>

      {/* Cards */}
      <div className="flex flex-wrap gap-1 sm:gap-2 justify-center">
        {myHand.map((card) => {
          const isFocused = card.id === focusedCardId;
          const isTouchDragging = touchDraggedCardId === card.id;

          return (
            <div
              key={card.id}
              // Read back by useCardSelection to resolve the card under a finger:
              // touch events carry no drop target of their own.
              data-card-id={card.id}
              className="relative touch-pan-y"
              onDragOver={(e) => {
                e.preventDefault();
                handleDragOver(e, card.id);
              }}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDropOnCard(card.id, handleReorder)}
            >
              {/* Drop indicator */}
              {dragOverCardId === card.id && (
                <div className="absolute -left-1 top-0 bottom-0 w-1 bg-blue-500 rounded-full z-10 animate-pulse" />
              )}

              {/* Keyboard focus indicator */}
              {isFocused && (
                <div className="absolute -inset-1 border-2 border-cyan-400 rounded-lg z-10 pointer-events-none animate-pulse" />
              )}

              <Card
                card={card}
                isSelected={isCardSelected(card.id)}
                isHighlighted={isCardHighlighted(card.id)}
                isDragging={draggedCardId === card.id || isTouchDragging}
                isDisabled={!isMyTurn}
                onClick={() => handleCardClick(card.id)}
                onDragStart={(e) => handleDragStart(e, card.id)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, card.id, { rank: card.rank, suit: card.suit })}
                onTouchMove={handleTouchMove}
                onTouchEnd={(e) => handleTouchEnd(
                  e,
                  () => handleCardClick(card.id),
                  handleReorder
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Drag ghost - follows the finger during a touch reorder. pointer-events
          must stay off or it would shadow the card under the finger and break
          elementFromPoint target detection. */}
      {touchDraggedCardId && touchDragPosition && (
        <div
          className="fixed z-50 pointer-events-none opacity-80"
          style={{
            left: touchDragPosition.x,
            top: touchDragPosition.y,
            transform: 'translate(-50%, -50%) scale(1.1)'
          }}
        >
          {(() => {
            const card = myHand.find(c => c.id === touchDraggedCardId);
            return card ? <Card card={card} readOnly /> : null;
          })()}
        </div>
      )}

      {/* Sort buttons - bottom left */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => handleSort('rank')}
          className="btn-ghost px-3 py-1 text-sm"
          title="Sort your hand by rank now"
        >
          Sort by Rank
        </button>
        <button
          onClick={() => handleSort('suit')}
          className="btn-ghost px-3 py-1 text-sm"
          title="Sort your hand by suit now"
        >
          Sort by Suit
        </button>
      </div>
    </div>
  );
}
