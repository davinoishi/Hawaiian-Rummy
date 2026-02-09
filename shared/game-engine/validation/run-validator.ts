/**
 * Hawaiian Rummy - Run Validation
 * Pure functions for validating runs (4+ consecutive cards of same suit)
 */

import { Card, Meld, ValidationResult, WildcardArrangement } from '../types';
import { MIN_RUN_SIZE, ACE_HIGH_VALUE } from '../constants';
import {
  getNonWildcards,
  getWildcards,
  getRankValue,
  shouldAceBeHigh,
  sortCardsByRank
} from '../card-utils';

/**
 * Get all possible valid run arrangements with wildcards
 * This handles cases where wildcards can be placed at different positions
 *
 * @param cards - Cards to validate as a run
 * @returns Array of possible arrangements
 */
export function getPossibleRunArrangements(cards: Card[]): WildcardArrangement[] {
  if (cards.length < MIN_RUN_SIZE) {
    console.log(`[RUN] Invalid: only ${cards.length} cards, need ${MIN_RUN_SIZE}`);
    return [];
  }

  const nonWildCards = getNonWildcards(cards);
  const wildCount = getWildcards(cards).length;

  console.log(`[RUN] Validating run: ${cards.length} cards total, ${nonWildCards.length} non-wild, ${wildCount} wild`);
  console.log(`[RUN] Non-wild cards:`, nonWildCards.map(c => `${c.rank}-${c.suit}`).join(', '));
  console.log(`[RUN] Wild cards:`, getWildcards(cards).map(c => `${c.rank}-${c.suit} (isWild: ${c.isWild})`).join(', '));
  console.log(`[RUN] All cards isWild status:`, cards.map(c => `${c.rank}-${c.suit}: ${c.isWild}`).join(', '));

  if (nonWildCards.length === 0) {
    console.log(`[RUN] Invalid: no non-wild cards`);
    return [];
  }

  // All non-wild cards must have the same suit
  const suit = nonWildCards[0].suit;
  if (!nonWildCards.every(c => c.suit === suit)) {
    console.log(`[RUN] Invalid: non-wild cards have different suits`);
    return [];
  }

  // Check for duplicate ranks in non-wild cards (runs cannot have duplicates)
  const ranks = nonWildCards.map(c => c.rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== ranks.length) {
    console.log(`[RUN] Invalid: duplicate ranks found - ${ranks.join(', ')}`);
    return []; // Duplicate ranks found - invalid run
  }

  const arrangements: WildcardArrangement[] = [];

  // Try both Ace low and Ace high interpretations
  for (const aceHigh of [false, true]) {
    // Get values for non-wild cards
    const cardValues = nonWildCards
      .map(c => {
        if (c.rank === 'A') return aceHigh ? ACE_HIGH_VALUE : 1;
        return getRankValue(c.rank);
      })
      .sort((a, b) => a - b);

    const minCard = cardValues[0];
    const maxCard = cardValues[cardValues.length - 1];

    // Calculate how many wildcards are needed to fill gaps between non-wild cards
    let gapWilds = 0;
    for (let i = 1; i < cardValues.length; i++) {
      gapWilds += cardValues[i] - cardValues[i - 1] - 1;
    }

    // Remaining wildcards can extend the run at either end
    const remainingWilds = wildCount - gapWilds;

    console.log(`[RUN] aceHigh=${aceHigh}: cardValues=[${cardValues.join(',')}], min=${minCard}, max=${maxCard}, gapWilds=${gapWilds}, remainingWilds=${remainingWilds}`);

    if (remainingWilds < 0) {
      console.log(`[RUN] Skipping aceHigh=${aceHigh}: not enough wildcards (need ${gapWilds}, have ${wildCount})`);
      continue; // Not enough wildcards to fill gaps
    }

    // Try different distributions of remaining wildcards
    for (let wildsAtStart = 0; wildsAtStart <= remainingWilds; wildsAtStart++) {
      const wildsAtEnd = remainingWilds - wildsAtStart;

      const startValue = minCard - wildsAtStart;
      const endValue = maxCard + wildsAtEnd;

      // Check if this creates a valid run (no wrap-around)
      if (startValue < 1) continue; // Would need Ace to be low but also go below Ace
      if (endValue > ACE_HIGH_VALUE) continue; // Would go beyond Ace high

      // Check that the sequence doesn't wrap around
      const hasAce = nonWildCards.some(c => c.rank === 'A');
      if (hasAce) {
        if (aceHigh && startValue <= 3) continue; // If Ace is high, can't have 2,3 at start
        if (!aceHigh && endValue >= 13) continue; // If Ace is low, can't have K at end
      }

      // Build the sequence string
      const sequence: string[] = [];
      for (let v = startValue; v <= endValue; v++) {
        let rank: string;
        if (v === 1) rank = 'A';
        else if (v === 11) rank = 'J';
        else if (v === 12) rank = 'Q';
        else if (v === 13) rank = 'K';
        else if (v === ACE_HIGH_VALUE) rank = 'A';
        else rank = v.toString();

        sequence.push(rank);
      }

      // Check if this arrangement is valid and unique
      if (sequence.length === cards.length) {
        const sequenceStr = sequence.join('-');

        // Don't add duplicates
        if (!arrangements.find(a => a.sequence === sequenceStr)) {
          arrangements.push({
            sequence: sequenceStr,
            description: `${sequenceStr} (${sequence.length} cards)`,
            startValue,
            endValue,
            aceHigh,
            values: Array.from({ length: endValue - startValue + 1 }, (_, i) => startValue + i)
          });
        }
      }
    }
  }

  console.log(`[RUN] Found ${arrangements.length} valid arrangements:`, arrangements.map(a => a.sequence).join(', '));
  return arrangements;
}

