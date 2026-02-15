/**
 * Hawaiian Rummy - Layoff Action
 * Pure functions for laying off cards onto existing melds
 */

import {
  GameState,
  ActionResult,
  LayoffCardAction,
  Meld,
  Card,
  ActionSideEffect
} from '../types';
import { validateRun, sortRunCards, getValidWildcardPositions } from '../validation/run-validator';
import { canAddToSet } from '../validation/set-validator';
import { findCardById, removeCardById, getNonWildcards, getWildcards, getRankValue } from '../card-utils';

/**
 * Check if a card can fit a meld
 */
export function canCardFitMeld(card: Card, meld: Meld): boolean {
  if (meld.type === 'set') {
    return canAddToSet(card, meld);
  } else {
    // For runs, check if adding the card creates a valid run
    const testCards = [...meld.cards, card];
    const result = validateRun(testCards);

    // If the standard validation fails, check if this is a wildcard replacement scenario
    // (user's natural card can replace a wildcard in the run)
    if (!result.valid && !card.isWild) {
      const nonWildMeldCards = getNonWildcards(meld.cards);
      const wildMeldCards = getWildcards(meld.cards);

      // Check if the card's suit matches the run's suit
      if (nonWildMeldCards.length > 0 && nonWildMeldCards[0].suit === card.suit) {
        // Check if the card would logically replace a wildcard
        // (i.e., the card's rank is within the range covered by wildcards)
        const cardValue = getRankValue(card.rank);
        const nonWildValues = nonWildMeldCards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
        const minVal = nonWildValues[0];
        const maxVal = nonWildValues[nonWildValues.length - 1];

        // Check if there are gaps filled by wildcards
        let gapsNeeded = 0;
        for (let i = 1; i < nonWildValues.length; i++) {
          gapsNeeded += nonWildValues[i] - nonWildValues[i - 1] - 1;
        }

        // If the card would fill a gap currently filled by a wildcard
        if (gapsNeeded > 0 && cardValue > minVal && cardValue < maxVal) {
          // Check if this value is not already in the run
          if (!nonWildValues.includes(cardValue)) {
            console.log(`[LAYOFF] Wildcard replacement scenario detected: ${card.rank}${card.suit} can replace wildcard in gap`);
            return true;
          }
        }
      }
    }

    console.log(`[LAYOFF] canCardFitMeld: card=${card.rank}-${card.suit} (wild=${card.isWild}), meld type=${meld.type}, cards=[${meld.cards.map(c => `${c.rank}-${c.suit}(w:${c.isWild})`).join(',')}], result=${result.valid}`);
    return result.valid;
  }
}

/**
 * Validate if a player can layoff a card
 */
