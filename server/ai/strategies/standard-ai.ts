/**
 * Hawaiian Rummy - Standard AI Strategy
 * A competent AI that plays strategically
 */

import {
  AIStrategy,
  DrawDecision,
  MeldDecision,
  LayoffDecision,
  DiscardDecision,
  BuyDecision,
  createAIContext
} from '../ai-strategy';
import {
  GameState,
  Card,
  Meld
} from '../../../shared/game-engine/types';
import { ROUND_REQUIREMENTS } from '../../../shared/game-engine/constants';
import {
  getCardPoints,
  getRankValue,
  getNonWildcards,
  getWildcards,
  groupByRank,
  groupBySuit,
  sortCardsByRank
} from '../../../shared/game-engine/card-utils';
import {
  validateSet,
  isValidSet,
  findSetsMatchingRequirements
} from '../../../shared/game-engine/validation/set-validator';
import {
  validateRun,
  isValidRun,
  canAddToRun,
  sortRunCards
} from '../../../shared/game-engine/validation/run-validator';
import { checkMeldsMatchRequirements } from '../../../shared/game-engine/validation/requirements';

/**
 * Standard AI Strategy implementation
 */
export class StandardAIStrategy implements AIStrategy {
  name = 'standard';

  /**
   * Decide what to do during draw phase
   */
  decideDrawPhase(state: GameState, aiId: string): DrawDecision {
    const ctx = createAIContext(state, aiId);
    const isCurrentPlayer = state.players[state.currentPlayerIndex] === aiId;

    // Current player should NOT pass - they draw or take discard
    // (drawing from deck will process any pending buy requests)
    if (isCurrentPlayer) {
      // If a buy was just processed, we MUST draw from deck
      if (state.buyJustProcessed) {
        return { action: 'DRAW_CARD' };
      }

      // Check if we should take the discard
      if (ctx.topDiscard && this.isCardUseful(ctx.topDiscard, ctx.hand, state)) {
        return { action: 'TAKE_DISCARD' };
      }

      // Otherwise draw from deck (this processes pending buys)
      return { action: 'DRAW_CARD' };
    }

    // Non-current player: check if there are buy requests we need to pass on
    if (state.buyRequests.length > 0 && !state.passedBuy.includes(aiId)) {
      return { action: 'PASS_BUY' };
    }

    // Otherwise wait
    return { action: 'WAIT' };
  }

  /**
   * Decide what melds to create
   */
  decideMeldPhase(state: GameState, aiId: string): MeldDecision {
    const ctx = createAIContext(state, aiId);

    // If already met requirements, skip meld creation (will try layoffs instead)
    if (ctx.hasMetRequirements) {
      // Try to go out if possible
      const goOutMelds = this.findGoOutMelds(ctx.hand, state);
      if (goOutMelds && goOutMelds.length > 0) {
        return {
          action: 'CREATE_MELD',
          melds: goOutMelds.map(m => ({
            type: m.type,
            cardIds: m.cards.map(c => c.id)
          }))
        };
      }
      return { action: 'SKIP' };
    }

    // Try to find melds that meet requirements
    const melds = this.findBestMelds(ctx.hand, state.currentRound);

    if (melds.length > 0) {
      return {
        action: 'CREATE_MELD',
        melds: melds.map(m => ({
          type: m.type,
          cardIds: m.cards.map(c => c.id)
        }))
      };
    }

    return { action: 'SKIP' };
  }