/**
 * Validate that cards form a valid run
 * A run is 4+ consecutive cards of the same suit (wildcards can substitute)
 *
 * @param cards - Cards to validate as a run
 * @returns ValidationResult with success status and error message
 */
export function validateRun(cards: Card[]): ValidationResult {
  // Must have at least MIN_RUN_SIZE cards
  if (cards.length < MIN_RUN_SIZE) {
    return {
      valid: false,
      error: `A run requires at least ${MIN_RUN_SIZE} cards`
    };
  }

  // Use the arrangement checker to ensure no wrap-around sequences
  const arrangements = getPossibleRunArrangements(cards);

  if (arrangements.length === 0) {
    return {
      valid: false,
      error: 'Cards do not form a valid consecutive sequence'
    };
  }

  return { valid: true };
}

/**
 * Check if a run is valid (simple boolean version)
 * @param cards - Cards to validate
 * @returns True if valid run
 */
export function isValidRun(cards: Card[]): boolean {
  return validateRun(cards).valid;
}

/**
 * Get the suit of a run from its cards
 * @param cards - Cards in the run
 * @returns The suit or undefined if no non-wild cards
 */
export function getRunSuit(cards: Card[]): string | undefined {
  const nonWildCards = getNonWildcards(cards);
  return nonWildCards.length > 0 ? nonWildCards[0].suit : undefined;
}

/**
 * Sort cards to match a specific arrangement
 * @param cards - Cards to sort
 * @param arrangement - The arrangement to match
 * @returns Sorted cards array
 */
