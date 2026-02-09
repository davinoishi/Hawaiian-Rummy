/**
 * Hawaiian Rummy - Set Validation
 * Pure functions for validating sets (3+ cards of same rank)
 */

import { Card, Meld, ValidationResult } from '../types';
import { MIN_SET_SIZE } from '../constants';
import { getNonWildcards, getWildcards } from '../card-utils';

/**
 * Validate that cards form a valid set
 * A set is 3+ cards of the same rank (wildcards can substitute)
 *
 * @param cards - Cards to validate as a set
 * @returns ValidationResult with success status and error message
 */
export function validateSet(cards: Card[]): ValidationResult {
  // Must have at least MIN_SET_SIZE cards
  if (cards.length < MIN_SET_SIZE) {
    return {
      valid: false,
      error: `A set requires at least ${MIN_SET_SIZE} cards`
    };
  }

  // Get non-wild cards
  const nonWildCards = getNonWildcards(cards);

  // Must have at least one non-wild card to establish the rank
  if (nonWildCards.length === 0) {
    return {
      valid: false,
      error: 'A set must contain at least one non-wild card'
    };
  }

  // All non-wild cards must have the same rank
  const rank = nonWildCards[0].rank;
  const allSameRank = nonWildCards.every(c => c.rank === rank);

  if (!allSameRank) {
    return {
      valid: false,
      error: 'All cards in a set must have the same rank'
    };
  }

  return { valid: true };
}

/**
 * Check if a set is valid (simple boolean version)
 * @param cards - Cards to validate
 * @returns True if valid set
 */
export function isValidSet(cards: Card[]): boolean {
  return validateSet(cards).valid;
}

/**
 * Get the rank of a set from its cards
 * @param cards - Cards in the set
 * @returns The rank or undefined if no non-wild cards
 */
export function getSetRank(cards: Card[]): string | undefined {
  const nonWildCards = getNonWildcards(cards);
  return nonWildCards.length > 0 ? nonWildCards[0].rank : undefined;
}

/**
 * Check if a card can be added to an existing set
 * @param card - Card to check
 * @param set - Existing set meld
 * @returns True if card can be added
 */
export function canAddToSet(card: Card, set: Meld): boolean {
  if (set.type !== 'set') {
    return false;
  }

  // Wildcards can always be added to sets
  if (card.isWild) {
    return true;
  }

  // Card must match the rank of the set
  const setRank = getSetRank(set.cards);
  return setRank !== undefined && card.rank === setRank;
}

/**
 * Find all possible sets in a hand
 * @param hand - Player's hand
 * @param wildcards - Available wildcards to use
 * @param minSize - Minimum set size (default 3)
 * @returns Array of possible sets (each is array of cards)
 */
export function findPossibleSets(
  hand: Card[],
  minSize: number = MIN_SET_SIZE
): Card[][] {
  const nonWildCards = getNonWildcards(hand);
  const wildcards = getWildcards(hand);

  // Group by rank
  const rankGroups = new Map<string, Card[]>();
  for (const card of nonWildCards) {
    const existing = rankGroups.get(card.rank) || [];
    existing.push(card);
    rankGroups.set(card.rank, existing);
  }

  const possibleSets: Card[][] = [];

  // Find all sets for each rank
  for (const [rank, cards] of rankGroups) {
    // Check if we can form a set with this rank
    const naturalCount = cards.length;

    // Try different sizes from minSize up to natural + wildcards
    for (let size = minSize; size <= naturalCount + wildcards.length; size++) {
      const wildsNeeded = Math.max(0, size - naturalCount);

      if (wildsNeeded <= wildcards.length && naturalCount > 0) {
        const setCards = [
          ...cards.slice(0, Math.min(size, naturalCount)),
          ...wildcards.slice(0, wildsNeeded)
        ];

        if (setCards.length >= minSize) {
          possibleSets.push(setCards);
        }
      }
    }
  }

  return possibleSets;
}

/**
 * Find the best sets that meet size requirements
 * @param hand - Player's hand
 * @param setSizes - Required sizes for each set (e.g., [3, 3] for two sets of 3)
 * @returns Array of set card arrays that meet requirements, or empty if not possible
 */
export function findSetsMatchingRequirements(
  hand: Card[],
  setSizes: number[]
): Card[][] {
  if (setSizes.length === 0) {
    return [];
  }

  const nonWildCards = getNonWildcards(hand);
  let availableWildcards = [...getWildcards(hand)];

  // Group by rank
  const rankGroups = new Map<string, Card[]>();
  for (const card of nonWildCards) {
    const existing = rankGroups.get(card.rank) || [];
    existing.push(card);
    rankGroups.set(card.rank, existing);
  }

  const foundSets: Card[][] = [];

  // Try to find sets for each required size
  for (const requiredSize of setSizes) {
    let foundSet = false;

    // Sort rank groups by size (prefer groups that need fewer wildcards)
    const sortedGroups = Array.from(rankGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);

    for (const [rank, cards] of sortedGroups) {
      const naturalCount = cards.length;
      const wildsNeeded = Math.max(0, requiredSize - naturalCount);

      if (naturalCount > 0 && wildsNeeded <= availableWildcards.length) {
        // Create the set
        const setCards = [
          ...cards.slice(0, Math.min(requiredSize, naturalCount)),
          ...availableWildcards.slice(0, wildsNeeded)
        ];

        if (setCards.length >= requiredSize) {
          foundSets.push(setCards);

          // Remove used wildcards
          availableWildcards = availableWildcards.slice(wildsNeeded);

          // Remove this rank from consideration
          rankGroups.delete(rank);

          foundSet = true;
          break;
        }
      }
    }

    if (!foundSet) {
      // Couldn't find a set of this size
      return [];
    }
  }

  return foundSets;
}
