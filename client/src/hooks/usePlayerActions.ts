/**
 * usePlayerActions - Hook for player game actions
 * All actions are sent to the server via socket
 */

import { useCallback, useState, useEffect } from 'react';
import { useSocketStore } from '../store/socket-store';
import { useGameStore } from '../store/game-store';
import { useUIStore } from '../store/ui-store';
import { useTutorialStore } from '../store/tutorial-store';

export function usePlayerActions() {
  const emit = useSocketStore((state) => state.emit);

  const {
    isMyTurn,
    canDraw,
    canTakeDiscard,
    hasMetRequirements,
    myHand,
    gamePhase,
    buyWindowActive,
    buyWindowRemaining,
    buyJustProcessed
  } = useGameStore();

  // Track buy window expiration locally
  const [localBuyWindowExpired, setLocalBuyWindowExpired] = useState(true);

  useEffect(() => {
    if (buyWindowActive && (buyWindowRemaining ?? 0) > 0) {
      setLocalBuyWindowExpired(false);
      const timer = setTimeout(() => {
        setLocalBuyWindowExpired(true);
      }, (buyWindowRemaining ?? 0) * 1000);
      return () => clearTimeout(timer);
    } else if (!buyWindowActive) {
      setLocalBuyWindowExpired(true);
    }
  }, [buyWindowActive, buyWindowRemaining]);

  // Compute local canTakeDiscard that accounts for buy window expiration
  // Use server's canTakeDiscard if true, or fall back to local check when buy window expires by time
  const localCanTakeDiscard = canTakeDiscard || (isMyTurn && gamePhase === 'draw' && !buyJustProcessed && localBuyWindowExpired);

  const {
    selectedCardIds,
    clearSelection,
    setErrorMessage,
    layoffMode,
    selectedMeld
  } = useUIStore();
  const { tutorialActive, isActionAllowed, advanceStep, currentStepData } = useTutorialStore();

  // Draw a card from the deck
  const drawCard = useCallback(() => {
    if (tutorialActive && !isActionAllowed('draw')) {
      return;
    }

    if (!isMyTurn || !canDraw) {
      setErrorMessage('Cannot draw right now');
      return;
    }

    emit('drawCard');

    // Auto-advance tutorial if needed
    if (tutorialActive && currentStepData?.nextTrigger === 'cardDrawn') {
      advanceStep();
    }
  }, [isMyTurn, canDraw, emit, tutorialActive, isActionAllowed, advanceStep, currentStepData, setErrorMessage]);

  // Take the top card from the discard pile
  const takeDiscard = useCallback(() => {
    if (tutorialActive && !isActionAllowed('takeDiscard')) {
      return;
    }

    // Use local computed value which accounts for buy window expiration by time
    if (!localCanTakeDiscard) {
      setErrorMessage('Cannot take from discard right now');
      return;
    }

    emit('takeDiscard');
  }, [localCanTakeDiscard, emit, tutorialActive, isActionAllowed, setErrorMessage]);

  // Create a meld from selected cards
  const createMeld = useCallback((type: 'set' | 'run', wildcardPositions?: Record<string, string>) => {
    if (tutorialActive && !isActionAllowed('createMeld')) {
      return;
    }

    if (selectedCardIds.length < 3) {
      setErrorMessage('Select at least 3 cards to create a meld');
      return;
    }

    emit('createMeld', {
      cardIds: selectedCardIds,
      type,
      wildcardPositions
    });

    clearSelection();

    // Auto-advance tutorial if needed
    if (tutorialActive && currentStepData?.nextTrigger === 'meldCreated') {
      advanceStep();
    }
  }, [selectedCardIds, emit, clearSelection, tutorialActive, isActionAllowed, advanceStep, currentStepData, setErrorMessage]);

  // Cancel all pending melds
  const cancelMelds = useCallback(() => {
    emit('cancelMelds');
    clearSelection();
  }, [emit, clearSelection]);

  // Discard a card
  const discard = useCallback((cardId?: string) => {
    if (tutorialActive && !isActionAllowed('discard')) {
      return;
    }

    const discardCardId = cardId || (selectedCardIds.length === 1 ? selectedCardIds[0] : null);

    if (!discardCardId) {
      setErrorMessage('Select exactly one card to discard');
      return;
    }

    if (!isMyTurn) {
      setErrorMessage('Not your turn');
      return;
    }

    emit('discard', { cardId: discardCardId });
    clearSelection();

    // Auto-advance tutorial if needed
    if (tutorialActive && currentStepData?.nextTrigger === 'cardDiscarded') {
      advanceStep();
    }
  }, [selectedCardIds, isMyTurn, emit, clearSelection, tutorialActive, isActionAllowed, advanceStep, currentStepData, setErrorMessage]);

  // Layoff a card onto a meld
  const layoffCard = useCallback((
    cardId: string,
    meldOwnerId: string,
    meldIndex: number,
    position?: 'start' | 'end',
    wildcardPosition?: string
  ) => {
    if (tutorialActive && !isActionAllowed('layoff')) {
      return;
    }

    if (!hasMetRequirements) {
      setErrorMessage('Must meet requirements before laying off');
      return;
    }

    emit('layoffCard', {
      cardId,
      meldOwnerId,
      meldIndex,
      position,
      wildcardPosition
    });

    clearSelection();
  }, [hasMetRequirements, emit, clearSelection, tutorialActive, isActionAllowed, setErrorMessage]);

  // Request to buy the discard
  const requestBuy = useCallback(() => {
    if (tutorialActive && !isActionAllowed('buy')) {
      return;
    }

    emit('requestBuy');
  }, [emit, tutorialActive, isActionAllowed]);

  // Cancel a buy request
  const cancelBuy = useCallback(() => {
    emit('cancelBuy');
  }, [emit]);

  // Pass on buying
  const passBuy = useCallback(() => {
    emit('passBuy');
  }, [emit]);

  // Reorder cards in hand
  const reorderHand = useCallback((cardIds: string[]) => {
    emit('reorderHand', { cardIds });
  }, [emit]);

  // Continue to next round
  const continueGame = useCallback(() => {
    emit('continue');
  }, [emit]);

  return {
    // Draw phase
    drawCard,
    takeDiscard,

    // Meld phase
    createMeld,
    cancelMelds,

    // Discard phase
    discard,

    // Layoff
    layoffCard,

    // Buy system
    requestBuy,
    cancelBuy,
    passBuy,

    // Other
    reorderHand,
    continueGame,

    // State helpers
    canPerformAction: isMyTurn && gamePhase !== 'gameOver',
    hasSelection: selectedCardIds.length > 0
  };
}
