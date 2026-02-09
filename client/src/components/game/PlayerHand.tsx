/**
 * PlayerHand - Displays the player's hand of cards
 */

import { useCallback, useMemo } from 'react';
import { Card } from './Card';
import { useGameStore, useUIStore } from '../../store';
import { useCardSelection, usePlayerActions, useHaptics } from '../../hooks';
import type { Card as CardType } from '@shared/game-engine/types';
import { sortCardsByRank, groupByRank, groupBySuit } from '@shared/game-engine/card-utils';

type SortMode = 'none' | 'rank' | 'suit';

export function PlayerHand() {
  const myHand = useGameStore((state) => state.myHand) || [];
  const isMyTurn = useGameStore((state) => state.isMyTurn);
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
    dragOverCardId
  } = useCardSelection();
  const { reorderHand } = usePlayerActions();
  const { tap } = useHaptics();

  // Sorting
  const [sortMode, setSortMode] = useMemo(() => {
    // Return current state from UI store
    const state = useUIStore.getState();
    const getSortMode = (): SortMode => 'none';
    const setSortMode = (mode: SortMode) => {};
    return [getSortMode(), setSortMode] as const;
  }, []);

  // Sort cards based on mode
  const sortedHand = useMemo(() => {
    if (!myHand || myHand.length === 0) return [];

    switch (sortMode) {
      case 'rank':
        return sortCardsByRank([...myHand]);
      case 'suit': {
        const grouped = groupBySuit([...myHand]);
        const result: CardType[] = [];
        // Order: spades, hearts, diamonds, clubs
        (['♠', '♥', '♦', '♣'] as const).forEach(suit => {
          const suitCards = grouped.get(suit);
          if (suitCards) {
            result.push(...sortCardsByRank(suitCards));
          }
        });
        // Add jokers at the end
        myHand.filter(c => c.rank === 'Joker' || c.isWild).forEach(c => {
          if (!result.includes(c)) result.push(c);
        });
        return result;
      }
      default:
        return myHand;
    }
  }, [myHand, sortMode]);

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

  // Handle sorting
  const handleSort = useCallback((mode: SortMode) => {
    tap();
    // Apply sort immediately to hand
    if (mode === 'rank') {
      const sorted = sortCardsByRank([...myHand]);
      reorderHand(sorted.map(c => c.id));
    } else if (mode === 'suit') {
      const grouped = groupBySuit([...myHand]);
      const result: string[] = [];
      (['♠', '♥', '♦', '♣'] as const).forEach(suit => {
        const suitCards = grouped.get(suit);
        if (suitCards) {
          result.push(...sortCardsByRank(suitCards).map(c => c.id));
        }
      });
      // Add jokers at the end
      myHand.filter(c => c.rank === 'Joker' || c.isWild).forEach(c => {
        if (!result.includes(c.id)) result.push(c.id);
      });
      reorderHand(result);
    }
  }, [myHand, reorderHand, tap]);

  if (!myHand || myHand.length === 0) {
    return (
      <div className="p-4 text-center text-emerald-200">
        No cards in hand
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort buttons */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium">
          Your Hand ({myHand.length} cards)
          {selectedCardIds.length > 0 && (
            <span className="text-emerald-200 font-normal ml-2">
              • {selectedCardIds.length} selected
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => handleSort('rank')}
            className="btn-ghost px-3 py-1 text-sm"
          >
            Sort by Rank
          </button>
          <button
            onClick={() => handleSort('suit')}
            className="btn-ghost px-3 py-1 text-sm"
          >
            Sort by Suit
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-wrap gap-1 sm:gap-2 justify-center">
        {sortedHand.map((card, index) => (
          <div
            key={card.id}
            className="relative"
            onDragOver={(e) => {
              e.preventDefault();
              handleDragOver(e, card.id);
            }}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDropOnCard(card.id, handleReorder)}
          >
            {/* Drop indicator */}
            {dragOverCardId === card.id && draggedCardId !== card.id && (
              <div className="absolute -left-1 top-0 bottom-0 w-1 bg-blue-500 rounded-full z-10 animate-pulse" />
            )}

            <Card
              card={card}
              isSelected={isCardSelected(card.id)}
              isHighlighted={isCardHighlighted(card.id)}
              isDragging={draggedCardId === card.id}
              isDisabled={!isMyTurn}
              onClick={() => handleCardClick(card.id)}
              onDragStart={(e) => handleDragStart(e, card.id)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, card.id, { rank: card.rank, suit: card.suit })}
              onTouchMove={handleTouchMove}
              onTouchEnd={(e) => handleTouchEnd(
                e,
                () => handleCardClick(card.id),
                (x, y) => {
                  // Handle touch drop - would need to detect target element
                }
              )}
            />
          </div>
        ))}
      </div>

    </div>
  );
}