export function sortCardsToMatchArrangement(cards: Card[], arrangement: WildcardArrangement): Card[] {
  const nonWildCards = getNonWildcards(cards);
  const wildCards = getWildcards(cards);

  // Sort non-wild cards according to the arrangement
  const sortedNonWilds = [...nonWildCards].sort((a, b) => {
    const aVal = (a.rank === 'A' && arrangement.aceHigh) ? ACE_HIGH_VALUE : getRankValue(a.rank);
    const bVal = (b.rank === 'A' && arrangement.aceHigh) ? ACE_HIGH_VALUE : getRankValue(b.rank);
    return aVal - bVal;
  });

  const result: Card[] = [];
  let wildIdx = 0;
  let nonWildIdx = 0;

  // Build the sequence according to the arrangement values
  for (const value of arrangement.values) {
    // Check if this value matches the next non-wild card
    if (nonWildIdx < sortedNonWilds.length) {
      const card = sortedNonWilds[nonWildIdx];
      const cardValue = (card.rank === 'A' && arrangement.aceHigh) ? ACE_HIGH_VALUE : getRankValue(card.rank);

      if (cardValue === value) {
        result.push(card);
        nonWildIdx++;
        continue;
      }
    }

    // This position needs a wildcard
    if (wildIdx < wildCards.length) {
      result.push(wildCards[wildIdx]);
      wildIdx++;
    }
  }

  return result;
}

/**
 * Sort run cards with proper wildcard placement
 * @param cards - Cards in the run
 * @param wildcardPlacement - Optional placement preference (index or 'beginning'/'end')
 * @returns Sorted cards array
 */
export function sortRunCards(cards: Card[], wildcardPlacement?: number | 'beginning' | 'end'): Card[] {
  const nonWildCards = getNonWildcards(cards);
  const wildCards = getWildcards(cards);

  if (nonWildCards.length === 0) return cards;

  // If wildcardPlacement is a number, use the specific arrangement
  if (typeof wildcardPlacement === 'number') {
    const arrangements = getPossibleRunArrangements(cards);
    if (wildcardPlacement >= 0 && wildcardPlacement < arrangements.length) {
      return sortCardsToMatchArrangement(cards, arrangements[wildcardPlacement]);
    }
  }

  // Determine if Ace should be high
  const aceHigh = shouldAceBeHigh(nonWildCards);

  const sorted = sortCardsByRank(nonWildCards, aceHigh);

  const result: Card[] = [];
  const usedWilds: Card[] = [];

  // Fill gaps between non-wild cards first
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      let prevVal = getRankValue(sorted[i - 1].rank, aceHigh && sorted[i - 1].rank === 'A');
      let currVal = getRankValue(sorted[i].rank, aceHigh && sorted[i].rank === 'A');

      const gap = currVal - prevVal - 1;
      for (let j = 0; j < gap && usedWilds.length < wildCards.length; j++) {
        result.push(wildCards[usedWilds.length]);
        usedWilds.push(wildCards[usedWilds.length]);
      }
    }

    result.push(sorted[i]);
  }

  // Determine where to place remaining wildcards
  let placeAtBeginning = false;

  if (wildcardPlacement === 'beginning') {
    placeAtBeginning = true;
  } else if (wildcardPlacement === 'end') {
    placeAtBeginning = false;
  } else {
    // Auto-determine based on run position
    let lowestVal = getRankValue(sorted[0].rank, aceHigh && sorted[0].rank === 'A');
    let highestVal = getRankValue(sorted[sorted.length - 1].rank, aceHigh && sorted[sorted.length - 1].rank === 'A');

    const hasAce = nonWildCards.some(c => c.rank === 'A');

    // Check if run is at the top (can't extend higher)
    const atTop = highestVal === ACE_HIGH_VALUE || (aceHigh && hasAce);
    // Check if run is at the bottom (can't extend lower)
    const atBottom = lowestVal === 1 || (!aceHigh && hasAce) || lowestVal === 3;

    if (atTop && !atBottom) {
      placeAtBeginning = true;
    } else if (atBottom && !atTop) {
      placeAtBeginning = false;
    } else {
      placeAtBeginning = false;
    }
  }

  // Place remaining wildcards
  const remainingWilds = wildCards.slice(usedWilds.length);
  if (placeAtBeginning) {
    return [...remainingWilds, ...result];
  } else {
    return [...result, ...remainingWilds];
  }
}