export function canLayoffCard(
  state: GameState,
  playerId: string,
  cardId: string,
  meldOwnerId: string,
  meldIndex: number
): { valid: boolean; error?: string; needsWildcardPosition?: boolean; validPositions?: ('beginning' | 'end')[] } {
  // Check if player has met requirements
  const playerState = state.playerStates[playerId];
  if (!playerState.hasMetRequirements) {
    return { valid: false, error: 'Must meet requirements first' };
  }

  // Get the card from player's hand
  const card = findCardById(playerState.hand, cardId);
  if (!card) {
    return { valid: false, error: 'Card not in hand' };
  }

  // Get the target meld
  const meldOwnerState = state.playerStates[meldOwnerId];
  if (!meldOwnerState) {
    return { valid: false, error: 'Invalid meld owner' };
  }

  const meld = meldOwnerState.melds[meldIndex];
  if (!meld) {
    return { valid: false, error: 'Invalid meld' };
  }

  // Check if card can fit the meld
  if (!canCardFitMeld(card, meld)) {
    return { valid: false, error: 'Card does not fit meld' };
  }

  // Special handling for wildcard layoff on runs
  if (card.isWild && meld.type === 'run') {
    // Check if the wildcard would fill a gap vs extend at the ends
    // Get non-wild cards from the meld
    const meldNonWilds = getNonWildcards(meld.cards);
    const meldWilds = getWildcards(meld.cards);

    if (meldNonWilds.length > 0) {
      // Calculate how many wildcards are needed to fill gaps
      const values = meldNonWilds.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
      let gapsToFill = 0;
      for (let i = 1; i < values.length; i++) {
        gapsToFill += values[i] - values[i - 1] - 1;
      }

      // If the meld has gaps that aren't fully filled by existing wildcards, the new wildcard fills a gap
      if (gapsToFill > meldWilds.length) {
        console.log(`[LAYOFF] Wild card fills gap in run - no position choice needed`);
        // Wildcard fills a gap, no position choice needed
        return { valid: true };
      }
    }

    // Otherwise, check if wildcard can extend at beginning/end
    const validPositions = getValidWildcardPositions(meld);
    console.log(`[LAYOFF] Wild card extends run: card=${card.rank}-${card.suit}, meld=[${meld.cards.map(c => `${c.rank}-${c.suit}`).join(',')}], validPositions=[${validPositions.join(',')}]`);
    if (validPositions.length === 0) {
      return { valid: false, error: 'Wildcard cannot extend this run' };
    }

    if (validPositions.length > 1) {
      // Multiple positions: user needs to choose
      return {
        valid: true,
        needsWildcardPosition: true,
        validPositions
      };
    }

    // Single valid position: return it so processLayoffCard knows where to put the wildcard
    return { valid: true, validPositions };
  }

  return { valid: true };
}

/**
 * Process a layoff card action
 */
export function processLayoffCard(state: GameState, action: LayoffCardAction): ActionResult {
  const validation = canLayoffCard(
    state,
    action.playerId,
    action.cardId,
    action.meldOwnerId,
    action.meldIndex
  );

  // If needs wildcard position and not provided, return error
  if (validation.needsWildcardPosition && !action.wildcardPosition) {
    return {
      success: false,
      error: 'Must specify wildcard position',
      newState: state,
      sideEffects: [{
        type: 'NEEDS_WILDCARD_POSITION',
        arrangements: validation.validPositions?.map(pos => ({
          sequence: pos,
          description: pos === 'beginning' ? 'At the beginning' : 'At the end',
          startValue: 0,
          endValue: 0,
          aceHigh: false,
          values: []
        })) || []
      }]
    };
  }

  if (!validation.valid && !validation.needsWildcardPosition) {
    return { success: false, error: validation.error, newState: state };
  }

  const playerState = state.playerStates[action.playerId];
  const meldOwnerState = state.playerStates[action.meldOwnerId];
  const card = findCardById(playerState.hand, action.cardId)!;
  const meld = meldOwnerState.melds[action.meldIndex];

  // Handle wildcard replacement scenario
  if (action.wildcardToReplace && meld.type === 'run') {
    return processWildcardReplacement(state, action, card, meld);
  }

  // Regular layoff
  let newMeldCards: Card[];

  if (card.isWild && meld.type === 'run') {
    // Add wildcard and re-sort the run to place it at its logical position
    const position = action.wildcardPosition || validation.validPositions?.[0] || 'end';
    newMeldCards = sortRunCards([...meld.cards, card], position);
  } else if (meld.type === 'run') {
    // Non-wildcard run layoff - sort properly
    newMeldCards = sortRunCards([...meld.cards, card]);
  } else {
    // Set layoff - just add the card
    newMeldCards = [...meld.cards, card];
  }

  // Update the meld
  const newMelds = [...meldOwnerState.melds];
  newMelds[action.meldIndex] = { ...meld, cards: newMeldCards };

  // Remove card from player's hand
  const newHand = removeCardById(playerState.hand, action.cardId);
  console.log(`[LAYOFF] Player ${action.playerId} hand before: ${playerState.hand.length} cards, after: ${newHand.length} cards`);
  console.log(`[LAYOFF] Removed card ${action.cardId}, hand now: [${newHand.map(c => c.id).join(', ')}]`);

  // Create new state - handle case where player lays off on their own meld
  let newPlayerStates: Record<string, typeof playerState>;

  if (action.playerId === action.meldOwnerId) {
    // Same player: update both hand AND melds together
    newPlayerStates = {
      ...state.playerStates,
      [action.playerId]: {
        ...playerState,
        hand: newHand,
        melds: newMelds
      }
    };
  } else {
    // Different players: update separately
    newPlayerStates = {
      ...state.playerStates,
      [action.playerId]: {
        ...playerState,
        hand: newHand
      },
      [action.meldOwnerId]: {
        ...meldOwnerState,
        melds: newMelds
      }
    };
  }

  const newState: GameState = {
    ...state,
    playerStates: newPlayerStates
  };

  // Check if player went out
  const sideEffects: ActionSideEffect[] = [];
  if (newHand.length === 0) {
    sideEffects.push({ type: 'ROUND_ENDED', winnerId: action.playerId });
  }

  return {
    success: true,
    newState,
    sideEffects: sideEffects.length > 0 ? sideEffects : undefined
  };
}

