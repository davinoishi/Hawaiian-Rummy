/**
 * Hawaiian Rummy - Meld Action
 * Pure functions for creating and canceling melds
 */

import {
  GameState,
  ActionResult,
  CreateMeldAction,
  CancelMeldsAction,
  Meld,
  Card,
  ActionSideEffect
} from '../types';
import { validateSet } from '../validation/set-validator';
import { validateRun, getPossibleRunArrangements, sortRunCards } from '../validation/run-validator';
import { checkMeldsMatchRequirements, canCreateMeldOfType, getNextRequiredMeldSize } from '../validation/requirements';
import { getCardsByIds, removeCardsByIds } from '../card-utils';

/**
 * Validate if a player can create a meld
 */
export function canCreateMeld(
  state: GameState,
  playerId: string,
  meldType: 'set' | 'run',
  cardIds: string[]
): { valid: boolean; error?: string; needsWildcardChoice?: boolean; arrangements?: any[] } {
  // Check if it's the player's turn
  const currentPlayerId = state.players[state.currentPlayerIndex];
  if (currentPlayerId !== playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check game phase (can meld during meld phase, not draw phase)
  if (state.gamePhase === 'draw') {
    return { valid: false, error: 'Cannot create meld during draw phase' };
  }

  // Check if player has the cards
  const playerState = state.playerStates[playerId];
  const cards = getCardsByIds(playerState.hand, cardIds);

  if (cards.length !== cardIds.length) {
    return { valid: false, error: 'Invalid cards selected' };
  }

  // Check if creating more melds than required
  const createError = canCreateMeldOfType(playerState.melds, meldType, state.currentRound);
  if (createError) {
    return { valid: false, error: createError };
  }

  // Check meld size against requirements
  const requiredSize = getNextRequiredMeldSize(playerState.melds, meldType, state.currentRound);
  if (requiredSize !== undefined && cards.length < requiredSize) {
    return { valid: false, error: `This ${meldType} needs at least ${requiredSize} cards` };
  }

  // Validate the meld
  if (meldType === 'set') {
    const validation = validateSet(cards);
    if (!validation.valid) {
      return { valid: false, error: validation.error || 'Invalid set' };
    }
  } else {
    const validation = validateRun(cards);
    if (!validation.valid) {
      return { valid: false, error: validation.error || 'Invalid run' };
    }

    // Check if run needs wildcard position choice
    const arrangements = getPossibleRunArrangements(cards);
    if (arrangements.length > 1) {
      return {
        valid: true,
        needsWildcardChoice: true,
        arrangements
      };
    }
  }

  return { valid: true };
}

/**
 * Process a create meld action
 */
export function processCreateMeld(state: GameState, action: CreateMeldAction): ActionResult {
  const validation = canCreateMeld(
    state,
    action.playerId,
    action.meldType,
    action.cardIds
  );

  // If needs wildcard choice and not provided, return the prompt
  if (validation.needsWildcardChoice && action.wildcardPlacement === undefined) {
    return {
      success: false,
      error: 'Multiple wildcard arrangements possible',
      newState: state,
      sideEffects: [{
        type: 'NEEDS_WILDCARD_POSITION',
        arrangements: validation.arrangements || []
      }]
    };
  }

  if (!validation.valid && !validation.needsWildcardChoice) {
    return { success: false, error: validation.error, newState: state };
  }

  const playerState = state.playerStates[action.playerId];
  const cards = getCardsByIds(playerState.hand, action.cardIds);

  // Sort cards appropriately
  const sortedCards = action.meldType === 'run'
    ? sortRunCards(cards, action.wildcardPlacement)
    : cards;

  // Create the meld
  const newMeld: Meld = {
    type: action.meldType,
    cards: sortedCards
  };

  // Remove cards from hand
  const newHand = removeCardsByIds(playerState.hand, action.cardIds);

  // Add meld to player's melds
  const newMelds = [...playerState.melds, newMeld];

  // Check if requirements are met
  const requirementsMet = checkMeldsMatchRequirements(newMelds, state.currentRound);

  // Create new player state
  const newPlayerState = {
    ...playerState,
    hand: newHand,
    melds: newMelds,
    hasMetRequirements: requirementsMet
  };

  // Create new game state
  const newState: GameState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [action.playerId]: newPlayerState
    }
  };

  // Prepare side effects
  const sideEffects: ActionSideEffect[] = [];

  if (requirementsMet && !playerState.hasMetRequirements) {
    sideEffects.push({ type: 'REQUIREMENTS_MET', playerId: action.playerId });
  }

  // Check if player went out (melded all cards)
  if (newHand.length === 0 && requirementsMet) {
    sideEffects.push({ type: 'ROUND_ENDED', winnerId: action.playerId });
  }

  return {
    success: true,
    newState,
    sideEffects: sideEffects.length > 0 ? sideEffects : undefined
  };
}

/**
 * Validate if a player can cancel their melds
 */
export function canCancelMelds(state: GameState, playerId: string): { valid: boolean; error?: string } {
  // Check if it's the player's turn
  const currentPlayerId = state.players[state.currentPlayerIndex];
  if (currentPlayerId !== playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Check game phase
  if (state.gamePhase === 'draw') {
    return { valid: false, error: 'Cannot cancel melds during draw phase' };
  }

  // Check if player has melds to cancel
  const playerState = state.playerStates[playerId];
  if (playerState.melds.length === 0) {
    return { valid: false, error: 'No melds to cancel' };
  }

  return { valid: true };
}

/**
 * Process a cancel melds action
 */
export function processCancelMelds(state: GameState, action: CancelMeldsAction): ActionResult {
  const validation = canCancelMelds(state, action.playerId);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  const playerState = state.playerStates[action.playerId];

  // Return all melded cards to hand
  const cardsToReturn = playerState.melds.flatMap(meld => meld.cards);
  const newHand = [...playerState.hand, ...cardsToReturn];

  // Create new player state
  const newPlayerState = {
    ...playerState,
    hand: newHand,
    melds: [],
    hasMetRequirements: false
  };

  // Create new game state
  const newState: GameState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [action.playerId]: newPlayerState
    }
  };

  return { success: true, newState };
}
