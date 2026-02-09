/**
 * Hawaiian Rummy - Discard Action
 * Pure functions for discarding cards
 */

import {
  GameState,
  ActionResult,
  DiscardAction,
  ActionSideEffect
} from '../types';
import { findCardById, removeCardById } from '../card-utils';
import { checkMeldsMatchRequirements } from '../validation/requirements';

/**
 * Validate if a player can discard a card
 */
export function canDiscard(
  state: GameState,
  playerId: string,
  cardId: string
): { valid: boolean; error?: string } {
  // Check if it's the player's turn
  const currentPlayerId = state.players[state.currentPlayerIndex];
  if (currentPlayerId !== playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check game phase (can only discard during meld phase)
  if (state.gamePhase === 'draw') {
    return { valid: false, error: 'Cannot discard during draw phase' };
  }

  // Check if player has the card
  const playerState = state.playerStates[playerId];
  const card = findCardById(playerState.hand, cardId);
  if (!card) {
    return { valid: false, error: 'Invalid card to discard' };
  }

  // If player has melds but hasn't met requirements, don't allow discard
  if (playerState.melds.length > 0 && !playerState.hasMetRequirements) {
    const meetsReqs = checkMeldsMatchRequirements(playerState.melds, state.currentRound);
    if (!meetsReqs) {
      return {
        valid: false,
        error: 'Meld requirements not met. Complete your melds or cancel them before discarding.'
      };
    }
  }

  return { valid: true };
}

/**
 * Move to the next player's turn
 */
function nextTurn(state: GameState): GameState {
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;

  return {
    ...state,
    currentPlayerIndex: nextPlayerIndex,
    gamePhase: 'draw',
    buyRequests: [],
    passedBuy: [],
    buyJustProcessed: false
  };
}

/**
 * Process a discard action
 */
export function processDiscard(state: GameState, action: DiscardAction): ActionResult {
  const validation = canDiscard(state, action.playerId, action.cardId);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  const playerState = state.playerStates[action.playerId];
  const card = findCardById(playerState.hand, action.cardId)!;

  // Remove card from hand and add to discard pile
  const newHand = removeCardById(playerState.hand, action.cardId);
  const newDiscardPile = [...state.discardPile, card];

  // Check if round is over (discarded last card after meeting requirements)
  const roundEnded = newHand.length === 0 &&
    checkMeldsMatchRequirements(playerState.melds, state.currentRound);

  // Create intermediate state
  let newState: GameState = {
    ...state,
    discardPile: newDiscardPile,
    lastDiscarder: action.playerId,
    lastDiscardTimestamp: Date.now(),
    playerStates: {
      ...state.playerStates,
      [action.playerId]: {
        ...playerState,
        hand: newHand
      }
    }
  };

  const sideEffects: ActionSideEffect[] = [];

  if (roundEnded) {
    sideEffects.push({ type: 'ROUND_ENDED', winnerId: action.playerId });
  } else {
    // Move to next player's turn
    newState = nextTurn(newState);
    sideEffects.push({ type: 'NEXT_TURN' });
  }

  return {
    success: true,
    newState,
    sideEffects
  };
}

/**
 * Process a reorder hand action
 */
export function processReorderHand(
  state: GameState,
  playerId: string,
  cardIds: string[]
): ActionResult {
  const playerState = state.playerStates[playerId];

  // Reorder the hand based on the provided card IDs
  const reorderedHand = cardIds
    .map(id => findCardById(playerState.hand, id))
    .filter((card): card is NonNullable<typeof card> => card !== undefined);

  // Make sure all cards are accounted for
  if (reorderedHand.length !== playerState.hand.length) {
    return {
      success: false,
      error: 'Invalid card order',
      newState: state
    };
  }

  const newState: GameState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [playerId]: {
        ...playerState,
        hand: reorderedHand
      }
    }
  };

  return { success: true, newState };
}
