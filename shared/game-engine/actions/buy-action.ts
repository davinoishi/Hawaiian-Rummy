/**
 * Hawaiian Rummy - Buy Action
 * Pure functions for the buy system (requesting, passing, canceling)
 */

import {
  GameState,
  ActionResult,
  RequestBuyAction,
  CancelBuyAction,
  PassBuyAction,
  BuyRequest,
  ActionSideEffect
} from '../types';
import { getMaxBuysForRound } from '../validation/requirements';
import { BUY_WINDOW_DURATION } from '../constants';
import { drawCard } from '../deck';

/**
 * Check if a player is the current player
 */
function isCurrentPlayer(state: GameState, playerId: string): boolean {
  return state.players[state.currentPlayerIndex] === playerId;
}

/**
 * Get the distance of a player from the current player in turn order
 */
function getPlayerDistance(state: GameState, playerId: string): number {
  const currentPlayerIndex = state.currentPlayerIndex;
  const playerIndex = state.players.indexOf(playerId);
  return (playerIndex - currentPlayerIndex + state.players.length) % state.players.length;
}

/**
 * Validate if a player can request a buy
 */
export function canRequestBuy(
  state: GameState,
  playerId: string
): { valid: boolean; error?: string } {
  // Can't buy if it's your turn
  if (isCurrentPlayer(state, playerId)) {
    return { valid: false, error: "Can't buy on your turn" };
  }

  // Can only buy during draw phase
  if (state.gamePhase !== 'draw') {
    return { valid: false, error: 'Can only buy during draw phase' };
  }

  // Can't buy your own discarded card
  if (state.lastDiscarder !== null && state.lastDiscarder === playerId) {
    return { valid: false, error: 'Cannot buy your own discarded card' };
  }

  // Check if already at max buys
  const maxBuys = getMaxBuysForRound(state.currentRound);
  const playerState = state.playerStates[playerId];
  if (playerState.buyCount >= maxBuys) {
    return { valid: false, error: `Maximum ${maxBuys} buys per round` };
  }

  // Check if discard pile has cards
  if (state.discardPile.length === 0) {
    return { valid: false, error: 'No card to buy' };
  }

  // Check if buy was just processed (wait for new discard)
  if (state.buyJustProcessed) {
    return { valid: false, error: 'Wait for new discard' };
  }

  // Check if already has a buy request
  if (state.buyRequests.some(r => r.playerId === playerId)) {
    return { valid: false, error: 'Already requested buy' };
  }

  return { valid: true };
}

/**
 * Process a request buy action
 */
