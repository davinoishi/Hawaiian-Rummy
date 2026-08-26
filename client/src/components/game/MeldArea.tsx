/**
 * MeldArea - Displays a player's melds
 */

import { memo, useCallback } from 'react';
import { Card } from './Card';
import { useUIStore, useGameStore, useSettingsStore } from '../../store';
import { usePlayerActions, useHaptics } from '../../hooks';
import type { Meld, Card as CardType } from '@shared/game-engine/types';

interface MeldAreaProps {
  playerId: string;
  playerName: string;
  melds: Meld[];
  isMe: boolean;
  canLayoff: boolean;
}

function MeldAreaComponent({ playerId, playerName, melds, isMe, canLayoff }: MeldAreaProps) {
  const { layoffMode, selectedMeld, focusedMeld, dragOverMeld, setSelectedMeld, selectedCardIds } = useUIStore();
  const hasMetRequirements = useGameStore((state) => state.hasMetRequirements);
  const isLight = useSettingsStore((state) => state.resolvedTheme) === 'light';
  const { layoffCard } = usePlayerActions();
  const { tap, meldCreate } = useHaptics();

  // Handle meld click for layoff
  const handleMeldClick = useCallback((meldIndex: number) => {
    if (!layoffMode || !canLayoff) return;

    tap();
    if (selectedMeld?.playerId === playerId && selectedMeld?.meldIndex === meldIndex) {
      setSelectedMeld(null);
    } else {
      setSelectedMeld({ playerId, meldIndex });
    }
  }, [layoffMode, canLayoff, playerId, selectedMeld, setSelectedMeld, tap]);

  // Handle card drop on meld
  const handleDrop = useCallback((meldIndex: number, cardId: string) => {
    if (!hasMetRequirements) return;

    meldCreate();
    layoffCard(cardId, playerId, meldIndex);
  }, [hasMetRequirements, playerId, layoffCard, meldCreate]);

  if (!melds || melds.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className={`text-sm font-medium ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
        {isMe ? 'Your Melds' : `${playerName}'s Melds`}
      </h4>

      <div className="flex flex-wrap gap-3">
        {melds.map((meld, meldIndex) => {
          const isSelected = selectedMeld?.playerId === playerId && selectedMeld?.meldIndex === meldIndex;
          const isFocused = focusedMeld?.playerId === playerId && focusedMeld?.meldIndex === meldIndex;
          const isDragOver = dragOverMeld?.playerId === playerId && dragOverMeld?.meldIndex === meldIndex;

          return (
            <div
              key={`${playerId}-meld-${meldIndex}`}
              className={`
                meld-group relative
                ${layoffMode && canLayoff ? (isLight ? 'cursor-pointer hover:bg-emerald-200' : 'cursor-pointer hover:bg-emerald-600/50') : ''}
                ${isSelected ? (isLight ? 'ring-2 ring-amber-500 bg-emerald-200' : 'ring-2 ring-yellow-400 bg-emerald-600/70') : ''}
                ${isFocused && !isSelected ? 'ring-2 ring-cyan-400 animate-pulse' : ''}
                ${isDragOver ? 'ring-2 ring-green-400 bg-green-600/30' : ''}
              `}
              onClick={() => handleMeldClick(meldIndex)}
              onDragOver={(e) => {
                e.preventDefault();
                if (hasMetRequirements) {
                  useUIStore.getState().setDragOverMeld({ playerId, meldIndex });
                }
              }}
              onDragLeave={() => {
                useUIStore.getState().setDragOverMeld(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedCardId = useUIStore.getState().draggedCardId;
                if (draggedCardId) {
                  handleDrop(meldIndex, draggedCardId);
                }
                useUIStore.getState().setDragOverMeld(null);
              }}
            >
              {/* Meld type indicator */}
              <div className="flex flex-col items-center mr-2">
                <span className={`
                  text-[10px] font-bold px-1.5 py-0.5 rounded
                  ${meld.type === 'set'
                    ? (isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/30 text-blue-200')
                    : (isLight ? 'bg-green-100 text-green-800' : 'bg-green-500/30 text-green-200')}
                `}>
                  {meld.type === 'set' ? 'SET' : 'RUN'}
                </span>
                <span className={`text-[9px] mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                  {meld.cards.length} cards
                </span>
              </div>

              {/* Meld cards */}
              <div className="flex -space-x-4 sm:-space-x-3">
                {meld.cards.map((card, cardIndex) => (
                  <div
                    key={card.id}
                    className="transform hover:translate-y-0 hover:z-10"
                    style={{ zIndex: cardIndex }}
                  >
                    <Card
                      card={card}
                      size="sm"
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const MeldArea = memo(MeldAreaComponent);
