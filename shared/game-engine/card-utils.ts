/**
 * Hawaiian Rummy - Card Utility Functions
 * Pure functions for card operations
 */

import { Card, Rank, Suit } from './types';
import { CARD_POINTS, RANK_VALUES, ACE_HIGH_VALUE, WILD_RANKS } from './constants';

/**
 * Get the numeric rank value for a card (used in runs)
 * @param rank - The card rank
 * @param aceHigh - Whether to treat Ace as high (14) or low (1)
 * @returns The numeric value of the rank
 */
const SUIT_DISPLAY_ORDER: Suit[] = ['♠', '♥', '♦', '♣'];

export function getRankValue(rank: Rank, aceHigh: boolean = false): number {
  if (rank === 'A' && aceHigh) {
    return ACE_HIGH_VALUE;
  }
  return RANK_VALUES[rank];
}

/**
 * Get the point value for a card (used in scoring)
 * @param card - The card to score
 * @returns The point value of the card
 */
export function getCardPoints(card: Card): number {
  if (card.rank === 'Joker') return CARD_POINTS.JOKER;
  if (card.rank === '2') return CARD_POINTS['2'];
  if (card.rank === 'A') return CARD_POINTS.A;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return CARD_POINTS['10'];
  return CARD_POINTS.DEFAULT;
}

/**
 * Check if a card is a wildcard (Joker or 2)
 * @param card - The card to check
 * @returns True if the card is wild
 */
export function isWildcard(card: Card): boolean {
  return WILD_RANKS.includes(card.rank);
}

/**
 * Get the display string for a card
 * @param card - The card to display
 * @returns Display string like "A♠" or "JOKER"
 */
export function getCardDisplay(card: Card): string {
  if (card.rank === 'Joker') {
    return 'JOKER';
  }
  return `${card.rank}${card.suit}`;
}

/**
 * Get the color of a card's suit
 * @param suit - The suit
 * @returns 'red' or 'black'
 */
export function getSuitColor(suit: Suit): 'red' | 'black' {
  return suit === '♥' || suit === '♦' ? 'red' : 'black';
}

/**
 * Sort cards by rank value
 * @param cards - Cards to sort
 * @param aceHigh - Whether to treat Ace as high
 * @returns Sorted cards (new array)
 */
export function sortCardsByRank(cards: Card[], aceHigh: boolean = false): Card[] {
  return [...cards].sort((a, b) => {
    const aVal = getRankValue(a.rank, aceHigh && a.rank === 'A');
    const bVal = getRankValue(b.rank, aceHigh && b.rank === 'A');
    return aVal - bVal;
  });
}

/**
 * Sort cards by suit, then by rank
 * @param cards - Cards to sort
 * @returns Sorted cards (new array)
 */
export function sortCardsBySuit(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { '♠': 0, '♥': 1, '♦': 2, '♣': 3, '': 4 };

  return [...cards].sort((a, b) => {
    const suitDiff = suitOrder[a.suit] - suitOrder[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return getRankValue(a.rank) - getRankValue(b.rank);
  });
}

/**
 * How a player's hand is ordered in the UI.
 */
export type HandSortMode = 'none' | 'rank' | 'suit';

/**
 * Sort a hand for display.
 *
 * 'rank' orders by rank value. 'suit' groups by suit in ♠ ♥ ♦ ♣ order, ranked
 * within each group. Wildcards (2s and Jokers) always go last in 'suit' mode so
 * they are easy to find. 'none' returns the hand untouched, preserving whatever
 * manual order the player dragged it into.
 *
 * Sorting is idempotent - sorting an already-sorted hand returns the same order -
 * which is what lets the client re-apply a sticky sort without looping.
 */
export function sortHand(cards: Card[], mode: HandSortMode): Card[] {
  if (mode === 'none' || cards.length === 0) return [...cards];
  if (mode === 'rank') return sortCardsByRank(cards);

  const grouped = groupBySuit(cards);
  const result: Card[] = [];

  for (const suit of SUIT_DISPLAY_ORDER) {
    const suitCards = grouped.get(suit);
    if (suitCards) result.push(...sortCardsByRank(suitCards));
  }

  // groupBySuit skips wildcards, so append them here.
  result.push(...cards.filter(card => isWildcard(card)));

  return result;
}

/**
 * Calculate total points in a hand
 * @param hand - Array of cards
 * @returns Total point value
 */
export function calculateHandPoints(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + getCardPoints(card), 0);
}

/**
 * Group cards by rank
 * @param cards - Cards to group
 * @returns Map of rank to cards array
 */
export function groupByRank(cards: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();

  for (const card of cards) {
    if (card.isWild) continue;

    const existing = groups.get(card.rank) || [];
    existing.push(card);
    groups.set(card.rank, existing);
  }

  return groups;
}

/**
 * Group cards by suit
 * @param cards - Cards to group
 * @returns Map of suit to cards array
 */
export function groupBySuit(cards: Card[]): Map<Suit, Card[]> {
  const groups = new Map<Suit, Card[]>();

  for (const card of cards) {
    if (card.isWild) continue;

    const existing = groups.get(card.suit) || [];
    existing.push(card);
    groups.set(card.suit, existing);
  }

  return groups;
}

/**
 * Get all wildcards from a card array
 * @param cards - Cards to filter
 * @returns Array of wildcard cards
 */
export function getWildcards(cards: Card[]): Card[] {
  return cards.filter(c => c.isWild);
}

/**
 * Get all non-wildcard cards from a card array
 * @param cards - Cards to filter
 * @returns Array of non-wild cards
 */
export function getNonWildcards(cards: Card[]): Card[] {
  return cards.filter(c => !c.isWild);
}

/**
 * Find a card by ID in an array
 * @param cards - Cards to search
 * @param cardId - Card ID to find
 * @returns The card or undefined
 */
export function findCardById(cards: Card[], cardId: string): Card | undefined {
  return cards.find(c => c.id === cardId);
}

/**
 * Remove a card by ID from an array (returns new array)
 * @param cards - Source cards
 * @param cardId - Card ID to remove
 * @returns New array without the card
 */
export function removeCardById(cards: Card[], cardId: string): Card[] {
  return cards.filter(c => c.id !== cardId);
}

/**
 * Remove multiple cards by IDs from an array (returns new array)
 * @param cards - Source cards
 * @param cardIds - Card IDs to remove
 * @returns New array without the cards
 */
export function removeCardsByIds(cards: Card[], cardIds: string[]): Card[] {
  const idsSet = new Set(cardIds);
  return cards.filter(c => !idsSet.has(c.id));
}

/**
 * Get cards by IDs from an array
 * @param cards - Source cards
 * @param cardIds - Card IDs to get
 * @returns Array of matching cards
 */
export function getCardsByIds(cards: Card[], cardIds: string[]): Card[] {
  const idsSet = new Set(cardIds);
  return cards.filter(c => idsSet.has(c.id));
}

/**
 * Determine if Ace should be high based on surrounding cards
 * @param cards - Non-wild cards in a potential run
 * @returns True if Ace should be treated as high
 */
export function shouldAceBeHigh(cards: Card[]): boolean {
  const ranks = cards.map(c => c.rank);
  const hasKing = ranks.includes('K');
  const hasQueen = ranks.includes('Q');
  const hasTwo = ranks.includes('2');
  const hasThree = ranks.includes('3');

  // Ace is high if we have face cards but no low cards
  return (hasKing || hasQueen) && !hasTwo && !hasThree;
}
