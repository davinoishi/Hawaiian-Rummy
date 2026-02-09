/**
 * Hawaiian Rummy - Draw Action
 * Pure functions for drawing cards from deck or discard pile
 */

import { GameState, ActionResult, DrawCardAction, TakeDiscardAction } from '../types';
import { drawCard } from '../deck';
import { BUY_WINDOW_DURATION } from '../constants';
import { processBuyRequests } from './buy-action';

/**
 * Check if the buy window is still active
 */
function isBuyWindowActive(state: GameState): boolean {
  if (!state.lastDiscardTimestamp) return false;
  const elapsed = Date.now() - state.lastDiscardTimestamp;
  return elapsed < BUY_WINDOW_DURATION;
}

/**
 * Validate if a player can draw from the deck
 */
export function canDrawCard(state: GameState, playerId: string): { valid: boolean; error?: string } {
  // Check if it's the player's turn
  const currentPlayerId = state.players[state.currentPlayerIndex];
  if (currentPlayerId !== playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check game phase
  if (state.gamePhase !== 'draw') {
    return { valid: false, error: 'Cannot draw in this phase' };
  }

  // Note: Current player CAN draw from deck even if:
  // - Buy window is active (they're choosing not to take the discard)
  // - Buy requests exist (drawing means they pass on the discard, allowing buys)

  // Check if deck has cards
  if (state.deck.length === 0) {
    return { valid: false, error: 'Deck is empty' };
  }

  return { valid: true };
}

/**
 * Process a draw card action
 */
export function processDrawCard(state: GameState, action: DrawCardAction): ActionResult {
  const validation = canDrawCard(state, action.playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  // If there are pending buy requests, process them first (grant to highest priority buyer)
  let workingState = state;
  let sideEffects: ActionResult['sideEffects'] = undefined;

  if (state.buyRequests && state.buyRequests.length > 0 && state.discardPile.length > 0) {
    // Process buy requests - give card to highest priority buyer
    const buyResult = processBuyRequests(state);
    workingState = buyResult.newState;
    sideEffects = buyResult.sideEffects;
  }

  // Draw a card from the deck
  const [card, remainingDeck] = drawCard(workingState.deck);
  if (!card) {
    return { success: false, error: 'Failed to draw card', newState: state };
  }

  // Get current player state
  const playerState = workingState.playerStates[action.playerId];
  const newHand = [...playerState.hand, card];

  // Create new state
  const newState: GameState = {
    ...workingState,
    deck: remainingDeck,
    gamePhase: 'meld',
    buyRequests: [], // Clear buy requests
    passedBuy: [], // Clear passes since we're moving on
    playerStates: {
      ...workingState.playerStates,
      [action.playerId]: {
        ...playerState,
        hand: newHand
      }
    }
  };

  return { success: true, newState, sideEffects };
}

/**
 * Validate if a player can take from the discard pile
 */
export function canTakeDiscard(state: GameState, playerId: string): { valid: boolean; error?: string } {
  // Check if it's the player's turn
  const currentPlayerId = state.players[state.currentPlayerIndex];
  if (currentPlayerId !== playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check game phase
  if (state.gamePhase !== 'draw') {
    return { valid: false, error: 'Cannot take discard in this phase' };
  }

  // Check if buy window is still active
  if (isBuyWindowActive(state)) {
    const remaining = Math.ceil((BUY_WINDOW_DURATION - (Date.now() - (state.lastDiscardTimestamp || 0))) / 1000);
    return { valid: false, error: `Please wait ${remaining} second(s) for other players to buy.` };
  }

  // Cannot take discard if a buy was just processed
  if (state.buyJustProcessed) {
    return { valid: false, error: 'After a buy, you must draw from the deck' };
  }

  // Check if discard pile has cards
  if (state.discardPile.length === 0) {
    return { valid: false, error: 'Discard pile is empty' };
  }

  return { valid: true };
}

/**
 * Process a take discard action
 */
export function processTakeDiscard(state: GameState, action: TakeDiscardAction): ActionResult {
  const validation = canTakeDiscard(state, action.playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  // Take the top card from discard pile
  const card = state.discardPile[state.discardPile.length - 1];
  const newDiscardPile = state.discardPile.slice(0, -1); // Remove the taken card

  // Get current player state
  const playerState = state.playerStates[action.playerId];
  const newHand = [...playerState.hand, card];

  // Create new state
  const newState: GameState = {
    ...state,
    discardPile: newDiscardPile,
    gamePhase: 'meld',
    buyRequests: [],
    passedBuy: [],
    playerStates: {
      ...state.playerStates,
      [action.playerId]: {
        ...playerState,
        hand: newHand
      }
    }
  };

  return {
    success: true,
    newState,
    sideEffects: state.buyRequests.length > 0
      ? [{ type: 'BUY_PROCESSED', buyerId: action.playerId, cardId: card.id }]
      : undefined
  };
}
