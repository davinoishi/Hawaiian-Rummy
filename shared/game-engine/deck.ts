/**
 * Hawaiian Rummy - Deck Functions
 * Pure functions for deck creation and manipulation
 */

import { Card, Suit, Rank } from './types';
import { SUITS, RANKS, NUM_DECKS, NUM_JOKERS } from './constants';

/**
 * Create a new shuffled deck of cards
 * Hawaiian Rummy uses 3 standard decks + 6 jokers
 * @returns Array of shuffled cards
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  // Add cards from each deck
  for (let deckNum = 0; deckNum < NUM_DECKS; deckNum++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          suit,
          rank,
          id: `${rank}${suit}${deckNum}`,
          isWild: rank === '2'
        });
      }
    }
  }

  // Add jokers
  for (let i = 0; i < NUM_JOKERS; i++) {
    deck.push({
      suit: '',
      rank: 'Joker',
      id: `Joker${i}`,
      isWild: true
    });
  }

  return shuffleDeck(deck);
}

/**
 * Shuffle a deck of cards using Fisher-Yates algorithm
 * Performs multiple passes for better randomization
 * @param deck - Cards to shuffle
 * @returns New shuffled array of cards
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];

  // Perform Fisher-Yates shuffle multiple times for better randomization
  for (let pass = 0; pass < 3; pass++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  return shuffled;
}

/**
 * Draw a card from the top of the deck
 * @param deck - The deck to draw from
 * @returns Tuple of [drawnCard, remainingDeck]
 */
export function drawCard(deck: Card[]): [Card | undefined, Card[]] {
  if (deck.length === 0) {
    return [undefined, deck];
  }

  const [card, ...remaining] = deck;
  return [card, remaining];
}

/**
 * Draw multiple cards from the deck
 * @param deck - The deck to draw from
 * @param count - Number of cards to draw
 * @returns Tuple of [drawnCards, remainingDeck]
 */
export function drawCards(deck: Card[], count: number): [Card[], Card[]] {
  const drawn = deck.slice(0, count);
  const remaining = deck.slice(count);
  return [drawn, remaining];
}

/**
 * Add a card to the bottom of the deck
 * @param deck - The deck
 * @param card - Card to add
 * @returns New deck with card at bottom
 */
export function addCardToBottom(deck: Card[], card: Card): Card[] {
  return [...deck, card];
}

/**
 * Add a card to the top of the deck
 * @param deck - The deck
 * @param card - Card to add
 * @returns New deck with card at top
 */
export function addCardToTop(deck: Card[], card: Card): Card[] {
  return [card, ...deck];
}

/**
 * Check if the deck is empty
 * @param deck - The deck to check
 * @returns True if deck has no cards
 */
export function isDeckEmpty(deck: Card[]): boolean {
  return deck.length === 0;
}

/**
 * Get the number of cards in the deck
 * @param deck - The deck
 * @returns Number of cards
 */
export function getDeckSize(deck: Card[]): number {
  return deck.length;
}

/**
 * Create a deck with specific cards (for testing/tutorial)
 * @param cards - Specific cards to include
 * @returns The specified deck
 */
export function createCustomDeck(cards: Card[]): Card[] {
  return [...cards];
}

/**
 * Peek at the top card of the deck without removing it
 * @param deck - The deck
 * @returns The top card or undefined
 */
export function peekTopCard(deck: Card[]): Card | undefined {
  return deck[0];
}
