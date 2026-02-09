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

    // Start drag if moved enough
    if (!dragStateRef.current.isDragging && (deltaX > 20 || deltaY > 20)) {
      dragStateRef.current.isDragging = true;
      setTouchDraggedCard(dragStateRef.current.cardId);
    }

    if (dragStateRef.current.isDragging) {
      e.preventDefault();
      setTouchDragPosition({ x: touch.clientX, y: touch.clientY });
    }
  }, [setTouchDraggedCard, setTouchDragPosition]);

  const handleTouchEnd = useCallback((
    e: React.TouchEvent,
    onTap: () => void,
    onDrop?: (x: number, y: number) => void
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

    if (!dragStateRef.current) return;

    if (dragStateRef.current.isDragging && touchDragPosition) {
      // Handle drop
      onDrop?.(touchDragPosition.x, touchDragPosition.y);
    } else {
      // Handle tap
      onTap();
    }

    // Reset state
    dragStateRef.current = null;
    setTouchDraggedCard(null);
    setTouchDragPosition(null);
  }, [zoomedCard, touchDragPosition, setZoomedCard, setTouchDraggedCard, setTouchDragPosition]);

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
