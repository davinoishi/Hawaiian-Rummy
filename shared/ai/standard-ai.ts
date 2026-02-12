/**
 * Hawaiian Rummy - Standard AI Strategy
 * A competent AI that plays strategically with personality-based decisions
 */

import {
  AIStrategy,
  DrawDecision,
  MeldDecision,
  LayoffDecision,
  DiscardDecision,
  BuyDecision,
  createAIContext,
  AIContext
} from './ai-strategy';
import {
  GameState,
  Card,
  Meld
} from '../game-engine/types';
import { ROUND_REQUIREMENTS } from '../game-engine/constants';
import {
  getCardPoints,
  getRankValue,
  getNonWildcards,
  getWildcards,
  groupByRank,
  groupBySuit,
  sortCardsByRank
} from '../game-engine/card-utils';
import {
  validateSet,
  isValidSet,
  findSetsMatchingRequirements
} from '../game-engine/validation/set-validator';
import {
  validateRun,
  isValidRun,
  canAddToRun,
  sortRunCards
} from '../game-engine/validation/run-validator';
import { checkMeldsMatchRequirements } from '../game-engine/validation/requirements';
import {
  AIPersonality,
  RoundStrategy,
  getRoundStrategy,
  getPersonality,
  getRandomPersonality,
  AI_PERSONALITIES
} from './ai-personalities';

/**
 * Standard AI Strategy implementation with personality support
 */
export class StandardAIStrategy implements AIStrategy {
  name = 'standard';
  private personality: AIPersonality;

  constructor(personalityName?: string) {
    if (personalityName) {
      this.personality = getPersonality(personalityName);
    } else {
      this.personality = getRandomPersonality();
    }
  }

  /**
   * Get the AI's personality
   */
  getPersonality(): AIPersonality {
    return this.personality;
  }

  /**
   * Set a specific personality
   */
  setPersonality(name: string): void {
    this.personality = getPersonality(name);
  }

  /**
   * Decide what to do during draw phase
   */
  decideDrawPhase(state: GameState, aiId: string): DrawDecision {
    const ctx = createAIContext(state, aiId);
    const isCurrentPlayer = state.players[state.currentPlayerIndex] === aiId;

    if (isCurrentPlayer) {
      // If a buy was just processed, we MUST draw from deck
      if (state.buyJustProcessed) {
        return { action: 'DRAW_CARD' };
      }

      // Check if we should take the discard using improved logic
      if (ctx.topDiscard && this.shouldTakeDiscard(ctx)) {
        return { action: 'TAKE_DISCARD' };
      }

      return { action: 'DRAW_CARD' };
    }

    // Non-current player: check if there are buy requests we need to pass on
    if (state.buyRequests.length > 0 && !state.passedBuy.includes(aiId)) {
      return { action: 'PASS_BUY' };
    }

    return { action: 'WAIT' };
  }

  /**
   * Decide what melds to create
   */
  decideMeldPhase(state: GameState, aiId: string): MeldDecision {
    const ctx = createAIContext(state, aiId);

    // If already met requirements, try to go out
    if (ctx.hasMetRequirements) {
      const goOutMelds = this.findGoOutMelds(ctx.hand, state);
      if (goOutMelds && goOutMelds.length > 0) {
        // Verify all melds are actually valid before attempting
        const validatedMelds = goOutMelds.filter(m => this.isMeldActuallyValid(m));
        if (validatedMelds.length === goOutMelds.length) {
          return {
            action: 'CREATE_MELD',
            melds: validatedMelds.map(m => ({
              type: m.type,
              cardIds: m.cards.map(c => c.id)
            }))
          };
        }
      }
      return { action: 'SKIP' };
    }

    // Try to find melds that meet requirements
    const melds = this.findBestMelds(ctx.hand, state.currentRound);

    if (melds.length > 0) {
      // Double-check all melds are valid using game engine validation
      const validatedMelds = melds.filter(m => this.isMeldActuallyValid(m));

      // Only proceed if ALL melds are valid (partial melds won't meet requirements)
      if (validatedMelds.length === melds.length) {
        return {
          action: 'CREATE_MELD',
          melds: validatedMelds.map(m => ({
            type: m.type,
            cardIds: m.cards.map(c => c.id)
          }))
        };
      }
    }

    return { action: 'SKIP' };
  }

