/**
 * useCardSelection - Hook for card selection and drag/drop
 */

import { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../store/ui-store';
import { useGameStore } from '../store/game-store';
import { useTutorialStore } from '../store/tutorial-store';

interface DragState {
  startX: number;
  startY: number;
  cardId: string;
  isDragging: boolean;
}

/**
 * Which hand card is under a screen point, if any.
 *
 * Touch events have no drag-and-drop target the way HTML5 drag events do, so
 * the card under the finger has to be resolved from coordinates. PlayerHand
 * tags each card wrapper with data-card-id for this.
 */
function cardIdAtPoint(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  const wrapper = element?.closest('[data-card-id]');
  return wrapper?.getAttribute('data-card-id') ?? null;
}

export function useCardSelection() {
  const {
    selectedCardIds,
    selectCard,
    deselectCard,
    toggleCardSelection,
    clearSelection,
    draggedCardId,
    setDraggedCard,
    dragOverCardId,
    setDragOverCard,
    isDragging,
    setIsDragging,
    dragOverDiscard,
    setDragOverDiscard,
    dragOverMeld,
    setDragOverMeld,
    touchDraggedCardId,
    setTouchDraggedCard,
    touchDragPosition,
    setTouchDragPosition,
    zoomedCard,
    setZoomedCard
  } = useUIStore();

  const { myHand, isMyTurn } = useGameStore();
  const { tutorialActive, isActionAllowed, shouldHighlightCard } = useTutorialStore();

  const dragStateRef = useRef<DragState | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle card click/tap
  const handleCardClick = useCallback((cardId: string) => {
    if (tutorialActive && !isActionAllowed('selectCard')) {
      return;
    }

    toggleCardSelection(cardId);
  }, [toggleCardSelection, tutorialActive, isActionAllowed]);

  // Select multiple cards at once
  const selectCards = useCallback((cardIds: string[]) => {
    clearSelection();
    cardIds.forEach((id) => selectCard(id));
  }, [clearSelection, selectCard]);

  // Check if a card is selected
  const isCardSelected = useCallback((cardId: string) => {
    return selectedCardIds.includes(cardId);
  }, [selectedCardIds]);

  // Check if a card should be highlighted (tutorial)
  const isCardHighlighted = useCallback((cardId: string) => {
    return shouldHighlightCard(cardId);
  }, [shouldHighlightCard]);

  // Desktop drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, cardId: string) => {
    if (!isMyTurn) return;

    setDraggedCard(cardId);
    setIsDragging(true);

    // Set drag image
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardId);
    }
  }, [isMyTurn, setDraggedCard, setIsDragging]);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null);
    setDragOverCard(null);
    setIsDragging(false);
    setDragOverDiscard(false);
    setDragOverMeld(null);
  }, [setDraggedCard, setDragOverCard, setIsDragging, setDragOverDiscard, setDragOverMeld]);

  const handleDragOver = useCallback((e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    if (cardId !== draggedCardId) {
      setDragOverCard(cardId);
    }
  }, [draggedCardId, setDragOverCard]);

  const handleDragLeave = useCallback(() => {
    setDragOverCard(null);
  }, [setDragOverCard]);

  const handleDropOnCard = useCallback((targetCardId: string, onReorder: (from: string, to: string) => void) => {
    if (draggedCardId && draggedCardId !== targetCardId) {
      onReorder(draggedCardId, targetCardId);
    }
    handleDragEnd();
  }, [draggedCardId, handleDragEnd]);

  // Touch drag handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent, cardId: string, cardData: { rank: string; suit: string }) => {
    const touch = e.touches[0];

    dragStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      cardId,
      isDragging: false
    };

    // Long press for zoom
    longPressTimerRef.current = setTimeout(() => {
      if (dragStateRef.current && !dragStateRef.current.isDragging) {
        setZoomedCard(cardData);
      }
    }, 500);
  }, [setZoomedCard]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragStateRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - dragStateRef.current.startX);
    const deltaY = Math.abs(touch.clientY - dragStateRef.current.startY);

    // Cancel long press if moving
    if (longPressTimerRef.current && (deltaX > 10 || deltaY > 10)) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Start a reorder drag only on a predominantly *horizontal* swipe. Cards
    // carry touch-action: pan-y, so a vertical swipe still scrolls the page -
    // which matters because the hand fills the bottom of a phone screen.
    if (!dragStateRef.current.isDragging && deltaX > 20 && deltaX > deltaY) {
      dragStateRef.current.isDragging = true;
      setTouchDraggedCard(dragStateRef.current.cardId);
    }

    if (dragStateRef.current.isDragging) {
      // No preventDefault here: React attaches touchmove at the root as a
      // *passive* listener, so calling it is a no-op that only logs
      // "Unable to preventDefault inside passive event listener invocation".
      // Scrolling is suppressed declaratively instead, by touch-action: pan-y
      // on the card wrappers in PlayerHand.
      setTouchDragPosition({ x: touch.clientX, y: touch.clientY });

      // Mirror the desktop drag-over highlight.
      const overId = cardIdAtPoint(touch.clientX, touch.clientY);
      setDragOverCard(overId && overId !== dragStateRef.current.cardId ? overId : null);
    }
  }, [setTouchDraggedCard, setTouchDragPosition, setDragOverCard]);

  const handleTouchEnd = useCallback((
    e: React.TouchEvent,
    onTap: () => void,
    onDropOnCard?: (draggedCardId: string, targetCardId: string) => void
  ) => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Clear zoomed card
    if (zoomedCard) {
      setZoomedCard(null);
    }

    const dragState = dragStateRef.current;

    // Reset state first so an early return below cannot strand a drag.
    dragStateRef.current = null;
    setTouchDraggedCard(null);
    setTouchDragPosition(null);
    setDragOverCard(null);

    if (!dragState) return;

    if (dragState.isDragging) {
      // touchend carries no coordinates in e.touches, so use the last position
      // we tracked during touchmove.
      const targetId = touchDragPosition
        ? cardIdAtPoint(touchDragPosition.x, touchDragPosition.y)
        : null;

      if (targetId && targetId !== dragState.cardId) {
        onDropOnCard?.(dragState.cardId, targetId);
      }
    } else {
      onTap();
    }
  }, [zoomedCard, touchDragPosition, setZoomedCard, setTouchDraggedCard, setTouchDragPosition, setDragOverCard]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return {
    // Selection state
    selectedCardIds,
    isCardSelected,
    isCardHighlighted,

    // Selection actions
    handleCardClick,
    selectCards,
    clearSelection,

    // Desktop drag
    draggedCardId,
    isDragging,
    dragOverCardId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDropOnCard,

    // Touch drag
    touchDraggedCardId,
    touchDragPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,

    // Discard/meld drop zones
    dragOverDiscard,
    setDragOverDiscard,
    dragOverMeld,
    setDragOverMeld,

    // Zoom
    zoomedCard,
    setZoomedCard
  };
}
