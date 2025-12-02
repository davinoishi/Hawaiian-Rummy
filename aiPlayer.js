const io = require('socket.io-client');

class AIPlayer {
  constructor(serverUrl, playerName, roomId) {
    this.serverUrl = serverUrl;
    this.playerName = playerName;
    this.roomId = roomId;
    this.socket = null;
    this.gameState = null;
    this.decisionDelay = 3000; // 3 second delay to give human players time to request buys
    this.lastProcessedState = null; // Track last state to prevent duplicate actions
    this.pendingAction = false; // Flag to prevent overlapping actions
    this.lastBuyDecisionCard = null; // Track last card we made a buy decision on
  }

  connect() {
    this.socket = io(this.serverUrl);

    this.socket.on('connect', () => {
      console.log(`${this.playerName} connected with ID: ${this.socket.id} for room ${this.roomId}`);
      this.joinGame();
    });

    this.socket.on('gameState', (state) => {
      this.gameState = state;
      this.handleGameState(state);
    });

    this.socket.on('lobbyUpdate', (data) => {
      console.log(`${this.playerName} sees lobby in room ${this.roomId}:`, data.players.map(p => p.name));
    });

    this.socket.on('needWildcardPosition', (data) => {
      this.handleWildcardPositionPrompt(data);
    });

    this.socket.on('error', (message) => {
      console.error(`${this.playerName} error:`, message);
    });

    this.socket.on('disconnect', () => {
      console.log(`${this.playerName} disconnected`);
    });
  }

