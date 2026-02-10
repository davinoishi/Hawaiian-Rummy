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

  // Get all valid arrangements
  const arrangements = getPossibleRunArrangements(cards);

  // If no valid arrangements, fall back to basic sorting
  if (arrangements.length === 0) {
    const aceHigh = shouldAceBeHigh(nonWildCards);
    const sorted = sortCardsByRank(nonWildCards, aceHigh);
    return [...sorted, ...wildCards];
  }

  // If wildcardPlacement is a number, use the specific arrangement
  if (typeof wildcardPlacement === 'number') {
    if (wildcardPlacement >= 0 && wildcardPlacement < arrangements.length) {
      return sortCardsToMatchArrangement(cards, arrangements[wildcardPlacement]);
    }
  }

  // For 'beginning' or 'end' preference, find matching arrangement
  if (wildcardPlacement === 'beginning' || wildcardPlacement === 'end') {
    const aceHigh = shouldAceBeHigh(nonWildCards);
    const sorted = sortCardsByRank(nonWildCards, aceHigh);
    const lowestNonWildVal = getRankValue(sorted[0].rank, aceHigh && sorted[0].rank === 'A');
    const highestNonWildVal = getRankValue(sorted[sorted.length - 1].rank, aceHigh && sorted[sorted.length - 1].rank === 'A');

    // Find arrangement that matches the preference
    let bestArrangement = arrangements[0];
    for (const arr of arrangements) {
      if (wildcardPlacement === 'beginning' && arr.startValue < lowestNonWildVal) {
        bestArrangement = arr;
        break;
      }
      if (wildcardPlacement === 'end' && arr.endValue > highestNonWildVal) {
        bestArrangement = arr;
        break;
      }
    }
    return sortCardsToMatchArrangement(cards, bestArrangement);
  }

  // Auto mode: use the first valid arrangement (which properly distributes wildcards)
  // This ensures wildcards are placed at their logical positions in the sequence
  return sortCardsToMatchArrangement(cards, arrangements[0]);
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
  const wildCards = getWildcards(meld.cards);

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

  const minNonWild = nonWildValues[0];
  const maxNonWild = nonWildValues[nonWildValues.length - 1];

  // Calculate gaps between non-wild cards (these are filled by wildcards)
  let gapsNeeded = 0;
  for (let i = 1; i < nonWildValues.length; i++) {
    gapsNeeded += nonWildValues[i] - nonWildValues[i - 1] - 1;
  }

  // Wildcards not used for gaps extend at the ends
  const wildsForExtension = wildCards.length - gapsNeeded;

  // Calculate the effective range of the current run (including wildcards)
  // Wildcards extending at ends are distributed - assume they extend toward higher values first
  // (this matches how runs are typically displayed)
  let effectiveMin = minNonWild;
  let effectiveMax = maxNonWild;

  // For existing wildcards, assume they extend the run at the end first, then beginning
  let remainingWilds = wildsForExtension;
  while (remainingWilds > 0 && effectiveMax < ACE_HIGH_VALUE) {
    effectiveMax++;
    remainingWilds--;
  }
  while (remainingWilds > 0 && effectiveMin > 1) {
    effectiveMin--;
    remainingWilds--;
  }

  console.log(`[RUN] getValidWildcardPositions: nonWilds=[${nonWildValues.join(',')}], wilds=${wildCards.length}, gaps=${gapsNeeded}, effectiveRange=${effectiveMin}-${effectiveMax}, aceHigh=${aceHigh}`);

  const validPositions: ('beginning' | 'end')[] = [];

  // Check if wildcard can go at the beginning (one before effectiveMin)
  const valueAtBeginning = effectiveMin - 1;
  if (valueAtBeginning >= 1) {
    // Don't allow wrap-around (going below Ace low or wrapping from Ace high to 2)
    if (!(aceHigh && valueAtBeginning === 1)) {
      validPositions.push('beginning');
    }
  }

  // Check if wildcard can go at the end (one after effectiveMax)
  const valueAtEnd = effectiveMax + 1;
  if (valueAtEnd <= ACE_HIGH_VALUE) {
    // Don't allow wrap-around (going above Ace high or wrapping from Ace low to King)
    if (!(aceHigh && valueAtEnd > ACE_HIGH_VALUE) && !(!aceHigh && valueAtEnd > 13)) {
      validPositions.push('end');
    }
  }

  console.log(`[RUN] getValidWildcardPositions result: [${validPositions.join(',')}]`);
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
