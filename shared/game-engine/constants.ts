/**
 * Hawaiian Rummy - Game Constants
 * Single source of truth for all game constants
 */

import { Suit, Rank, RoundRequirement } from './types';

// ===== CARD CONSTANTS =====

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const WILD_RANKS: Rank[] = ['2', 'Joker'];

export const NUM_DECKS = 3;

export const NUM_JOKERS = 6;

// ===== TIMING CONSTANTS =====

export const BUY_WINDOW_DURATION = 5000; // 5 seconds for buy window

export const AI_DECISION_DELAY = 1500; // 1.5 second delay for AI thinking

// ===== PLAYER CONSTANTS =====

export const MAX_PLAYERS = 4;

export const MIN_PLAYERS_TO_START = 1;

export const INITIAL_HAND_SIZE = 9;

export const AI_NAMES = ['Alex-AI', 'Jordan-AI', 'Taylor-AI'];

// ===== ROUND REQUIREMENTS =====

export const ROUND_REQUIREMENTS: RoundRequirement[] = [
  {
    sets: 2,
    setSizes: [3, 3],
    runs: 0,
    runSizes: [],
    totalCards: 6,
    maxBuys: 3,
    description: "2 sets of 3"
  },
  {
    sets: 1,
    setSizes: [3],
    runs: 1,
    runSizes: [4],
    totalCards: 7,
    maxBuys: 3,
    description: "1 set of 3 and a run of 4"
  },
  {
    sets: 0,
    setSizes: [],
    runs: 2,
    runSizes: [4, 4],
    totalCards: 8,
    maxBuys: 3,
    description: "2 runs of 4"
  },
  {
    sets: 3,
    setSizes: [3, 3, 3],
    runs: 0,
    runSizes: [],
    totalCards: 9,
    maxBuys: 3,
    description: "3 sets of 3"
  },
  {
    sets: 1,
    setSizes: [3],
    runs: 1,
    runSizes: [7],
    totalCards: 10,
    maxBuys: 3,
    description: "1 set of 3 and a run of 7"
  },
  {
    sets: 2,
    setSizes: [3, 3],
    runs: 1,
    runSizes: [5],
    totalCards: 11,
    maxBuys: 3,
    description: "2 sets of 3 and a run of 5"
  },
  {
    sets: 3,
    setSizes: [4, 4, 4],
    runs: 0,
    runSizes: [],
    totalCards: 12,
    maxBuys: 3,
    description: "3 sets of 4"
  },
  {
    sets: 1,
    setSizes: [3],
    runs: 1,
    runSizes: [10],
    totalCards: 13,
    maxBuys: 3,
    description: "1 set of 3 and a run of 10"
  },
  {
    sets: 3,
    setSizes: [3, 3, 3],
    runs: 1,
    runSizes: [5],
    totalCards: 14,
    maxBuys: 3,
    description: "3 sets of 3 and a run of 5"
  },
  {
    sets: 0,
    setSizes: [],
    runs: 3,
    runSizes: [5, 5, 5],
    totalCards: 15,
    maxBuys: 4,
    description: "3 runs of 5"
  }
];

export const TOTAL_ROUNDS = ROUND_REQUIREMENTS.length;

// ===== CARD POINT VALUES =====

export const CARD_POINTS = {
  JOKER: 50,
  '2': 20,  // Wild 2s
  'A': 15,
  '10': 10,
  'J': 10,
  'Q': 10,
  'K': 10,
  DEFAULT: 5  // 3-9
} as const;

// ===== RANK VALUES FOR RUNS =====

export const RANK_VALUES: Record<Rank, number> = {
  'A': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'Joker': 0
};

export const ACE_HIGH_VALUE = 14;

// ===== VALIDATION CONSTANTS =====

export const MIN_SET_SIZE = 3;

export const MIN_RUN_SIZE = 4;