  joinGame() {
    this.socket.emit('joinGame', { playerName: this.playerName, roomId: this.roomId });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // Main decision handler based on game state
  handleGameState(state) {
    // SPECIAL CASE: Handle roundSummary immediately without state tracking
    // All players need to continue, so always process this phase
    if (state.gamePhase === 'roundSummary') {
      const roundSummarySignature = `roundSummary-${state.currentRound}`;

      // Only continue once per round
      if (this.lastProcessedState !== roundSummarySignature) {
        this.lastProcessedState = roundSummarySignature;
        console.log(`${this.playerName} continues to next round`);

        // No delay for round continuation
        setTimeout(() => {
          this.socket.emit('continueToNextRound');
        }, 500);
      }
      return;
    }

    // Create a state signature to detect if this is a new state
    // Include round number to ensure signature changes between rounds
    // Include shouldShowPass and hasPassed to detect when we need to pass
    const stateSignature = `${state.currentPlayerIndex}-${state.gamePhase}-${state.currentRound}-${state.discardPile?.length || 0}-${state.shouldShowPass}-${state.hasPassed}`;

    // If we're already processing an action, skip
    if (this.pendingAction) {
      return;
    }

    if (!state.isMyTurn) {
      // Only process buy decisions if state has changed
      if (this.lastProcessedState !== stateSignature) {
        this.lastProcessedState = stateSignature;
        this.handleBuyDecision(state);
      }
      return;
    }

    // It's our turn - check if we can act
    // For draw phase, we need to check if we can actually draw or take discard
    if (state.gamePhase === 'draw') {
      // If we can't act yet, don't mark state as processed - keep checking
      if (!state.canDraw && !state.canTakeDiscard) {
        // Don't update lastProcessedState - we'll check again on next update
        console.log(`${this.playerName} cannot act yet, will retry on next state update`);
        this.pendingAction = false; // Allow checking again
        return;
      }
    }

    // Only act once per state
    if (this.lastProcessedState === stateSignature) {
      return;
    }

    // Mark this state as processed ONLY if we're about to take action
    this.lastProcessedState = stateSignature;
    this.pendingAction = true;

    // Make decisions based on phase
    setTimeout(() => {
      try {
        switch (state.gamePhase) {
          case 'draw':
            this.handleDrawPhase(state);
            break;
          case 'meld':
            this.handleMeldPhase(state);
            break;
          case 'discard':
            // Meld phase automatically transitions to discard
            // We handle discard at the end of meld phase
            this.pendingAction = false;
            break;
        }
      } catch (error) {
        console.error(`${this.playerName} decision error:`, error);
        this.pendingAction = false;
      }
    }, this.decisionDelay);
  }

  // ===== DRAW PHASE DECISIONS =====
  handleDrawPhase(state) {
    // Reset buy decision tracker when it's our turn (new round/turn)
    this.lastBuyDecisionCard = null;
    this.lastProcessedBuyRound = null;

    // Check current game state right before acting (not cached state from 1 second ago)
    // Use the state parameter which is the most recent
    const currentState = this.gameState || state;

    const discardCard = currentState.discardPile && currentState.discardPile.length > 0
      ? currentState.discardPile[currentState.discardPile.length - 1]
      : null;

    // PRIORITY 1: If we want the discard, take it
    if (discardCard && currentState.canTakeDiscard && this.isCardUseful(discardCard, currentState)) {
      console.log(`${this.playerName} takes discard: ${discardCard.rank}${discardCard.suit}`);
      this.socket.emit('takeDiscard');
      this.pendingAction = false;
      return;
    }

    // PRIORITY 2: If we can draw from deck (no buy requests), do it
    if (currentState.canDraw) {
      console.log(`${this.playerName} draws from deck`);
      this.socket.emit('drawCard');
      this.pendingAction = false;
      return;
    }

    // PRIORITY 3: If we can't draw (buy requests exist) but should pass, pass to allow buys
    if (!currentState.canDraw && currentState.shouldShowPass && !currentState.hasPassed) {
      console.log(`${this.playerName} passes to allow buy requests`);
      this.socket.emit('passBuy');
      this.pendingAction = false;
      return;
    }

    // Otherwise, wait for buy requests to be processed
    console.log(`${this.playerName} waiting for buy requests to be handled...`);
    this.pendingAction = false;
  }

  // ===== MELD PHASE DECISIONS =====
  async handleMeldPhase(state) {
    const currentState = this.gameState || state;
    const hand = currentState.myHand || [];
    const currentMelds = currentState.myMelds || [];

    // Try to create melds to meet requirements
    const possibleMelds = this.findBestMelds(hand, currentState);

    for (const meld of possibleMelds) {
      this.socket.emit('createMeld', { type: meld.type, cardIds: meld.cardIds });
      // Wait a bit for server to process
      await this.sleepAsync(300);
    }

    // If we've met requirements OR just created melds, try to layoff high-value cards
    // (We check possibleMelds because hasMetRequirements might not be updated yet)
    if (currentState.hasMetRequirements || possibleMelds.length > 0) {
      await this.handleLayoffPhase(currentState);
    }

    // After melding and layoffs, discard
    setTimeout(() => {
      this.handleDiscardPhase(currentState);
    }, 500);
  }

  // ===== DISCARD PHASE DECISIONS =====
  handleDiscardPhase(state) {
    const currentState = this.gameState || state;
    const hand = currentState.myHand || [];
    const currentMelds = currentState.myMelds || [];

    if (hand.length === 0) {
      this.pendingAction = false;
      return; // Already won
    }

    // If we have melds but haven't met requirements, cancel them
    if (currentMelds.length > 0 && !currentState.hasMetRequirements) {
      console.log(`${this.playerName} cancels incomplete melds`);
      this.socket.emit('cancelMelds');

      // Wait for server to process, then discard
      setTimeout(() => {
        const updatedState = this.gameState || currentState;
        const updatedHand = updatedState.myHand || hand;
        const cardToDiscard = this.chooseDiscardCard(updatedHand, updatedState);
        if (cardToDiscard) {
          console.log(`${this.playerName} discards: ${cardToDiscard.rank}${cardToDiscard.suit}`);
          this.socket.emit('discard', cardToDiscard.id);
          this.pendingAction = false; // Reset after discard
        }
      }, 300);
      return;
    }

    // Choose card to discard (least useful, highest points)
    const cardToDiscard = this.chooseDiscardCard(hand, currentState);

    if (cardToDiscard) {
      console.log(`${this.playerName} discards: ${cardToDiscard.rank}${cardToDiscard.suit}`);
      this.socket.emit('discard', cardToDiscard.id);
      this.pendingAction = false; // Reset after discard
    }
  }

  // ===== BUY PHASE DECISIONS =====
  handleBuyDecision(state) {
    const discardCard = state.discardPile && state.discardPile.length > 0
      ? state.discardPile[state.discardPile.length - 1]
      : null;

    const currentCardId = discardCard ? discardCard.id : null;
    const currentTurnKey = `${state.currentPlayerIndex}-${state.discardPile.length}`;

    // IMPORTANT: Check shouldShowPass FIRST - always respond to pass requests
    // This handles BOTH current players and intermediate players who need to pass
    // We must ALWAYS respond when shouldShowPass is true, even if we previously
    // evaluated this card voluntarily - the state signature prevents duplicate passes
    if (state.shouldShowPass && !state.hasPassed) {
      // Decide whether to buy or pass using cost-benefit analysis
      if (state.canBuy && !state.hasBuyRequest && discardCard && state.myBuyCount < state.maxBuys) {
        if (this.shouldBuyCard(discardCard, state)) {
          console.log(`${this.playerName} requests buy for: ${discardCard.rank}${discardCard.suit}`);
          this.socket.emit('requestBuy');
          return;
        }
      }

      // Pass if we don't want to buy (or if we're an intermediate player)
      console.log(`${this.playerName} passes on buy (shouldShowPass=true)`);
      this.socket.emit('passBuy');
      return;
    }

    // Track if we've already made a decision for this turn (for voluntary buys)
    if (this.lastBuyDecisionTurn === currentTurnKey) {
      return; // Already processed this turn
    }

    // Normal buy request logic (when not required to show pass)
    if (!state.canBuy || state.hasBuyRequest) {
      return;
    }

    // Should we buy this card? Use cost-benefit analysis
    if (discardCard && state.myBuyCount < state.maxBuys) {
      if (this.shouldBuyCard(discardCard, state)) {
        console.log(`${this.playerName} requests buy for: ${discardCard.rank}${discardCard.suit}`);
        this.lastBuyDecisionTurn = currentTurnKey;
        this.socket.emit('requestBuy');
      }
    }
  }

  // ===== LAYOFF LOGIC =====
  async handleLayoffPhase(state) {
    // Keep laying off cards until no more can be laid off
    let madeLayoff = true;

    while (madeLayoff) {
      madeLayoff = false;

      // Get fresh state each iteration
      const currentState = this.gameState || state;
      const hand = currentState.myHand || [];
      const allPlayers = currentState.players || [];

      if (hand.length === 0) break;

      // Try to layoff highest point cards first
      const sortedHand = [...hand].sort((a, b) => this.getCardPoints(b) - this.getCardPoints(a));

      for (const card of sortedHand) {
        // Try each player's melds
        for (const player of allPlayers) {
          const melds = player.melds || [];

          for (let meldIndex = 0; meldIndex < melds.length; meldIndex++) {
            const meld = melds[meldIndex];

            if (this.canLayoffCard(card, meld)) {
              console.log(`${this.playerName} lays off ${card.rank}${card.suit} to ${player.name}'s meld`);

              // Simple layoff without wildcard replacement for now
              this.socket.emit('layoffCard', {
                cardId: card.id,
                meldOwnerId: player.id,
                meldIndex: meldIndex
              });

              await this.sleepAsync(500); // Wait for server to process and update state
              madeLayoff = true;
              break; // Break inner loops, restart with fresh hand
            }
          }
          if (madeLayoff) break;
        }
        if (madeLayoff) break;
      }
    }
  }

  // ===== WILDCARD POSITION PROMPT =====
  handleWildcardPositionPrompt(data) {
    // For simplicity, always choose the first valid position
    const position = data.validPositions[0];

    this.socket.emit('layoffCard', {
      cardId: data.cardId,
      meldOwnerId: data.meldOwnerId,
      meldIndex: data.meldIndex,
      wildcardPosition: position
    });
  }

  // ===== UTILITY FUNCTIONS =====

  // Strategic buying with cost-benefit analysis
  shouldBuyCard(card, state) {
    const hand = state.myHand || [];

    // If already met requirements, only buy if card can be laid off
    if (state.hasMetRequirements) {
      const allPlayers = state.players || [];
      for (const player of allPlayers) {
        const melds = player.melds || [];
        for (const meld of melds) {
          if (this.canLayoffCard(card, meld)) {
            // Can layoff - benefit is card point value saved
            const benefit = this.getCardPoints(card);
            const cost = this.estimatePenaltyCost();
            console.log(`${this.playerName} buy analysis (post-meld): benefit=${benefit} vs cost=${cost}`);
            return benefit > cost; // Only buy if card value > penalty cost
          }
        }
      }
      // Can't layoff, definitely don't buy
      return false;
    }

    // Calculate the benefit of this card
    const benefit = this.evaluateCardBenefit(card, state);

    // Calculate the cost of buying (penalty card)
    const cost = this.estimatePenaltyCost();

    // Adjust threshold based on round number
    const roundMultiplier = this.getRoundAggression(state.currentRound);
    const adjustedThreshold = cost * roundMultiplier;

    const shouldBuy = benefit > adjustedThreshold;

    console.log(`${this.playerName} buy analysis: ${card.rank}${card.suit} benefit=${benefit.toFixed(1)} vs cost=${cost} (threshold=${adjustedThreshold.toFixed(1)}) => ${shouldBuy ? 'BUY' : 'PASS'}`);

    return shouldBuy;
  }

  // Estimate the cost of the penalty card when buying
  estimatePenaltyCost() {
    // Average card values:
    // - Joker (50) is rare
    // - 2s (20) are somewhat common
    // - Aces (15) are common
    // - Face cards (10) are common
    // - Number cards (5) are common
    // Conservative estimate: assume ~15 points average
    return 15;
  }

  // Get aggression multiplier based on round
  getRoundAggression(round) {
    // Early rounds (0-2): Be conservative (higher threshold = less buying)
    if (round <= 2) return 1.5; // Need 1.5x benefit to buy

    // Middle rounds (3-6): Balanced
    if (round <= 6) return 1.2; // Need 1.2x benefit to buy

    // Late rounds (7-9): Aggressive (lower threshold = more buying)
    return 0.8; // Need 0.8x benefit to buy (buy more easily)
  }

  // Evaluate how much this card improves our hand
  evaluateCardBenefit(card, state) {
    const hand = state.myHand || [];
    const requirements = this.getRoundRequirements(state.currentRound);

    // Wildcards are extremely valuable - they can complete any meld
    if (card.isWild) {
      return 50; // High value - wildcards are game-changers
    }

    let benefit = 0;

    // Check if card COMPLETES a meld right now
    // For sets: need 2 more of same rank
    const sameRankCards = hand.filter(c => c.rank === card.rank && !c.isWild);
    if (sameRankCards.length >= 2) {
      benefit += 40; // Completes a set - very valuable
    } else if (sameRankCards.length === 1) {
      benefit += 15; // One step closer to a set
    }

    // For runs: check if card fits into or completes a sequence
    const sameSuitCards = hand.filter(c => c.suit === card.suit && !c.isWild);
    const withCard = [...sameSuitCards, card].sort((a, b) =>
      this.getCardValue(a) - this.getCardValue(b)
    );

    // Check if we can form a run of 4+ with this card
    const longestRun = this.findLongestSequence(withCard);
    if (longestRun >= 4) {
      benefit += 35; // Completes a run - very valuable
    } else if (longestRun === 3) {
      benefit += 20; // Close to a run
    } else if (longestRun === 2) {
      benefit += 8; // Starting a run
    }

    // Note: We don't give points for "can layoff later" because:
    // - You get the discard card (can layoff)
    // - But you also get a penalty card (~15 points)
    // - Net benefit is zero or negative
    // Only buy if card helps complete melds NOW

    return benefit;
  }

  // Find the longest consecutive sequence in sorted cards
  findLongestSequence(sortedCards) {
    if (sortedCards.length === 0) return 0;

    let maxLength = 1;
    let currentLength = 1;

    for (let i = 1; i < sortedCards.length; i++) {
      const prevValue = this.getCardValue(sortedCards[i - 1]);
      const currValue = this.getCardValue(sortedCards[i]);

      if (currValue === prevValue + 1) {
        currentLength++;
        maxLength = Math.max(maxLength, currentLength);
      } else if (currValue === prevValue) {
        // Duplicate value, skip
        continue;
      } else {
        currentLength = 1;
      }
    }

    return maxLength;
  }

  isCardUseful(card, state, forBuying = false) {
    const hand = state.myHand || [];
    const requirements = this.getRoundRequirements(state.currentRound);

    // IMPORTANT: If we're buying and have already met requirements,
    // only buy if the card can be laid off immediately
    if (forBuying && state.hasMetRequirements) {
      // Check if this card can be laid off on ANY existing meld
      const allPlayers = state.players || [];
      for (const player of allPlayers) {
        const melds = player.melds || [];
        for (const meld of melds) {
          if (this.canLayoffCard(card, meld)) {
            console.log(`${this.playerName} considers buying ${card.rank}${card.suit} - can layoff on existing meld`);
            return true;
          }
        }
      }
      // Can't layoff, so don't buy after melding
      console.log(`${this.playerName} skips buying ${card.rank}${card.suit} - already melded and can't layoff`);
      return false;
    }

    // Wildcards are always useful (if we haven't met requirements yet)
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

    // For buying, be more conservative
    if (forBuying) {
      return false;
    }

    return false;
  }

  hasSequencePotential(cards) {
    if (cards.length < 3) return false;

    const values = cards.map(c => this.getCardValue(c)).sort((a, b) => a - b);

    // Check if cards are close enough to form a run
    for (let i = 0; i < values.length - 1; i++) {
      const diff = values[i + 1] - values[i];
      if (diff > 3) return false; // Too far apart
    }

    return true;
  }

  findBestMelds(hand, state) {
    const melds = [];
    const requirements = this.getRoundRequirements(state.currentRound);
    const usedCards = new Set();

    // Try to find sets first with proper sizes
    const sets = this.findSetsWithSizes(hand, requirements.setSizes || []);
    let setIndex = 0;
    for (const set of sets) {
      const requiredSize = requirements.setSizes && requirements.setSizes[setIndex]
        ? requirements.setSizes[setIndex]
        : 3;

      if (set.cards.length >= requiredSize) {
        // Only use the exact number needed for the requirement
        melds.push({
          type: 'set',
          cardIds: set.cards.slice(0, requiredSize).map(c => c.id)
        });
        set.cards.slice(0, requiredSize).forEach(c => usedCards.add(c.id));
        setIndex++;
      }
    }

    // Try to find runs with proper sizes
    const remainingCards = hand.filter(c => !usedCards.has(c.id));
    const runs = this.findRunsWithSizes(remainingCards, requirements.runSizes || []);

    let runIndex = 0;
    for (const run of runs) {
      const requiredSize = requirements.runSizes && requirements.runSizes[runIndex]
        ? requirements.runSizes[runIndex]
        : 4;

      if (run.cards.length >= requiredSize) {
        // Only use the exact number needed for the requirement
        melds.push({
          type: 'run',
          cardIds: run.cards.slice(0, requiredSize).map(c => c.id)
        });
        runIndex++;
      }
    }

    // Only return melds if we meet the full requirements
    const totalSetsNeeded = requirements.sets || 0;
    const totalRunsNeeded = requirements.runs || 0;
    const setsFound = melds.filter(m => m.type === 'set').length;
    const runsFound = melds.filter(m => m.type === 'run').length;

    if (setsFound >= totalSetsNeeded && runsFound >= totalRunsNeeded) {
      return melds;
    }

    // Don't create partial melds - return empty array
    return [];
  }

  findSetsWithSizes(hand, setSizes) {
    if (setSizes.length === 0) return [];

    const sets = [];
    const rankGroups = {};
    const wildcards = hand.filter(c => c.isWild);

    // Group by rank
    for (const card of hand) {
      if (card.isWild) continue;

      if (!rankGroups[card.rank]) {
        rankGroups[card.rank] = [];
      }
      rankGroups[card.rank].push(card);
    }

    // Try to create sets for each required size
    for (const requiredSize of setSizes) {
      let foundSet = false;

      // Try to find a set of the required size
      for (const rank in rankGroups) {
        const cards = rankGroups[rank];

        // Check if we can make a set of this size
        const naturalCards = cards.length;
        const wildsNeeded = Math.max(0, requiredSize - naturalCards);

        if (naturalCards + wildcards.length >= requiredSize && wildsNeeded <= wildcards.length) {
          // We can make this set
          const setCards = [...cards.slice(0, naturalCards)];

          // Add wildcards if needed
          for (let i = 0; i < wildsNeeded; i++) {
            setCards.push(wildcards.shift());
          }

          sets.push({ cards: setCards.slice(0, requiredSize), minSize: requiredSize });

          // Remove this rank from consideration
          delete rankGroups[rank];
          foundSet = true;
          break;
        }
      }

      if (!foundSet) {
        // Couldn't find a set of this size, fail
        return [];
      }
    }

    return sets;
  }

  findSets(hand, numSetsNeeded) {
    const sets = [];
    const rankGroups = {};
    const wildcards = hand.filter(c => c.isWild);

    // Group by rank
    for (const card of hand) {
      if (card.isWild) continue;

      if (!rankGroups[card.rank]) {
        rankGroups[card.rank] = [];
      }
      rankGroups[card.rank].push(card);
    }

    // Find sets of 3+ (including using wildcards to complete sets)
    for (const rank in rankGroups) {
      const cards = rankGroups[rank];

      // Natural set (3+ cards of same rank)
      if (cards.length >= 3) {
        sets.push({ cards: cards.slice(0, Math.min(cards.length, 4)), minSize: 3 });
      }
      // Use wildcards to complete sets (2 cards + 1 wildcard = set of 3)
      else if (cards.length === 2 && wildcards.length > 0) {
        const neededWilds = 3 - cards.length;
        const availableWilds = wildcards.slice(0, neededWilds);
        if (availableWilds.length === neededWilds) {
          sets.push({ cards: [...cards, ...availableWilds], minSize: 3 });
          // Mark wildcards as used
          wildcards.splice(0, neededWilds);
        }
      }
    }

    return sets.slice(0, numSetsNeeded);
  }

  findRunsWithSizes(hand, runSizes) {
    if (runSizes.length === 0) return [];

    const runs = [];
    const suitGroups = {};
    const wildcards = hand.filter(c => c.isWild);

    // Group by suit (exclude wildcards, we'll use them to fill gaps)
    for (const card of hand) {
      if (card.isWild) continue;

      if (!suitGroups[card.suit]) {
        suitGroups[card.suit] = [];
      }
      suitGroups[card.suit].push(card);
    }

    // Try to create runs for each required size
    for (const requiredSize of runSizes) {
      let foundRun = false;

      // Try each suit to find a run of the required size
      for (const suit in suitGroups) {
        const cards = suitGroups[suit].sort((a, b) =>
          this.getCardValue(a) - this.getCardValue(b)
        );

        const run = this.findRunOfSizeWithWilds(cards, wildcards, requiredSize);
        if (run.length >= requiredSize) {
          runs.push({ cards: run.slice(0, requiredSize), minSize: requiredSize });

          // Remove used cards from the suit group
          for (const usedCard of run) {
            if (!usedCard.isWild) {
              const index = suitGroups[suit].findIndex(c => c.id === usedCard.id);
              if (index >= 0) {
                suitGroups[suit].splice(index, 1);
              }
            }
          }

          // Remove used wildcards
          const wildsUsed = run.filter(c => c.isWild);
          for (const wild of wildsUsed) {
            const index = wildcards.findIndex(c => c.id === wild.id);
            if (index >= 0) {
              wildcards.splice(index, 1);
            }
          }

          foundRun = true;
          break;
        }
      }

      if (!foundRun) {
        // Couldn't find a run of this size, fail
        return [];
      }
    }

    return runs;
  }

  findRuns(hand, numRunsNeeded) {
    const runs = [];
    const suitGroups = {};
    const wildcards = hand.filter(c => c.isWild);

    // Group by suit (exclude wildcards, we'll use them to fill gaps)
    for (const card of hand) {
      if (card.isWild) continue;

      if (!suitGroups[card.suit]) {
        suitGroups[card.suit] = [];
      }
      suitGroups[card.suit].push(card);
    }

    // Find runs in each suit, using wildcards to fill gaps
    for (const suit in suitGroups) {
      const cards = suitGroups[suit].sort((a, b) =>
        this.getCardValue(a) - this.getCardValue(b)
      );

      const run = this.findLongestRunWithWilds(cards, [...wildcards]);
      if (run.length >= 4) {
        runs.push({ cards: run, minSize: 4 });
        // Remove used wildcards from available pool
        const wildsUsed = run.filter(c => c.isWild).length;
        wildcards.splice(0, wildsUsed);
      }
    }

    return runs.slice(0, numRunsNeeded);
  }

  findRunOfSizeWithWilds(cards, availableWilds, targetSize) {
    if (cards.length === 0 && availableWilds.length < targetSize) return [];

    let bestRun = [];

    // Try building runs starting from each card
    for (let startIdx = 0; startIdx < cards.length; startIdx++) {
      const run = [];
      const wildsUsed = [];
      let expectedValue = this.getCardValue(cards[startIdx]);

      run.push(cards[startIdx]);

      // Try to extend the run forward
      for (let i = startIdx + 1; i < cards.length; i++) {
        const cardValue = this.getCardValue(cards[i]);
        expectedValue++;

        // Check if we need wildcards to fill gaps
        while (cardValue > expectedValue && wildsUsed.length < availableWilds.length) {
          // Use a wildcard to fill the gap
          wildsUsed.push(availableWilds[wildsUsed.length]);
          run.push(availableWilds[wildsUsed.length - 1]);
          expectedValue++;
        }

        if (cardValue === expectedValue) {
          run.push(cards[i]);
        } else if (cardValue > expectedValue) {
          // Gap too large, can't continue this run
          break;
        } else {
          // Duplicate value, skip it
          continue;
        }
      }

      // If we found a run that meets the target size, return it
      if (run.length >= targetSize) {
        return run.slice(0, targetSize);
      }

      // Keep track of the best run found so far
      if (run.length > bestRun.length) {
        bestRun = run;
      }
    }

    // If we couldn't find a run of the target size, return empty
    return bestRun.length >= targetSize ? bestRun : [];
  }

  findLongestRunWithWilds(cards, availableWilds) {
    if (cards.length === 0) return [];

    let longestRun = [];

    // Try building runs starting from each card
    for (let startIdx = 0; startIdx < cards.length; startIdx++) {
      const run = [];
      const wildsUsed = [];
      let expectedValue = this.getCardValue(cards[startIdx]);

      run.push(cards[startIdx]);

      // Try to extend the run forward
      for (let i = startIdx + 1; i < cards.length; i++) {
        const cardValue = this.getCardValue(cards[i]);
        expectedValue++;

        // Check if we need wildcards to fill gaps
        while (cardValue > expectedValue && wildsUsed.length < availableWilds.length) {
          // Use a wildcard to fill the gap
          wildsUsed.push(availableWilds[wildsUsed.length]);
          run.push(availableWilds[wildsUsed.length - 1]);
          expectedValue++;
        }

        if (cardValue === expectedValue) {
          run.push(cards[i]);
        } else if (cardValue > expectedValue) {
          // Gap too large, can't continue this run
          break;
        } else {
          // Duplicate value, skip it
          continue;
        }
      }

      // Keep track of the longest run found
      if (run.length > longestRun.length) {
        longestRun = run;
      }
    }

    return longestRun.length >= 4 ? longestRun : [];
  }

  findLongestRun(cards) {
    if (cards.length < 4) return [];

    let longestRun = [];
    let currentRun = [cards[0]];

    for (let i = 1; i < cards.length; i++) {
      const prevValue = this.getCardValue(currentRun[currentRun.length - 1]);
      const currValue = this.getCardValue(cards[i]);

      if (currValue === prevValue + 1 || cards[i].isWild) {
        currentRun.push(cards[i]);
      } else if (currValue === prevValue) {
        // Skip duplicates
        continue;
      } else {
        if (currentRun.length > longestRun.length) {
          longestRun = currentRun;
        }
        currentRun = [cards[i]];
      }
    }

    if (currentRun.length > longestRun.length) {
      longestRun = currentRun;
    }

    return longestRun;
  }

  chooseDiscardCard(hand, state) {
    if (hand.length === 0) return null;

    // Never discard wildcards if possible
    const nonWildCards = hand.filter(c => !c.isWild);

    if (nonWildCards.length === 0) {
      return hand[0]; // Only have wilds, discard one
    }

    // Get all opponents (all players except ourselves)
    const myId = state.players.find(p => p.isMe)?.id;
    const opponents = state.players.filter(p => p.id !== myId);

    // Discard highest point card that's least useful AND doesn't help ANY opponent
    let worstCard = nonWildCards[0];
    let worstScore = -1000;

    for (const card of nonWildCards) {
      const usefulness = this.isCardUseful(card, state) ? -100 : 0;
      const points = this.getCardPoints(card);

      // IMPORTANT: Check if this card would help ANY opponent
      let helpsAnyOpponent = false;
      for (const opponent of opponents) {
        if (this.wouldHelpOpponent(card, opponent)) {
          helpsAnyOpponent = true;
          break;
        }
      }
      const opponentPenalty = helpsAnyOpponent ? -200 : 0; // Heavy penalty for helping any opponent

      const score = points + usefulness + opponentPenalty;

      if (score > worstScore) {
        worstScore = score;
        worstCard = card;
      }
    }

    return worstCard;
  }

  // Check if discarding this card would help an opponent
  wouldHelpOpponent(card, opponent) {
    if (!opponent || !opponent.melds) return false;

    // Check if card could layoff on any of opponent's melds
    for (const meld of opponent.melds) {
      if (this.canLayoffCard(card, meld)) {
        console.log(`${this.playerName} avoids discarding ${card.rank}${card.suit} (would help ${opponent.name})`);
        return true;
      }
    }

    // Additional heuristic: avoid discarding cards that match opponent's meld ranks/suits
    // This prevents giving them cards that could extend their melds or form new ones
    for (const meld of opponent.melds) {
      if (meld.type === 'set') {
        // Don't discard cards of the same rank as their sets
        const nonWildCard = meld.cards.find(c => !c.isWild);
        if (nonWildCard && card.rank === nonWildCard.rank) {
          return true;
        }
      } else if (meld.type === 'run') {
        // Don't discard cards of the same suit as their runs
        const nonWildCard = meld.cards.find(c => !c.isWild);
        if (nonWildCard && card.suit === nonWildCard.suit) {
          // Check if card is near their run (could extend it)
          const runValues = meld.cards
            .filter(c => !c.isWild)
            .map(c => this.getCardValue(c))
            .sort((a, b) => a - b);

          const cardValue = this.getCardValue(card);
          const minRunValue = runValues[0];
          const maxRunValue = runValues[runValues.length - 1];

          // If card is adjacent to or within their run, it would help
          if (cardValue >= minRunValue - 1 && cardValue <= maxRunValue + 1) {
            return true;
          }
        }
      }
    }

    return false;
  }

  canLayoffCard(card, meld) {
    if (meld.type === 'set') {
      // For sets, must match rank or be wildcard
      if (card.isWild) return true;

      const nonWildCard = meld.cards.find(c => !c.isWild);
      return nonWildCard && card.rank === nonWildCard.rank;
    } else if (meld.type === 'run') {
      // For runs, check if card is adjacent to the run
      if (card.isWild) return true;

      const nonWildCard = meld.cards.find(c => !c.isWild);
      if (!nonWildCard || card.suit !== nonWildCard.suit) {
        return false; // Must match suit
      }

      // Get all card values in the run and check if our card extends it
      const runValues = meld.cards
        .filter(c => !c.isWild)
        .map(c => this.getCardValue(c))
        .sort((a, b) => a - b);

      const cardValue = this.getCardValue(card);
      const minRunValue = runValues[0];
      const maxRunValue = runValues[runValues.length - 1];

      // Card must be adjacent to the run (one before min or one after max)
      return cardValue === minRunValue - 1 || cardValue === maxRunValue + 1;
    }

    return false;
  }

  getCardValue(card) {
    if (card.isWild) return 0;

    const rankValues = {
      'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
    };

    return rankValues[card.rank] || 0;
  }

  getCardPoints(card) {
    if (!card) return 0;
    if (card.rank === 'JOKER') return 50;
    if (card.rank === '2') return 20;
    if (card.rank === 'A') return 15;
    if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
    return 5;
  }

  getRoundRequirements(round) {
    const requirements = [
      { sets: 2, setSizes: [3, 3], runs: 0, runSizes: [] },
      { sets: 1, setSizes: [3], runs: 1, runSizes: [4] },
      { sets: 0, setSizes: [], runs: 2, runSizes: [4, 4] },
      { sets: 3, setSizes: [3, 3, 3], runs: 0, runSizes: [] },
      { sets: 1, setSizes: [3], runs: 1, runSizes: [7] },
      { sets: 2, setSizes: [3, 3], runs: 1, runSizes: [5] },
      { sets: 3, setSizes: [4, 4, 4], runs: 0, runSizes: [] },
      { sets: 1, setSizes: [3], runs: 1, runSizes: [10] },
      { sets: 3, setSizes: [3, 3, 3], runs: 1, runSizes: [5] },
      { sets: 0, setSizes: [], runs: 3, runSizes: [5, 5, 5] }
    ];

    return requirements[round] || requirements[0];
  }

  sleepAsync(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AIPlayer;
