/**
 * Hawaiian Rummy - AI Personalities
 * Different play styles for AI players
 */

/**
 * AI Personality configuration
 */
export interface AIPersonality {
  name: string;
  description: string;

  // Buy behavior (0-1 scale, higher = more aggressive)
  buyAggressiveness: number;

  // How much to focus on bottleneck melds vs easy melds (0-1)
  bottleneckFocus: number;

  // Risk tolerance for discards (0-1, higher = more willing to discard useful cards)
  discardRiskTolerance: number;

  // How much to consider opponent state (0-1)
  opponentAwareness: number;

  // How much to value having a "junk" card to discard (0-1)
  junkCardAwareness: number;
}

/**
 * Predefined AI personalities
 * All personalities buy aggressively - the key difference is strategy
 */
export const AI_PERSONALITIES: Record<string, AIPersonality> = {
  aggressive: {
    name: 'Aggressive',
    description: 'Buys very frequently, takes risks to complete melds quickly',
    buyAggressiveness: 0.9,
    bottleneckFocus: 0.7,
    discardRiskTolerance: 0.6,
    opponentAwareness: 0.3,
    junkCardAwareness: 0.5
  },

  conservative: {
    name: 'Conservative',
    description: 'Still buys often but focuses on safe discards',
    buyAggressiveness: 0.6,
    bottleneckFocus: 0.5,
    discardRiskTolerance: 0.3,
    opponentAwareness: 0.6,
    junkCardAwareness: 0.8  // Values having safe discards
  },

  strategic: {
    name: 'Strategic',
    description: 'Focuses heavily on bottleneck melds (runs), smart buying',
    buyAggressiveness: 0.75,
    bottleneckFocus: 0.95,
    discardRiskTolerance: 0.4,
    opponentAwareness: 0.7,
    junkCardAwareness: 0.7
  },

  balanced: {
    name: 'Balanced',
    description: 'Well-rounded play style with good buying',
    buyAggressiveness: 0.7,
    bottleneckFocus: 0.7,
    discardRiskTolerance: 0.5,
    opponentAwareness: 0.5,
    junkCardAwareness: 0.6
  }
};

/**
 * Round difficulty analysis
 * Runs are generally harder than sets, so they're prioritized as bottlenecks
 */
export interface RoundStrategy {
  round: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  bottleneckType: 'set' | 'run' | 'both';
  bottleneckSize: number;  // The size of the hardest meld
  targetHandSize: number;  // Ideal hand size to aim for (includes junk cards)
  buyThresholdModifier: number;  // Multiplier for buy decisions (lower = buy more)
  minJunkCards: number;  // Minimum "disposable" cards to maintain
}

/**
 * Strategy data for each round
 * Key insight: Always maintain junk cards for safe discards
 * Runs are always prioritized over sets as bottlenecks
 */
export const ROUND_STRATEGIES: RoundStrategy[] = [
  // Round 1: 2 sets of 3 (6 cards needed) - sets only, but still buy
  {
    round: 0,
    difficulty: 'easy',
    bottleneckType: 'set',
    bottleneckSize: 3,
    targetHandSize: 10,  // 6 for melds + buffer
    buyThresholdModifier: 0.7,
    minJunkCards: 1
  },
  // Round 2: 1 set of 3 + 1 run of 4 (7 cards needed) - run is bottleneck
  {
    round: 1,
    difficulty: 'easy',
    bottleneckType: 'run',
    bottleneckSize: 4,
    targetHandSize: 10,
    buyThresholdModifier: 0.6,
    minJunkCards: 1
  },
  // Round 3: 2 runs of 4 (8 cards needed) - runs are bottleneck
  {
    round: 2,
    difficulty: 'medium',
    bottleneckType: 'run',
    bottleneckSize: 4,
    targetHandSize: 11,
    buyThresholdModifier: 0.5,
    minJunkCards: 1
  },
  // Round 4: 3 sets of 3 (9 cards needed) - many sets needed
  {
    round: 3,
    difficulty: 'medium',
    bottleneckType: 'set',
    bottleneckSize: 3,
    targetHandSize: 12,
    buyThresholdModifier: 0.5,
    minJunkCards: 2
  },
  // Round 5: 1 set of 3 + 1 run of 7 (10 cards needed) - run of 7 is hard!
  {
    round: 4,
    difficulty: 'hard',
    bottleneckType: 'run',
    bottleneckSize: 7,
    targetHandSize: 13,
    buyThresholdModifier: 0.4,
    minJunkCards: 2
  },
  // Round 6: 2 sets of 3 + 1 run of 5 (11 cards needed) - run is bottleneck
  {
    round: 5,
    difficulty: 'medium',
    bottleneckType: 'run',  // Changed from 'both' - run is harder
    bottleneckSize: 5,
    targetHandSize: 13,
    buyThresholdModifier: 0.45,
    minJunkCards: 2
  },
  // Round 7: 3 sets of 4 (12 cards needed) - sets of 4 are tricky
  {
    round: 6,
    difficulty: 'hard',
    bottleneckType: 'set',
    bottleneckSize: 4,
    targetHandSize: 14,
    buyThresholdModifier: 0.4,
    minJunkCards: 2
  },
  // Round 8: 1 set of 3 + 1 run of 10 (13 cards needed) - run of 10 is VERY hard
  {
    round: 7,
    difficulty: 'very_hard',
    bottleneckType: 'run',
    bottleneckSize: 10,
    targetHandSize: 16,  // Need lots of cards
    buyThresholdModifier: 0.25,  // Buy almost everything
    minJunkCards: 2
  },
  // Round 9: 3 sets of 3 + 1 run of 5 (14 cards needed) - run is bottleneck
  {
    round: 8,
    difficulty: 'hard',
    bottleneckType: 'run',  // Changed from 'both' - run is harder
    bottleneckSize: 5,
    targetHandSize: 16,
    buyThresholdModifier: 0.35,
    minJunkCards: 2
  },
  // Round 10: 3 runs of 5 (15 cards needed) - all runs, very hard
  {
    round: 9,
    difficulty: 'very_hard',
    bottleneckType: 'run',
    bottleneckSize: 5,
    targetHandSize: 17,
    buyThresholdModifier: 0.25,  // Buy almost everything
    minJunkCards: 2
  }
];

/**
 * Get round strategy for a given round
 */
export function getRoundStrategy(round: number): RoundStrategy {
  return ROUND_STRATEGIES[round] || ROUND_STRATEGIES[0];
}

/**
 * Get a random personality for AI player variety
 */
export function getRandomPersonality(): AIPersonality {
  const personalities = Object.values(AI_PERSONALITIES);
  return personalities[Math.floor(Math.random() * personalities.length)];
}

/**
 * Get personality by name
 */
export function getPersonality(name: string): AIPersonality {
  return AI_PERSONALITIES[name] || AI_PERSONALITIES.balanced;
}
