/**
 * Hawaiian Rummy - AI Strategy Interface
 * Defines the interface for AI decision-making strategies
 */

import {
  GameState,
  Card,
  Meld,
  GameAction
} from '../game-engine/types';

/**
 * Decision for the draw phase
 */
export interface DrawDecision {
  action: 'DRAW_CARD' | 'TAKE_DISCARD' | 'PASS_BUY' | 'WAIT';
}

/**
 * Decision for creating melds
 */
export interface MeldDecision {
  action: 'CREATE_MELD' | 'SKIP';
  melds?: Array<{
    type: 'set' | 'run';
    cardIds: string[];
    wildcardPlacement?: number;
  }>;
}

/**
 * Decision for laying off cards
 */
export interface LayoffDecision {
  action: 'LAYOFF' | 'SKIP';
  layoffs?: Array<{
    cardId: string;
    meldOwnerId: string;
    meldIndex: number;
    wildcardPosition?: 'beginning' | 'end';
  }>;
}

/**
 * Decision for discarding
 */
export interface DiscardDecision {
  cardId: string;
}

/**
 * Decision for buying
 */
export interface BuyDecision {
  action: 'REQUEST_BUY' | 'PASS';
}

/**
 * AI Strategy interface
 * Implement this interface to create different AI behaviors
 */
export interface AIStrategy {
  /**
   * Strategy name for identification
   */
  name: string;

  /**
   * Decide what to do during draw phase (when it's AI's turn)
   */
  decideDrawPhase(state: GameState, aiId: string): DrawDecision;

  /**
   * Decide what melds to create
   */
  decideMeldPhase(state: GameState, aiId: string): MeldDecision;

  /**
   * Decide what cards to layoff
   */
  decideLayoffPhase(state: GameState, aiId: string): LayoffDecision;

  /**
   * Decide which card to discard
   */
  decideDiscard(state: GameState, aiId: string): DiscardDecision;

  /**
   * Decide whether to buy when another player discards
   */
  decideBuy(state: GameState, aiId: string): BuyDecision;

  /**
   * Handle wildcard position choice prompt
   */
  chooseWildcardPosition(
    validPositions: ('beginning' | 'end')[],
    state: GameState,
    aiId: string
  ): 'beginning' | 'end';
}

/**
 * Context passed to AI strategies for decision making
 */
export interface AIContext {
  state: GameState;
  aiId: string;
  hand: Card[];
  melds: Meld[];
  hasMetRequirements: boolean;
  currentRound: number;
  buyCount: number;
  maxBuys: number;
  discardPile: Card[];
  topDiscard: Card | undefined;
  allPlayerMelds: Array<{ playerId: string; melds: Meld[] }>;
}

/**
 * Create AI context from game state
 */
export function createAIContext(state: GameState, aiId: string): AIContext {
  const playerState = state.playerStates[aiId];
  const roundReq = getRoundRequirements(state.currentRound);

  return {
    state,
    aiId,
    hand: playerState?.hand || [],
    melds: playerState?.melds || [],
    hasMetRequirements: playerState?.hasMetRequirements || false,
    currentRound: state.currentRound,
    buyCount: playerState?.buyCount || 0,
    maxBuys: roundReq.maxBuys,
    discardPile: state.discardPile,
    topDiscard: state.discardPile[state.discardPile.length - 1],
    allPlayerMelds: state.players.map(id => ({
      playerId: id,
      melds: state.playerStates[id]?.melds || []
    }))
  };
}

/**
 * Get round requirements helper
 */
function getRoundRequirements(round: number) {
  const requirements = [
    { sets: 2, setSizes: [3, 3], runs: 0, runSizes: [], maxBuys: 3 },
    { sets: 1, setSizes: [3], runs: 1, runSizes: [4], maxBuys: 3 },
    { sets: 0, setSizes: [], runs: 2, runSizes: [4, 4], maxBuys: 3 },
    { sets: 3, setSizes: [3, 3, 3], runs: 0, runSizes: [], maxBuys: 3 },
    { sets: 1, setSizes: [3], runs: 1, runSizes: [7], maxBuys: 3 },
    { sets: 2, setSizes: [3, 3], runs: 1, runSizes: [5], maxBuys: 3 },
    { sets: 3, setSizes: [4, 4, 4], runs: 0, runSizes: [], maxBuys: 3 },
    { sets: 1, setSizes: [3], runs: 1, runSizes: [10], maxBuys: 3 },
    { sets: 3, setSizes: [3, 3, 3], runs: 1, runSizes: [5], maxBuys: 3 },
    { sets: 0, setSizes: [], runs: 3, runSizes: [5, 5, 5], maxBuys: 4 }
  ];

  return requirements[round] || requirements[0];
}
