/**
 * Card - Individual playing card component
 */

import { memo, useCallback } from 'react';
import { useCardSelection, useHaptics } from '../../hooks';
import type { Card as CardType } from '@shared/game-engine/types';

interface CardProps {
  card: CardType;
  isSelected?: boolean;
  isHighlighted?: boolean;
  isDragging?: boolean;
  isDisabled?: boolean;
  showBack?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  className?: string;
}

const SUIT_COLORS: Record<string, string> = {
  '♠': 'text-gray-900',
  '♣': 'text-gray-900',
  '♥': 'text-red-600',
  '♦': 'text-red-600'
};

function CardComponent({
  card,
  isSelected = false,
  isHighlighted = false,
  isDragging = false,
  isDisabled = false,
  showBack = false,
  size = 'md',
  onClick,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  className = ''
}: CardProps) {
  const { tap } = useHaptics();

  const handleClick = useCallback(() => {
    if (isDisabled || showBack) return;
    tap();
    onClick?.();
  }, [isDisabled, showBack, tap, onClick]);

  // Size classes
  const sizeClasses = {
    sm: 'w-10 h-14 text-sm',
    md: 'card', // Uses responsive card class from CSS
    lg: 'w-20 h-28 text-xl'
  };

  // Don't show center suit for small cards (cleaner look in melds)
  const showCenterSuit = size !== 'sm';

  // Card back
  if (showBack) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-lg card-back shadow-md ${className}`}
      />
    );
  }

  // Joker card
  const isJoker = card.rank === 'Joker';
  const isWild = card.isWild;

  // Card styling
  const cardClasses = [
    sizeClasses[size],
    'rounded-lg shadow-md transition-all duration-150 select-none',
    isSelected && 'card-selected',
    isHighlighted && 'card-highlighted',
    isDragging && 'card-dragging opacity-50',
    isDisabled && 'card-disabled',
    isWild && 'card-wildcard',
    isJoker && 'card-joker',
    !isDisabled && !showBack && 'cursor-pointer hover:-translate-y-1',
    className
  ].filter(Boolean).join(' ');

  const suitColor = SUIT_COLORS[card.suit] || 'text-gray-900';

  return (
    <div
      className={cardClasses}
      onClick={handleClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        background: isJoker
          ? 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #f59e0b 100%)'
          : 'linear-gradient(145deg, #ffffff 0%, #f8f8f8 100%)'
      }}
    >
      {isJoker ? (
        // Joker layout
        <div className="h-full flex flex-col items-center justify-center p-1">
          <span className="text-purple-600 font-bold text-xs sm:text-sm">JOKER</span>
          <span className="text-2xl sm:text-3xl">🃏</span>
          <span className="text-purple-500 text-[8px] sm:text-xs font-medium">WILD</span>
        </div>
      ) : (
        // Regular card layout
        <div className="h-full flex flex-col p-1">
          {/* Top left */}
          <div className={`flex flex-col items-center leading-none ${suitColor}`}>
            <span className="font-bold text-base sm:text-lg">{card.rank}</span>
            <span className="text-sm sm:text-base">{card.suit}</span>
          </div>

          {/* Center suit - only for medium and large cards */}
          {showCenterSuit && (
            <div className={`flex-1 flex items-center justify-center ${suitColor}`}>
              <span className="text-2xl sm:text-3xl">{card.suit}</span>
            </div>
          )}

          {/* Wild indicator */}
          {isWild && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
              <span className="text-[8px] sm:text-xs font-bold text-purple-600 bg-purple-100 px-1 rounded">
                WILD
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const Card = memo(CardComponent);