export function processRequestBuy(state: GameState, action: RequestBuyAction): ActionResult {
  const validation = canRequestBuy(state, action.playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  const thisPlayerDistance = getPlayerDistance(state, action.playerId);

  // Add to buy requests
  const newBuyRequest: BuyRequest = {
    playerId: action.playerId,
    timestamp: Date.now()
  };

  // Auto-pass lower priority requests
  const requestsToRemove: string[] = [];
  const autoPassPlayers: string[] = [];

  for (const req of state.buyRequests) {
    const reqDistance = getPlayerDistance(state, req.playerId);
    // Lower priority = greater distance from current player
    if (reqDistance > thisPlayerDistance) {
      requestsToRemove.push(req.playerId);
      if (!state.passedBuy.includes(req.playerId)) {
        autoPassPlayers.push(req.playerId);
      }
    }
  }

  const newBuyRequests = [
    ...state.buyRequests.filter(r => !requestsToRemove.includes(r.playerId)),
    newBuyRequest
  ];

  const newPassedBuy = [...state.passedBuy, ...autoPassPlayers];

  let newState: GameState = {
    ...state,
    buyRequests: newBuyRequests,
    passedBuy: newPassedBuy
  };

  // Check if buy should be processed immediately
  const shouldProcess = checkIfBuyShouldProcess(newState);
  if (shouldProcess) {
    const processResult = processBuyRequests(newState);
    newState = processResult.newState;
    return {
      success: true,
      newState,
      sideEffects: processResult.sideEffects
    };
  }

  return { success: true, newState };
}

/**
 * Process a cancel buy action
 */
export function processCancelBuy(state: GameState, action: CancelBuyAction): ActionResult {
  const newBuyRequests = state.buyRequests.filter(r => r.playerId !== action.playerId);

  const newState: GameState = {
    ...state,
    buyRequests: newBuyRequests
  };

  return { success: true, newState };
}

/**
 * Validate if a player can pass on buying
 */
export function canPassBuy(state: GameState, playerId: string): { valid: boolean; error?: string } {
  // Already passed
  if (state.passedBuy.includes(playerId)) {
    return { valid: false, error: 'Already passed' };
  }

  return { valid: true };
}

/**
 * Process a pass buy action
 */
export function processPassBuy(state: GameState, action: PassBuyAction): ActionResult {
  const validation = canPassBuy(state, action.playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  const newPassedBuy = [...state.passedBuy, action.playerId];

  let newState: GameState = {
    ...state,
    passedBuy: newPassedBuy
  };

  // Check if buy should be processed
  const shouldProcess = checkIfBuyShouldProcess(newState);
  if (shouldProcess) {
    const processResult = processBuyRequests(newState);
    newState = processResult.newState;
    return {
      success: true,
      newState,
      sideEffects: processResult.sideEffects
    };
  }

  // Don't clear passes here - they get cleared when turn ends (on discard)
  // This allows passes to persist during the buy window

  return { success: true, newState };
}

/**
 * Check if all players between current and first buyer have passed
 */
function checkIfBuyShouldProcess(state: GameState): boolean {
  if (state.buyRequests.length === 0) {
    return false;
  }

  const currentPlayerIndex = state.currentPlayerIndex;

  // Find the first buyer (closest after current player)
  let firstBuyerDistance = Infinity;
  let firstBuyer: string | null = null;

  for (const req of state.buyRequests) {
    const reqDistance = getPlayerDistance(state, req.playerId);
    if (reqDistance > 0 && reqDistance < firstBuyerDistance) {
      firstBuyerDistance = reqDistance;
      firstBuyer = req.playerId;
    }
  }

  if (!firstBuyer) {
    return false;
  }

  // Check if all players from current to buyer have passed
  for (let i = 0; i < firstBuyerDistance; i++) {
    const playerIndex = (currentPlayerIndex + i) % state.players.length;
    const playerId = state.players[playerIndex];
    if (!state.passedBuy.includes(playerId)) {
      return false;
    }
  }

  return true;
}

/**
 * Process pending buy requests - give buy to highest priority player
 */
export function processBuyRequests(state: GameState): { newState: GameState; sideEffects: ActionSideEffect[] } {
  if (state.buyRequests.length === 0) {
    return { newState: state, sideEffects: [] };
  }

  // Sort buy requests by player order (next player after current has priority)
  const sortedRequests = [...state.buyRequests].sort((a, b) => {
    const aDistance = getPlayerDistance(state, a.playerId);
    const bDistance = getPlayerDistance(state, b.playerId);
    return aDistance - bDistance;
  });

  // Give the first player in order the buy
  const buyingPlayerId = sortedRequests[0].playerId;
  const buyingPlayerState = state.playerStates[buyingPlayerId];

  // Get the discard card
  const discardCard = state.discardPile[state.discardPile.length - 1];
  const newDiscardPile = state.discardPile.slice(0, -1);

  // Draw a penalty card from deck
  const [penaltyCard, remainingDeck] = drawCard(state.deck);

  // Add both cards to buyer's hand
  const newHand = [...buyingPlayerState.hand, discardCard];
  if (penaltyCard) {
    newHand.push(penaltyCard);
  }

  // Update state
  const newState: GameState = {
    ...state,
    deck: remainingDeck,
    discardPile: newDiscardPile,
    buyRequests: [],
    buyJustProcessed: true,
    passedBuy: [],
    playerStates: {
      ...state.playerStates,
      [buyingPlayerId]: {
        ...buyingPlayerState,
        hand: newHand,
        buyCount: buyingPlayerState.buyCount + 1
      }
    }
  };

  return {
    newState,
    sideEffects: [{
      type: 'BUY_PROCESSED',
      buyerId: buyingPlayerId,
      cardId: discardCard.id
    }]
  };
}