  /**
   * Decide what cards to layoff
   */
  decideLayoffPhase(state: GameState, aiId: string): LayoffDecision {
    const ctx = createAIContext(state, aiId);

    if (!ctx.hasMetRequirements) {
      return { action: 'SKIP' };
    }

    const layoffs: LayoffDecision['layoffs'] = [];

    // Try to layoff highest point cards first
    const sortedHand = [...ctx.hand].sort((a, b) => getCardPoints(b) - getCardPoints(a));

    for (const card of sortedHand) {
      for (const { playerId, melds } of ctx.allPlayerMelds) {
        for (let meldIndex = 0; meldIndex < melds.length; meldIndex++) {
          const meld = melds[meldIndex];

          if (this.canLayoffCard(card, meld)) {
            layoffs.push({
              cardId: card.id,
              meldOwnerId: playerId,
              meldIndex
            });
            break; // Only layoff each card once
          }
        }
        if (layoffs.find(l => l.cardId === card.id)) break;
      }
    }

    if (layoffs.length > 0) {
      return { action: 'LAYOFF', layoffs };
    }

    return { action: 'SKIP' };
  }

  /**
   * Decide which card to discard
   */
  decideDiscard(state: GameState, aiId: string): DiscardDecision {
    const ctx = createAIContext(state, aiId);
    const hand = ctx.hand;

    if (hand.length === 0) {
      throw new Error('No cards to discard');
    }

    // Never discard wildcards if possible
    const nonWildCards = getNonWildcards(hand);

    if (nonWildCards.length === 0) {
      // Only have wilds, discard one
      return { cardId: hand[0].id };
    }

    // Score each card - lower score = better to discard
    let bestCard = nonWildCards[0];
    let bestScore = Infinity;

    for (const card of nonWildCards) {
      const score = this.calculateDiscardScore(card, hand, state, aiId);
      if (score < bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    return { cardId: bestCard.id };
  }

  /**
   * Decide whether to buy
   */
  decideBuy(state: GameState, aiId: string): BuyDecision {
    const ctx = createAIContext(state, aiId);

    // Can't buy if at max
    if (ctx.buyCount >= ctx.maxBuys) {
      return { action: 'PASS' };
    }

    // Check if the discard card is useful
    if (ctx.topDiscard && this.shouldBuyCard(ctx.topDiscard, ctx.hand, state)) {
      return { action: 'REQUEST_BUY' };
    }

    return { action: 'PASS' };
  }

  /**
   * Choose wildcard position
   */
  chooseWildcardPosition(
    validPositions: ('beginning' | 'end')[],
    state: GameState,
    aiId: string
  ): 'beginning' | 'end' {
    // Simple heuristic: prefer end
    return validPositions.includes('end') ? 'end' : validPositions[0];
  }

  // ===== HELPER METHODS =====

  /**
   * Check if a card is useful for our hand
   */
  private isCardUseful(card: Card, hand: Card[], state: GameState): boolean {
    // Wildcards are always useful
    if (card.isWild) {
      return true;
    }

    // Check if card helps complete sets
    const sameRankCards = hand.filter(c => c.rank === card.rank && !c.isWild);
    if (sameRankCards.length >= 2) {
      return true; // Would make a set
    }

    // Check if card helps complete runs
    const sameSuitCards = hand.filter(c => c.suit === card.suit && !c.isWild);
    const withCard = [...sameSuitCards, card];

    if (this.hasSequencePotential(withCard)) {
      return true;
    }

    // Check if card can be immediately laid off (if we've met requirements)
    const ctx = createAIContext(state, state.players[state.currentPlayerIndex]);
    if (ctx.hasMetRequirements) {
      for (const { melds } of ctx.allPlayerMelds) {
        for (const meld of melds) {
          if (this.canLayoffCard(card, meld)) {
            return true; // Can immediately layoff
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if cards have potential to form a run
   */
  private hasSequencePotential(cards: Card[]): boolean {
    if (cards.length < 3) return false;

    const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);

    // Check if cards are close enough to form a run
    for (let i = 0; i < values.length - 1; i++) {
      const diff = values[i + 1] - values[i];
      if (diff > 3) return false; // Too far apart
    }

    return true;
  }

  /**
   * Should we buy this card?
   */
  private shouldBuyCard(card: Card, hand: Card[], state: GameState): boolean {
    // Calculate benefit vs cost
    const benefit = this.evaluateCardBenefit(card, hand, state);
    const cost = 15; // Estimated average penalty card value

    return benefit > cost * 1.2; // Need 20% more benefit than cost
  }

  /**
   * Evaluate how much a card improves our hand
   */
  private evaluateCardBenefit(card: Card, hand: Card[], state: GameState): number {
    if (card.isWild) {
      return 50; // Wildcards are very valuable
    }

    let benefit = 0;

    // Check for set completion
    const sameRankCards = hand.filter(c => c.rank === card.rank && !c.isWild);
    if (sameRankCards.length >= 2) {
      benefit += 40; // Completes a set
    } else if (sameRankCards.length === 1) {
      benefit += 15;
    }

    // Check for run completion
    const sameSuitCards = hand.filter(c => c.suit === card.suit && !c.isWild);
    const withCard = [...sameSuitCards, card];
    const sorted = sortCardsByRank(withCard);

    let runLength = this.findLongestSequence(sorted);
    if (runLength >= 4) {
      benefit += 35;
    } else if (runLength === 3) {
      benefit += 20;
    }

    return benefit;
  }

  /**
   * Find longest consecutive sequence
   */
  private findLongestSequence(sortedCards: Card[]): number {
    if (sortedCards.length === 0) return 0;

    let maxLength = 1;
    let currentLength = 1;

    for (let i = 1; i < sortedCards.length; i++) {
      const prevValue = getRankValue(sortedCards[i - 1].rank);
      const currValue = getRankValue(sortedCards[i].rank);

      if (currValue === prevValue + 1) {
        currentLength++;
        maxLength = Math.max(maxLength, currentLength);
      } else if (currValue === prevValue) {
        continue;
      } else {
        currentLength = 1;
      }
    }

    return maxLength;
  }

  /**
   * Find best melds that meet requirements
   */
  private findBestMelds(hand: Card[], round: number): Array<{ type: 'set' | 'run'; cards: Card[] }> {
    const requirements = ROUND_REQUIREMENTS[round];
    const melds: Array<{ type: 'set' | 'run'; cards: Card[] }> = [];
    const usedCards = new Set<string>();

    // Try to find sets first
    const sets = this.findSetsWithSizes(hand, requirements.setSizes);
    for (const set of sets) {
      melds.push({ type: 'set', cards: set.cards });
      set.cards.forEach(c => usedCards.add(c.id));
    }

    // Try to find runs
    const remainingCards = hand.filter(c => !usedCards.has(c.id));
    const runs = this.findRunsWithSizes(remainingCards, requirements.runSizes);
    for (const run of runs) {
      melds.push({ type: 'run', cards: run.cards });
    }

    // Check if we meet requirements
    const setsFound = melds.filter(m => m.type === 'set').length;
    const runsFound = melds.filter(m => m.type === 'run').length;

    if (setsFound >= requirements.sets && runsFound >= requirements.runs) {
      return melds;
    }

    return [];
  }

  /**
   * Find sets matching required sizes
   */
  private findSetsWithSizes(hand: Card[], setSizes: number[]): Array<{ cards: Card[] }> {
    if (setSizes.length === 0) return [];

    const wildcards = getWildcards(hand);
    const nonWildCards = getNonWildcards(hand);
    const rankGroups = groupByRank(nonWildCards);

    const sets: Array<{ cards: Card[] }> = [];
    let availableWilds = [...wildcards];

    for (const requiredSize of setSizes) {
      let foundSet = false;

      const sortedGroups = Array.from(rankGroups.entries())
        .sort((a, b) => b[1].length - a[1].length);

      for (const [rank, cards] of sortedGroups) {
        const wildsNeeded = Math.max(0, requiredSize - cards.length);

        if (cards.length > 0 && wildsNeeded <= availableWilds.length) {
          const setCards = [
            ...cards.slice(0, Math.min(requiredSize, cards.length)),
            ...availableWilds.slice(0, wildsNeeded)
          ];

          if (setCards.length >= requiredSize) {
            sets.push({ cards: setCards });
            availableWilds = availableWilds.slice(wildsNeeded);
            rankGroups.delete(rank);
            foundSet = true;
            break;
          }
        }
      }

      if (!foundSet) {
        return [];
      }
    }

    return sets;
  }

  /**
   * Find runs matching required sizes
   */
  private findRunsWithSizes(hand: Card[], runSizes: number[]): Array<{ cards: Card[] }> {
    if (runSizes.length === 0) return [];

    const wildcards = getWildcards(hand);
    const nonWildCards = getNonWildcards(hand);
    const suitGroups = groupBySuit(nonWildCards);

    const runs: Array<{ cards: Card[] }> = [];
    let availableWilds = [...wildcards];

    for (const requiredSize of runSizes) {
      let foundRun = false;

      for (const [suit, cards] of suitGroups) {
        const sorted = sortCardsByRank(cards);
        const run = this.findRunOfSize(sorted, availableWilds, requiredSize);

        if (run.length >= requiredSize) {
          runs.push({ cards: run });

          // Remove used cards
          for (const usedCard of run) {
            if (!usedCard.isWild) {
              const cards = suitGroups.get(suit) || [];
              const idx = cards.findIndex(c => c.id === usedCard.id);
              if (idx >= 0) cards.splice(idx, 1);
            } else {
              const idx = availableWilds.findIndex(c => c.id === usedCard.id);
              if (idx >= 0) availableWilds.splice(idx, 1);
            }
          }

          foundRun = true;
          break;
        }
      }

      if (!foundRun) {
        return [];
      }
    }

    return runs;
  }

  /**
   * Find a run of specific size using wildcards
   */
  private findRunOfSize(sortedCards: Card[], availableWilds: Card[], targetSize: number): Card[] {
    if (sortedCards.length === 0 && availableWilds.length < targetSize) return [];

    for (let startIdx = 0; startIdx < sortedCards.length; startIdx++) {
      const run: Card[] = [sortedCards[startIdx]];
      const wildsUsed: Card[] = [];
      let expectedValue = getRankValue(sortedCards[startIdx].rank) + 1;

      for (let i = startIdx + 1; i < sortedCards.length && run.length < targetSize; i++) {
        const cardValue = getRankValue(sortedCards[i].rank);

        while (cardValue > expectedValue && wildsUsed.length < availableWilds.length) {
          wildsUsed.push(availableWilds[wildsUsed.length]);
          run.push(availableWilds[wildsUsed.length - 1]);
          expectedValue++;
        }

        if (cardValue === expectedValue) {
          run.push(sortedCards[i]);
          expectedValue = cardValue + 1;
        } else if (cardValue > expectedValue) {
          break;
        }
      }

      if (run.length >= targetSize) {
        return run.slice(0, targetSize);
      }
    }

    return [];
  }

  /**
   * Find melds that use all cards to go out
   */
  private findGoOutMelds(hand: Card[], state: GameState): Array<{ type: 'set' | 'run'; cards: Card[] }> | null {
    if (hand.length === 0) return [];

    // Try to find any valid combination that uses all cards
    const allMelds = this.findAllPossibleMelds(hand);

    // Use backtracking to find combination using all cards
    return this.findMeldCombinationUsingAllCards(hand, allMelds);
  }

  /**
   * Find all possible melds in hand
   */
  private findAllPossibleMelds(hand: Card[]): Array<{ type: 'set' | 'run'; cards: Card[] }> {
    const possibleMelds: Array<{ type: 'set' | 'run'; cards: Card[] }> = [];
    const wildcards = getWildcards(hand);
    const nonWildCards = getNonWildcards(hand);

    // Find sets
    const rankGroups = groupByRank(nonWildCards);
    for (const [rank, cards] of rankGroups) {
      for (let size = 3; size <= cards.length + wildcards.length; size++) {
        if (cards.length >= size) {
          possibleMelds.push({ type: 'set', cards: cards.slice(0, size) });
        } else {
          const wildsNeeded = size - cards.length;
          if (wildsNeeded <= wildcards.length) {
            possibleMelds.push({
              type: 'set',
              cards: [...cards, ...wildcards.slice(0, wildsNeeded)]
            });
          }
        }
      }
    }

    // Find runs
    const suitGroups = groupBySuit(nonWildCards);
    for (const [suit, cards] of suitGroups) {
      const sorted = sortCardsByRank(cards);
      for (let start = 0; start < sorted.length; start++) {
        for (let end = start + 2; end <= sorted.length; end++) {
          const subset = sorted.slice(start, end);
          for (let numWilds = 0; numWilds <= wildcards.length; numWilds++) {
            const testCards = [...subset, ...wildcards.slice(0, numWilds)];
            if (testCards.length >= 4 && isValidRun(testCards)) {
              possibleMelds.push({ type: 'run', cards: testCards });
            }
          }
        }
      }
    }

    return possibleMelds;
  }

  /**
   * Find combination of melds using all cards
   */
  private findMeldCombinationUsingAllCards(
    hand: Card[],
    possibleMelds: Array<{ type: 'set' | 'run'; cards: Card[] }>
  ): Array<{ type: 'set' | 'run'; cards: Card[] }> | null {
    const usedCards = new Set<string>();
    const selectedMelds: Array<{ type: 'set' | 'run'; cards: Card[] }> = [];

    const backtrack = (meldIndex: number): boolean => {
      if (usedCards.size === hand.length) {
        return true;
      }

      for (let i = meldIndex; i < possibleMelds.length; i++) {
        const meld = possibleMelds[i];

        const hasConflict = meld.cards.some(c => usedCards.has(c.id));
        if (hasConflict) continue;

        meld.cards.forEach(c => usedCards.add(c.id));
        selectedMelds.push(meld);

        if (backtrack(i + 1)) {
          return true;
        }

        meld.cards.forEach(c => usedCards.delete(c.id));
        selectedMelds.pop();
      }

      return false;
    };

    return backtrack(0) ? selectedMelds : null;
  }

  /**
   * Check if a card can be laid off on a meld
   */
  private canLayoffCard(card: Card, meld: Meld): boolean {
    if (meld.type === 'set') {
      if (card.isWild) return true;
      const nonWildCard = meld.cards.find(c => !c.isWild);
      return nonWildCard ? card.rank === nonWildCard.rank : false;
    } else {
      if (card.isWild) return true;
      const nonWildCard = meld.cards.find(c => !c.isWild);
      if (!nonWildCard || card.suit !== nonWildCard.suit) return false;

      const testCards = [...meld.cards, card];
      return isValidRun(testCards);
    }
  }

  /**
   * Calculate discard score (lower = better to discard)
   */
  private calculateDiscardScore(card: Card, hand: Card[], state: GameState, aiId: string): number {
    const points = getCardPoints(card);
    const potential = this.calculateCardPotential(card, hand, state);

    // Lower score = better to discard
    // High points and low potential = good discard
    return potential - points;
  }

  /**
   * Calculate a card's potential value
   */
  private calculateCardPotential(card: Card, hand: Card[], state: GameState): number {
    if (card.isWild) return 100;

    let potential = 0;

    // Set potential
    const sameRank = hand.filter(c => c.rank === card.rank && !c.isWild && c.id !== card.id);
    if (sameRank.length >= 2) {
      potential += 50;
    } else if (sameRank.length === 1) {
      potential += 25;
    }

    // Run potential
    const sameSuit = hand.filter(c => c.suit === card.suit && !c.isWild && c.id !== card.id);
    const withCard = [...sameSuit, card];
    const sorted = sortCardsByRank(withCard);
    const longestRun = this.findLongestSequence(sorted);

    if (longestRun >= 4) {
      potential += 50;
    } else if (longestRun === 3) {
      potential += 30;
    } else if (longestRun === 2) {
      potential += 15;
    }

    return potential;
  }
}