  /**
   * Verify a meld is actually valid using game engine validation
   */
  private isMeldActuallyValid(meld: { type: 'set' | 'run'; cards: Card[] }): boolean {
    if (meld.type === 'set') {
      return isValidSet(meld.cards);
    } else {
      return isValidRun(meld.cards);
    }
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
            break;
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
      return { cardId: hand[0].id };
    }

    const roundStrategy = getRoundStrategy(ctx.currentRound);

    // If we've met requirements, prioritize discarding highest point cards first
    // This minimizes penalty if someone else goes out
    if (ctx.hasMetRequirements) {
      // First try to discard cards that can't be laid off (safer)
      // Then among those, pick the highest point value
      const scoredForGoOut = nonWildCards.map(card => {
        const points = getCardPoints(card);
        const safetyScore = this.calculateDiscardSafety(card, ctx);
        const canBeLayedOff = this.canLayoffToExistingMelds(card, ctx);

        // Prefer to keep cards we can layoff (negative = keep)
        // Prefer to discard high point cards (positive = discard)
        // Adjust for safety (dangerous to discard = negative)
        return {
          card,
          score: points - (canBeLayedOff ? 25 : 0) + safetyScore * 0.5
        };
      });

      // Sort by score (highest = best to discard when going out)
      scoredForGoOut.sort((a, b) => b.score - a.score);
      return { cardId: scoredForGoOut[0].card.id };
    }

    // Score each card - lower score = better to discard
    const scored = nonWildCards.map(card => {
      const bottleneckValue = this.calculateBottleneckValue(card, hand, ctx.currentRound, roundStrategy);
      const safetyScore = this.calculateDiscardSafety(card, ctx);

      // Higher bottleneck value = keep the card
      // Higher safety = safer to discard
      return {
        card,
        score: bottleneckValue - safetyScore * this.personality.discardRiskTolerance
      };
    });

    // Sort by score (lowest = best to discard)
    scored.sort((a, b) => a.score - b.score);