/**
 * Get valid positions for a wildcard to extend a run
 * @param meld - The run meld
 * @returns Array of valid positions ('beginning' and/or 'end')
 */
export function getValidWildcardPositions(meld: Meld): ('beginning' | 'end')[] {
  if (meld.type !== 'run') {
    return [];
  }

  const nonWildCards = getNonWildcards(meld.cards);

  if (nonWildCards.length === 0) {
    return [];
  }

  // Determine if Ace should be high or low based on existing cards
  const aceHigh = shouldAceBeHigh(nonWildCards);

  // Get values of all non-wild cards
  const nonWildValues = nonWildCards
    .map(c => {
      const val = getRankValue(c.rank);
      return (c.rank === 'A' && aceHigh) ? ACE_HIGH_VALUE : val;
    })
    .sort((a, b) => a - b);

  const minValue = nonWildValues[0];
  const maxValue = nonWildValues[nonWildValues.length - 1];

  const validPositions: ('beginning' | 'end')[] = [];

  // Check if wildcard can go at the beginning (one before min)
  const valueAtBeginning = minValue - 1;
  if (valueAtBeginning >= 1 && valueAtBeginning <= ACE_HIGH_VALUE) {
    if (!(valueAtBeginning === ACE_HIGH_VALUE && !aceHigh) && !(valueAtBeginning === 1 && aceHigh)) {
      validPositions.push('beginning');
    }
  }

  // Check if wildcard can go at the end (one after max)
  const valueAtEnd = maxValue + 1;
  if (valueAtEnd >= 1 && valueAtEnd <= ACE_HIGH_VALUE) {
    if (!(valueAtEnd === ACE_HIGH_VALUE && !aceHigh) && !(valueAtEnd === 1 && aceHigh)) {
      validPositions.push('end');
    }
  }

  return validPositions;
}

/**
 * Check if a card can be added to an existing run
 * @param card - Card to check
 * @param run - Existing run meld
 * @returns True if card can be added
 */
export function canAddToRun(card: Card, run: Meld): boolean {
  if (run.type !== 'run') {
    return false;
  }

  // Try adding the card and validate
  const testCards = [...run.cards, card];
  return isValidRun(testCards);
}

/**
 * Check if a run needs wildcard position choice when creating
 * @param cards - Cards being melded
 * @returns True if multiple arrangements possible
 */
export function needsWildcardPositionChoice(cards: Card[]): boolean {
  const arrangements = getPossibleRunArrangements(cards);
  return arrangements.length > 1;
}

/**
 * Find all possible runs in a hand
 * @param hand - Player's hand
 * @param minSize - Minimum run size (default 4)
 * @returns Array of possible runs (each is array of cards)
 */
export function findPossibleRuns(hand: Card[], minSize: number = MIN_RUN_SIZE): Card[][] {
  const nonWildCards = getNonWildcards(hand);
  const wildcards = getWildcards(hand);

  // Group by suit
  const suitGroups = new Map<string, Card[]>();
  for (const card of nonWildCards) {
    const existing = suitGroups.get(card.suit) || [];
    existing.push(card);
    suitGroups.set(card.suit, existing);
  }

  const possibleRuns: Card[][] = [];

  // Find runs in each suit
  for (const [suit, cards] of suitGroups) {
    const sorted = sortCardsByRank(cards);

    // Try building runs starting from each card
    for (let start = 0; start < sorted.length; start++) {
      // Try different lengths
      for (let end = start + 1; end <= sorted.length; end++) {
        const subset = sorted.slice(start, end);

        // Try adding wildcards to form a valid run
        for (let numWilds = 0; numWilds <= wildcards.length; numWilds++) {
          const testCards = [...subset, ...wildcards.slice(0, numWilds)];

          if (testCards.length >= minSize && isValidRun(testCards)) {
            possibleRuns.push(testCards);
          }
        }
      }
    }
  }

  return possibleRuns;
}