/**
 * Process wildcard replacement in a run
 */
function processWildcardReplacement(
  state: GameState,
  action: LayoffCardAction,
  card: Card,
  meld: Meld
): ActionResult {
  const playerState = state.playerStates[action.playerId];
  const meldOwnerState = state.playerStates[action.meldOwnerId];

  // Find the wildcard to replace
  const wildcardCard = meld.cards.find(c => c.id === action.wildcardToReplace);
  if (!wildcardCard || !wildcardCard.isWild) {
    return { success: false, error: 'Invalid wildcard replacement', newState: state };
  }

  // Remove wildcard from meld
  let newCards = meld.cards.filter(c => c.id !== action.wildcardToReplace);

  // Add the replacement card
  newCards.push(card);

  // Sort the cards
  newCards = sortRunCards(newCards);

  // Validate the run is still valid
  if (!validateRun(newCards).valid) {
    return { success: false, error: 'Invalid run after replacement', newState: state };
  }

  // Get valid positions for the wildcard to extend the run
  const tempMeld: Meld = { type: 'run', cards: newCards };
  const validPositions = getValidWildcardPositions(tempMeld);

  if (validPositions.length === 0) {
    return { success: false, error: 'Wildcard cannot extend this run', newState: state };
  }

  // If multiple positions and not specified, prompt
  if (validPositions.length > 1 && !action.wildcardNewPosition) {
    return {
      success: false,
      error: 'Must specify wildcard position',
      newState: state,
      sideEffects: [{
        type: 'NEEDS_WILDCARD_POSITION',
        arrangements: validPositions.map(pos => ({
          sequence: pos,
          description: pos === 'beginning' ? 'At the beginning' : 'At the end',
          startValue: 0,
          endValue: 0,
          aceHigh: false,
          values: []
        }))
      }]
    };
  }

  // Validate the chosen position
  const chosenPosition = action.wildcardNewPosition || validPositions[0];
  if (!validPositions.includes(chosenPosition)) {
    return { success: false, error: 'Invalid wildcard position', newState: state };
  }

  // Add wildcard at chosen position
  if (chosenPosition === 'beginning') {
    newCards = [wildcardCard, ...newCards];
  } else {
    newCards = [...newCards, wildcardCard];
  }

  // Update the meld
  const newMelds = [...meldOwnerState.melds];
  newMelds[action.meldIndex] = { ...meld, cards: newCards };

  // Remove card from player's hand
  const newHand = removeCardById(playerState.hand, action.cardId);

  // Create new state
  const newState: GameState = {
    ...state,
    playerStates: {
      ...state.playerStates,
      [action.playerId]: {
        ...playerState,
        hand: newHand
      },
      [action.meldOwnerId]: {
        ...meldOwnerState,
        melds: newMelds
      }
    }
  };

  // Check if player went out
  const sideEffects: ActionSideEffect[] = [];
  if (newHand.length === 0) {
    sideEffects.push({ type: 'ROUND_ENDED', winnerId: action.playerId });
  }

  return {
    success: true,
    newState,
    sideEffects: sideEffects.length > 0 ? sideEffects : undefined
  };
}
