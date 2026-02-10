/**
 * usePlayerActions - Hook for player game actions
 * Supports both online (socket) and offline (local) game modes
 */

import { useCallback, useState, useEffect } from 'react';
import { useSocketStore } from '../store/socket-store';
import { useGameStore } from '../store/game-store';
import { useUIStore } from '../store/ui-store';
import { useTutorialStore } from '../store/tutorial-store';
import {
  isLocalGameRunning,
  processLocalAction,
  getLocalPlayerId
} from '../services/local-game';

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

    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'DRAW_CARD', playerId });
      }
    } else {
      emit('drawCard');
    }

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

    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'TAKE_DISCARD', playerId });
      }
    } else {
      emit('takeDiscard');
    }
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

    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        let result = processLocalAction({
          type: 'CREATE_MELD',
          playerId,
          meldType: type,
          cardIds: selectedCardIds
        });

        // Handle wildcard position choice - auto-select first arrangement
        if (!result.success && result.sideEffects?.some(e => e.type === 'NEEDS_WILDCARD_POSITION')) {
          result = processLocalAction({
            type: 'CREATE_MELD',
            playerId,
            meldType: type,
            cardIds: selectedCardIds,
            wildcardPlacement: 0
          });
        }

        // Show error if still failed
        if (!result.success && result.error) {
          setErrorMessage(result.error);
          return;
        }
      }
    } else {
      emit('createMeld', {
        cardIds: selectedCardIds,
        type,
        wildcardPositions
      });
    }

    clearSelection();

    // Auto-advance tutorial if needed
    if (tutorialActive && currentStepData?.nextTrigger === 'meldCreated') {
      advanceStep();
    }
  }, [selectedCardIds, emit, clearSelection, tutorialActive, isActionAllowed, advanceStep, currentStepData, setErrorMessage]);

  // Cancel all pending melds
  const cancelMelds = useCallback(() => {
    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'CANCEL_MELDS', playerId });
      }
    } else {
      emit('cancelMelds');
    }
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

    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'DISCARD', playerId, cardId: discardCardId });
      }
    } else {
      emit('discard', { cardId: discardCardId });
    }
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

    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({
          type: 'LAYOFF_CARD',
          playerId,
          cardId,
          meldOwnerId,
          meldIndex,
          wildcardPosition: wildcardPosition as 'beginning' | 'end' | undefined
        });
      }
    } else {
      emit('layoffCard', {
        cardId,
        meldOwnerId,
        meldIndex,
        position,
        wildcardPosition
      });
    }

    clearSelection();
  }, [hasMetRequirements, emit, clearSelection, tutorialActive, isActionAllowed, setErrorMessage]);

  // Request to buy the discard
  const requestBuy = useCallback(() => {
    if (tutorialActive && !isActionAllowed('buy')) {
      return;
    }

    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'REQUEST_BUY', playerId });
      }
    } else {
      emit('requestBuy');
    }
  }, [emit, tutorialActive, isActionAllowed]);

  // Cancel a buy request
  const cancelBuy = useCallback(() => {
    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'CANCEL_BUY', playerId });
      }
    } else {
      emit('cancelBuy');
    }
  }, [emit]);

  // Pass on buying
  const passBuy = useCallback(() => {
    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'PASS_BUY', playerId });
      }
    } else {
      emit('passBuy');
    }
  }, [emit]);

  // Reorder cards in hand
  const reorderHand = useCallback((cardIds: string[]) => {
    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'REORDER_HAND', playerId, cardIds });
      }
    } else {
      emit('reorderHand', { cardIds });
    }
  }, [emit]);

  // Continue to next round
  const continueGame = useCallback(() => {
    if (isLocalGameRunning()) {
      const playerId = getLocalPlayerId();
      if (playerId) {
        processLocalAction({ type: 'CONTINUE_TO_NEXT_ROUND', playerId });
      }
    } else {
      emit('continue');
    }
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