    return { cardId: scored[0].card.id };
  }

  /**
   * Decide whether to buy
   */
  decideBuy(state: GameState, aiId: string): BuyDecision {
    const ctx = createAIContext(state, aiId);

    // Don't buy if we've already met requirements
    if (ctx.hasMetRequirements) {
      return { action: 'PASS' };
    }

    // Can't buy if at max
    if (ctx.buysRemaining <= 0) {
      return { action: 'PASS' };
    }

    if (!ctx.topDiscard) {
      return { action: 'PASS' };
    }

    // Use the new bottleneck-focused buy logic
    if (this.shouldBuyCard(ctx)) {
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
    return validPositions.includes('end') ? 'end' : validPositions[0];
  }

  // ===== CORE DECISION LOGIC =====

  /**
   * Determine if we should take the discard pile card
   * Key insight: Only take it if it actually improves our hand
   * (i.e., we wouldn't immediately discard it)
   */
  private shouldTakeDiscard(ctx: AIContext): boolean {
    const card = ctx.topDiscard!;
    const roundStrategy = getRoundStrategy(ctx.currentRound);

    // Always take wildcards - they're always useful
    if (card.isWild) {
      return true;
    }

    // If we've met requirements, only take if we can immediately lay it off
    // This helps AI race to go out instead of accumulating cards
    if (ctx.hasMetRequirements) {
      return this.canLayoffToExistingMelds(card, ctx);
    }

    // Check if card can be laid off to existing melds - this is valuable!
    const canLayoff = this.canLayoffToExistingMelds(card, ctx);

    // Simulate: if we took this card, what would we discard?
    const handWithCard = [...ctx.hand, card];
    const wouldDiscard = this.findWorstCard(handWithCard, ctx.currentRound, roundStrategy);

    // If we would discard the same card we just picked up, don't take it!
    // Exception: if we can lay it off immediately after meeting requirements
    if (wouldDiscard.id === card.id) {
      return false;
    }

    // Calculate the value difference - only take if it's a net improvement
    let cardValue = this.calculateBottleneckValue(card, ctx.hand, ctx.currentRound, roundStrategy);
    const discardValue = this.calculateBottleneckValue(wouldDiscard, ctx.hand, ctx.currentRound, roundStrategy);

    // Boost value if card can be laid off (means we can get rid of it after going down)
    if (canLayoff) {
      cardValue += 20;
    }

    // Check if someone else wants to buy this card
    const hasBuyRequests = ctx.state.buyRequests.length > 0;

    // If someone wants to buy the card, require a HIGHER threshold to take it
    // Don't take cards just to block - only take if we actually need them
    // This prevents the annoying pattern of: take card to block -> discard same card later
    let threshold = 5;
    if (hasBuyRequests) {
      // Require significantly more value to justify taking a card someone else wants
      // Unless we can actually use it for a meld (high cardValue) or layoff
      threshold = canLayoff ? 10 : 25;
    }

    // Take the discard if the new card is more valuable than what we'd throw away
    return cardValue > discardValue + threshold;
  }

  /**
   * Find the worst card in hand (lowest value for current requirements)
   * This is what we would discard
   */
  private findWorstCard(hand: Card[], round: number, roundStrategy: RoundStrategy): Card {
    const nonWildCards = getNonWildcards(hand);

    // If only wildcards, return the first one (shouldn't happen often)
    if (nonWildCards.length === 0) {
      return hand[0];
    }

    let worstCard = nonWildCards[0];
    let worstValue = Infinity;

    for (const card of nonWildCards) {
      const value = this.calculateBottleneckValue(card, hand, round, roundStrategy);
      if (value < worstValue) {
        worstValue = value;
        worstCard = card;
      }
    }

    return worstCard;
  }

  /**
   * Calculate effective max buys for a round based on cards needed
   * Early rounds don't need many buys; late rounds need all available
   */
  private getEffectiveMaxBuys(round: number, actualMaxBuys: number): number {
    const requirements = ROUND_REQUIREMENTS[round];
    const cardsNeeded = requirements.totalCards;
    const startingHand = 9; // INITIAL_HAND_SIZE

    // Each buy adds ~2 cards (discard card + penalty card from deck)
    // Calculate how many buys are actually useful
    const cardDeficit = cardsNeeded - startingHand;

    if (cardDeficit <= 0) {
      // Round 1-4: We start with enough cards, limit buys heavily
      // Allow 1 buy for wildcards/key cards, but no more
      return Math.min(1, actualMaxBuys);
    }

    // For later rounds, allow more buys but still cap it
    // Each buy adds 2 cards, so buys needed = ceil(deficit / 2)
    const buysNeeded = Math.ceil(cardDeficit / 2);

    // Add 1 extra buy for flexibility, but don't exceed actual max
    return Math.min(buysNeeded + 1, actualMaxBuys);
  }

  /**
   * Main buy decision logic - bottleneck focused with junk card awareness
   * Key: Don't buy cards that we would immediately discard
   * Improvement: Be selective in early rounds to avoid excess cards
   */
  private shouldBuyCard(ctx: AIContext): boolean {
    const card = ctx.topDiscard!;
    const roundStrategy = getRoundStrategy(ctx.currentRound);
    const { hand, currentRound, buysRemaining } = ctx;
    const requirements = ROUND_REQUIREMENTS[currentRound];

    // Don't buy if we've already met requirements (already checked in decideBuy, but double-check)
    if (ctx.hasMetRequirements) {
      return false;
    }

    // IMPROVEMENT #2: Dynamic max buys per round
    // Calculate how many buys we should actually use this round
    const maxBuys = requirements.maxBuys;
    const buysUsed = maxBuys - buysRemaining;
    const effectiveMaxBuys = this.getEffectiveMaxBuys(currentRound, maxBuys);

    // Don't buy if we've already used our effective max for this round
    if (buysUsed >= effectiveMaxBuys) {
      return false;
    }

    // First check: would we just discard this card?
    // Simulate hand after buying (we get the discard card + a random penalty card)
    const handWithCard = [...hand, card];
    const wouldDiscard = this.findWorstCard(handWithCard, currentRound, roundStrategy);

    // If we would discard the card we're buying, don't buy it!
    if (wouldDiscard.id === card.id) {
      return false;
    }

    // Calculate how much this card helps our bottleneck requirement
    let bottleneckValue = this.calculateBottleneckValue(card, hand, currentRound, roundStrategy);

    // Check if card can be laid off to existing melds - this is valuable!
    const canLayoff = this.canLayoffToExistingMelds(card, ctx);
    if (canLayoff) {
      bottleneckValue += 15; // Boost value since we can get rid of it after going down
    }

    // IMPROVEMENT #1: Hand size penalty for buying
    // If we'd have too many excess cards after buying, be very selective
    const handSizeAfterBuy = hand.length + 2; // discard card + penalty card
    const excessCards = handSizeAfterBuy - requirements.totalCards;

    // Significant penalty when we'd have excess cards to discard after going down
    let excessCardPenalty = 0;
    if (excessCards > 2) {
      // Progressive penalty: more excess = much higher threshold to buy
      excessCardPenalty = (excessCards - 2) * 12;
    }

    // Calculate how many "junk" cards we have (cards safe to discard)
    const junkCardCount = this.countJunkCards(hand, currentRound, roundStrategy);
    const needsJunkCards = junkCardCount < roundStrategy.minJunkCards;

    // Calculate threshold based on round strategy and personality
    let baseThreshold = 20;

    // Adjust threshold based on round strategy (lower = buy more)
    baseThreshold *= roundStrategy.buyThresholdModifier;

    // Adjust based on personality aggressiveness (higher aggression = lower threshold)
    baseThreshold *= (1 - this.personality.buyAggressiveness * 0.6);

    // If we need junk cards, be more aggressive about buying (but only in later rounds)
    if (needsJunkCards && excessCards <= 0) {
      baseThreshold *= 0.6;
    }

    // More aggressive when we have more buys remaining (relative to effective max)
    const effectiveBuysRemaining = effectiveMaxBuys - buysUsed;
    if (effectiveBuysRemaining >= 2) {
      baseThreshold *= 0.85;
    }

    // Consider hand size - only give bonus if we actually need more cards
    const handDeficit = requirements.totalCards - hand.length;
    let handSizeBonus = 0;
    if (handDeficit > 0) {
      // Progressive bonus: the further from target, the more aggressive
      handSizeBonus = handDeficit * 4;
    }

    // Junk card bonus: if this card would be a safe discard AND we need junk, value it
    // But only if we don't already have excess cards
    const isJunkCard = bottleneckValue < 15;
    const junkBonus = (needsJunkCards && isJunkCard && excessCards <= 0)
      ? 15 * this.personality.junkCardAwareness
      : 0;

    // Apply excess card penalty to threshold
    const finalThreshold = baseThreshold + excessCardPenalty;

    // Special case: Always allow buying wildcards if we haven't hit effective max
    if (card.isWild && effectiveBuysRemaining > 0) {
      return true;
    }

    return bottleneckValue + handSizeBonus + junkBonus > finalThreshold;
  }

  /**
   * Count how many "junk" cards we have - cards that are safe to discard
   * These are cards with low value for our current requirements
   */
  private countJunkCards(hand: Card[], round: number, roundStrategy: RoundStrategy): number {
    const nonWildCards = getNonWildcards(hand);

    let junkCount = 0;
    for (const card of nonWildCards) {
      const value = this.calculateBottleneckValue(card, hand, round, roundStrategy);
      // A card is "junk" if it has low value for our requirements
      if (value < 15) {
        junkCount++;
      }
    }

    return junkCount;
  }

  /**
   * Calculate how valuable a card is for the bottleneck requirement
   * This is the key insight - prioritize cards that help the HARD melds (usually runs)
   */
  private calculateBottleneckValue(
    card: Card,
    hand: Card[],
    round: number,
    roundStrategy: RoundStrategy
  ): number {
    const requirements = ROUND_REQUIREMENTS[round];
    let value = 0;

    // Wildcards are always very valuable
    if (card.isWild) {
      return 60;  // High value but current player will usually take these anyway
    }

    const bottleneckType = roundStrategy.bottleneckType;
    const bottleneckSize = roundStrategy.bottleneckSize;

    // Check run potential - runs are generally harder and should be prioritized
    if (bottleneckType === 'run' || bottleneckType === 'both') {
      const runValue = this.calculateRunPotential(card, hand, bottleneckSize);

      // Weight run value higher if runs are the bottleneck (which is most rounds)
      const runWeight = bottleneckType === 'run' ?
        this.personality.bottleneckFocus * 1.8 : 1.2;

      value += runValue * runWeight;
    }

    // Check set potential
    const isSetBottleneck = bottleneckType === 'set';
    if (bottleneckType === 'set' || bottleneckType === 'both') {
      const setValue = this.calculateSetPotential(card, hand, bottleneckSize, isSetBottleneck);

      // Weight set value higher only if sets are the primary bottleneck
      const setWeight = bottleneckType === 'set' ?
        this.personality.bottleneckFocus * 1.5 : 0.8;

      value += setValue * setWeight;
    }

    // Also check if the card helps with ANY requirement, not just bottleneck
    // This helps accumulate cards for easier melds too
    const allRequirements = requirements;
    if (allRequirements.runs > 0 && bottleneckType !== 'run') {
      // Check run potential for non-bottleneck runs
      for (const runSize of allRequirements.runSizes) {
        if (runSize !== bottleneckSize) {
          value += this.calculateRunPotential(card, hand, runSize) * 0.5;
        }
      }
    }
    if (allRequirements.sets > 0 && bottleneckType !== 'set') {
      // Check set potential for non-bottleneck sets (pairs not as valuable here)
      for (const setSize of allRequirements.setSizes) {
        if (setSize !== bottleneckSize) {
          value += this.calculateSetPotential(card, hand, setSize, false) * 0.4;
        }
      }
    }

    return value;
  }

  /**
   * Calculate how much a card helps build runs
   */
  private calculateRunPotential(card: Card, hand: Card[], targetRunSize: number): number {
    const sameSuit = hand.filter(c => c.suit === card.suit && !c.isWild);
    const wildcards = getWildcards(hand);

    // Add the card to evaluate
    const allSuitCards = [...sameSuit];
    if (!allSuitCards.find(c => c.id === card.id)) {
      allSuitCards.push(card);
    }

    if (allSuitCards.length === 0) return 0;

    const sorted = sortCardsByRank(allSuitCards);

    // Find the best consecutive sequence this card is part of
    let maxRunLength = 1;
    let currentRun = 1;
    let cardInRun = false;
    const cardValue = getRankValue(card.rank);

    for (let i = 1; i < sorted.length; i++) {
      const prevValue = getRankValue(sorted[i - 1].rank);
      const currValue = getRankValue(sorted[i].rank);
      const gap = currValue - prevValue;

      if (gap === 1) {
        currentRun++;
      } else if (gap === 0) {
        // Duplicate rank, skip
        continue;
      } else if (gap <= wildcards.length + 1) {
        // Can fill gap with wildcards
        currentRun += gap;
      } else {
        currentRun = 1;
      }

      // Check if our card is in this run
      if (currValue === cardValue || prevValue === cardValue) {
        cardInRun = true;
      }

      maxRunLength = Math.max(maxRunLength, currentRun);
    }

    // Score based on how close we are to target run size
    const runProgress = Math.min(maxRunLength + wildcards.length, targetRunSize);
    const progressPercent = runProgress / targetRunSize;

    // Higher scores for longer runs, especially when close to target
    if (progressPercent >= 1.0) {
      return 50;  // Can complete the run!
    } else if (progressPercent >= 0.7) {
      return 35;  // Very close
    } else if (progressPercent >= 0.5) {
      return 25;  // Good progress
    } else if (progressPercent >= 0.3) {
      return 15;  // Some progress
    }

    return 5;  // Minimal contribution
  }

  /**
   * Calculate how much a card helps build sets
   * @param card - Card to evaluate
   * @param hand - Current hand
   * @param targetSetSize - Required set size
   * @param isSetBottleneck - Whether sets are the bottleneck requirement for this round
   */
  private calculateSetPotential(card: Card, hand: Card[], targetSetSize: number, isSetBottleneck: boolean = false): number {
    const sameRank = hand.filter(c => c.rank === card.rank && !c.isWild);
    const wildcards = getWildcards(hand);

    // Count including the new card
    const totalSameRank = sameRank.length + (sameRank.find(c => c.id === card.id) ? 0 : 1);
    const canMakeSet = totalSameRank + wildcards.length >= targetSetSize;

    if (canMakeSet && totalSameRank >= targetSetSize) {
      return 50;  // Can complete set without wildcards!
    } else if (canMakeSet) {
      return 35;  // Can complete set with wildcards
    } else if (totalSameRank >= targetSetSize - 1) {
      return 25;  // One away
    } else if (totalSameRank >= 2) {
      // Only value pairs highly if sets are the bottleneck requirement
      // Otherwise, having a pair isn't worth buying for
      return isSetBottleneck ? 15 : 8;
    }

    return 5;  // Single card
  }

  /**
   * Calculate how safe it is to discard a card
   */
  private calculateDiscardSafety(card: Card, ctx: AIContext): number {
    let safety = 0;

    // Cards already discarded without being bought are safer
    const sameRankDiscarded = ctx.discardHistory.filter(c => c.rank === card.rank).length;
    safety += sameRankDiscarded * 5;

    // High point cards are riskier to keep but also safer to discard
    // (opponents less likely to want high penalty cards)
    const points = getCardPoints(card);
    if (points >= 15) {
      safety += 8;  // Aces are often safe to discard
    } else if (points >= 10) {
      safety += 4;  // Face cards somewhat safe
    }

    // Consider opponent awareness - especially the NEXT player
    if (this.personality.opponentAwareness > 0.3) {
      // Find the next player
      const currentPlayerIndex = ctx.state.players.indexOf(ctx.aiId);
      const nextPlayerIndex = (currentPlayerIndex + 1) % ctx.state.players.length;
      const nextPlayerId = ctx.state.players[nextPlayerIndex];

      // Check specifically if next player can layoff this card - heavy penalty!
      for (const { playerId, melds } of ctx.allPlayerMelds) {
        for (const meld of melds) {
          if (this.wouldHelpOpponentMeld(card, meld)) {
            if (playerId === nextPlayerId) {
              // Next player can immediately use this - very dangerous!
              safety -= 30;
            } else {
              // Other opponents can use it - somewhat dangerous
              safety -= 15;
            }
            break;
          }
        }
      }
    }

    return safety;
  }

  /**
   * Check if a card would help an opponent's existing meld
   */
  private wouldHelpOpponentMeld(card: Card, meld: Meld): boolean {
    if (card.isWild) return true;  // Wildcards always help

    if (meld.type === 'set') {
      const nonWild = meld.cards.find(c => !c.isWild);
      return nonWild ? card.rank === nonWild.rank : false;
    } else {
      // Run - check if card extends it
      const nonWild = meld.cards.find(c => !c.isWild);
      if (!nonWild || card.suit !== nonWild.suit) return false;

      const values = meld.cards
        .filter(c => !c.isWild)
        .map(c => getRankValue(c.rank));
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const cardVal = getRankValue(card.rank);

      // Would extend the run
      return cardVal === minVal - 1 || cardVal === maxVal + 1;
    }
  }

  /**
   * Check if a card can be laid off to any existing meld on the table
   * Returns true if the card fits any player's melds
   */
  private canLayoffToExistingMelds(card: Card, ctx: AIContext): boolean {
    for (const { melds } of ctx.allPlayerMelds) {
      for (const meld of melds) {
        if (this.canLayoffCard(card, meld)) {
          return true;
        }
      }
    }
    return false;
  }

  // ===== MELD FINDING LOGIC =====

  /**
   * Find best melds that meet requirements using backtracking
   */
  private findBestMelds(hand: Card[], round: number): Array<{ type: 'set' | 'run'; cards: Card[] }> {
    const requirements = ROUND_REQUIREMENTS[round];
    const roundStrategy = getRoundStrategy(round);

    // Find all possible sets and runs
    const allPossibleMelds = this.findAllPossibleMeldsForRequirements(hand, requirements);

    // Use backtracking to find all valid combinations
    const validCombinations = this.findAllMeldCombinations(
      hand,
      allPossibleMelds,
      requirements
    );

    if (validCombinations.length === 0) {
      return [];
    }

    // Score each combination and return the best one
    let bestCombination = validCombinations[0];
    let bestScore = this.scoreMeldCombination(bestCombination, hand, roundStrategy);

    for (let i = 1; i < validCombinations.length; i++) {
      const score = this.scoreMeldCombination(validCombinations[i], hand, roundStrategy);
      if (score > bestScore) {
        bestScore = score;
        bestCombination = validCombinations[i];
      }
    }

    return bestCombination;
  }

  /**
   * Find all possible melds that could satisfy requirements
   */
  private findAllPossibleMeldsForRequirements(
    hand: Card[],
    requirements: { sets: number; setSizes: number[]; runs: number; runSizes: number[] }
  ): Array<{ type: 'set' | 'run'; cards: Card[]; size: number }> {
    const possibleMelds: Array<{ type: 'set' | 'run'; cards: Card[]; size: number }> = [];
    const wildcards = getWildcards(hand);
    const nonWildCards = getNonWildcards(hand);

    // Find all possible sets
    if (requirements.sets > 0) {
      const rankGroups = groupByRank(nonWildCards);

      for (const requiredSize of requirements.setSizes) {
        for (const [rank, cards] of rankGroups) {
          for (let numWilds = 0; numWilds <= wildcards.length; numWilds++) {
            const naturalCount = Math.min(cards.length, requiredSize - numWilds);
            if (naturalCount + numWilds >= requiredSize && naturalCount > 0) {
              const setCards = [
                ...cards.slice(0, naturalCount),
                ...wildcards.slice(0, numWilds)
              ].slice(0, requiredSize);

              if (setCards.length === requiredSize) {
                possibleMelds.push({
                  type: 'set',
                  cards: setCards,
                  size: requiredSize
                });
              }
            }
          }
        }
      }
    }

    // Find all possible runs
    if (requirements.runs > 0) {
      const suitGroups = groupBySuit(nonWildCards);

      for (const requiredSize of requirements.runSizes) {
        for (const [suit, cards] of suitGroups) {
          const sorted = sortCardsByRank(cards);

          for (let numWilds = 0; numWilds <= wildcards.length; numWilds++) {
            const runs = this.findAllRunsOfSize(sorted, wildcards.slice(0, numWilds), requiredSize);
            for (const run of runs) {
              possibleMelds.push({
                type: 'run',
                cards: run,
                size: requiredSize
              });
            }
          }
        }
      }
    }

    return possibleMelds;
  }

  /**
   * Find all valid runs of a specific size
   */
  private findAllRunsOfSize(sortedCards: Card[], availableWilds: Card[], targetSize: number): Card[][] {
    const runs: Card[][] = [];

    if (sortedCards.length === 0 && availableWilds.length < targetSize) {
      return runs;
    }

    for (let startIdx = 0; startIdx < sortedCards.length; startIdx++) {
      const run: Card[] = [sortedCards[startIdx]];
      const wildsUsed: Card[] = [];
      let expectedValue = getRankValue(sortedCards[startIdx].rank) + 1;

      for (let i = startIdx + 1; i < sortedCards.length && run.length + wildsUsed.length < targetSize; i++) {
        const cardValue = getRankValue(sortedCards[i].rank);

        // Fill gaps with wildcards
        while (cardValue > expectedValue && wildsUsed.length < availableWilds.length && run.length + wildsUsed.length < targetSize) {
          wildsUsed.push(availableWilds[wildsUsed.length]);
          expectedValue++;
        }

        if (cardValue === expectedValue) {
          run.push(sortedCards[i]);
          expectedValue = cardValue + 1;
        } else if (cardValue > expectedValue) {
          break;
        }
      }

      // Add remaining wildcards to extend if needed
      while (run.length + wildsUsed.length < targetSize && wildsUsed.length < availableWilds.length) {
        wildsUsed.push(availableWilds[wildsUsed.length]);
      }

      const fullRun = [...run, ...wildsUsed];
      if (fullRun.length >= targetSize) {
        runs.push(fullRun.slice(0, targetSize));
      }
    }

    return runs;
  }

  /**
   * Find all valid meld combinations using backtracking
   */
  private findAllMeldCombinations(
    hand: Card[],
    possibleMelds: Array<{ type: 'set' | 'run'; cards: Card[]; size: number }>,
    requirements: { sets: number; setSizes: number[]; runs: number; runSizes: number[] }
  ): Array<Array<{ type: 'set' | 'run'; cards: Card[] }>> {
    const validCombinations: Array<Array<{ type: 'set' | 'run'; cards: Card[] }>> = [];
    const usedCards = new Set<string>();
    const selectedMelds: Array<{ type: 'set' | 'run'; cards: Card[] }> = [];
    const requiredSetSizes = [...requirements.setSizes].sort((a, b) => b - a);
    const requiredRunSizes = [...requirements.runSizes].sort((a, b) => b - a);

    const maxCombinations = 100;

    const backtrack = (meldIndex: number, setsNeeded: number[], runsNeeded: number[]): boolean => {
      if (validCombinations.length >= maxCombinations) {
        return true;
      }

      if (setsNeeded.length === 0 && runsNeeded.length === 0) {
        validCombinations.push([...selectedMelds]);
        return false;
      }

      for (let i = meldIndex; i < possibleMelds.length; i++) {
        const meld = possibleMelds[i];

        const hasConflict = meld.cards.some(c => usedCards.has(c.id));
        if (hasConflict) continue;

        let newSetsNeeded = setsNeeded;
        let newRunsNeeded = runsNeeded;

        if (meld.type === 'set' && setsNeeded.length > 0) {
          const matchingIdx = setsNeeded.findIndex(size => size === meld.size);
          if (matchingIdx >= 0) {
            newSetsNeeded = [...setsNeeded];
            newSetsNeeded.splice(matchingIdx, 1);
          } else {
            continue;
          }
        } else if (meld.type === 'run' && runsNeeded.length > 0) {
          const matchingIdx = runsNeeded.findIndex(size => size === meld.size);
          if (matchingIdx >= 0) {
            newRunsNeeded = [...runsNeeded];
            newRunsNeeded.splice(matchingIdx, 1);
          } else {
            continue;
          }
        } else {
          continue;
        }

        meld.cards.forEach(c => usedCards.add(c.id));
        selectedMelds.push({ type: meld.type, cards: meld.cards });

        if (backtrack(i + 1, newSetsNeeded, newRunsNeeded)) {
          return true;
        }

        meld.cards.forEach(c => usedCards.delete(c.id));
        selectedMelds.pop();
      }

      return false;
    };

    backtrack(0, requiredSetSizes, requiredRunSizes);
    return validCombinations;
  }

  /**
   * Score a meld combination
   */
  private scoreMeldCombination(
    melds: Array<{ type: 'set' | 'run'; cards: Card[] }>,
    hand: Card[],
    roundStrategy: RoundStrategy
  ): number {
    let score = 100;

    // Fewer wildcards used = better (save them for harder melds or layoffs)
    const wildcardsUsed = melds.reduce((count, meld) =>
      count + meld.cards.filter(c => c.isWild).length, 0
    );

    // Wildcards more valuable in harder rounds (based on difficulty)
    const wildcardPenalty = roundStrategy.difficulty === 'very_hard' ? 20 :
                           roundStrategy.difficulty === 'hard' ? 16 : 12;
    score -= wildcardsUsed * wildcardPenalty;

    // Fewer cards left = better
    const cardsUsedIds = new Set(melds.flatMap(m => m.cards.map(c => c.id)));
    const cardsLeft = hand.length - cardsUsedIds.size;
    score -= cardsLeft * 3;

    // Bonus for using high-point cards in melds (removes risk)
    const highPointCardsInMelds = melds.reduce((count, meld) =>
      count + meld.cards.filter(c => getCardPoints(c) >= 10).length, 0
    );
    score += highPointCardsInMelds * 2;

    return score;
  }

  // ===== GO OUT LOGIC =====

  /**
   * Find melds that use all cards to go out
   */
  private findGoOutMelds(hand: Card[], state: GameState): Array<{ type: 'set' | 'run'; cards: Card[] }> | null {
    if (hand.length === 0) return [];

    const allMelds = this.findAllPossibleMelds(hand);
    return this.findMeldCombinationUsingAllCards(hand, allMelds);
  }

  /**
   * Find all possible melds in hand (for going out)
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
}
