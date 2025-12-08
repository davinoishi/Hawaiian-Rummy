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

    // Opponent tracking for competitive AI
    this.opponentTracking = {}; // Map of playerId -> tracking data
    this.lastDiscardPileSize = 0; // Track discard pile to detect new discards
    this.lastPlayerHands = {}; // Track hand sizes to detect picks
    this.seenCards = new Set(); // All cards seen (in melds, discarded, etc)
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
    // Update opponent tracking with every state update
    this.updateOpponentTracking(state);

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

    // PRIORITY 1: If we've already met requirements, check if we can GO OUT completely
    if (currentState.hasMetRequirements) {
      console.log(`${this.playerName} already met requirements, checking if can go out with ${hand.length} cards`);

      const goOutMelds = this.findGoOutMelds(hand, currentState);

      if (goOutMelds && goOutMelds.length > 0) {
        console.log(`${this.playerName} GOING OUT with ${goOutMelds.length} melds!`);

        // Create all melds to go out
        for (const meld of goOutMelds) {
          this.socket.emit('createMeld', { type: meld.type, cardIds: meld.cardIds });
          await this.sleepAsync(300);
        }

        // Don't discard - we should have won!
        this.pendingAction = false;
        return;
      }

      // Can't go out, try to layoff high-value cards instead
      console.log(`${this.playerName} cannot go out, trying layoffs`);
      await this.handleLayoffPhase(currentState);

      // After layoffs, discard
      setTimeout(() => {
        this.handleDiscardPhase(currentState);
      }, 500);
      return;
    }

    // PRIORITY 2: Haven't met requirements yet, try to meet them
    // Use aggressive mode to maximize cards melded when meeting requirements
    const possibleMelds = this.findBestMelds(hand, currentState, true);

    if (possibleMelds.length > 0) {
      console.log(`${this.playerName} trying to meet requirements with ${possibleMelds.length} melds (aggressive mode)`);

      for (const meld of possibleMelds) {
        this.socket.emit('createMeld', { type: meld.type, cardIds: meld.cardIds });
        await this.sleepAsync(300);
      }

      // Wait for server to update hasMetRequirements
      await this.sleepAsync(300);
      const updatedState = this.gameState || currentState;

      // PRIORITY 3: After meeting requirements, immediately check if we can GO OUT
      if (updatedState.hasMetRequirements) {
        const remainingHand = updatedState.myHand || [];
        console.log(`${this.playerName} just met requirements, ${remainingHand.length} cards left, checking if can go out`);

        const goOutMelds = this.findGoOutMelds(remainingHand, updatedState);

        if (goOutMelds && goOutMelds.length > 0) {
          console.log(`${this.playerName} GOING OUT after meeting requirements with ${goOutMelds.length} additional melds!`);

          // Create all melds to go out
          for (const meld of goOutMelds) {
            this.socket.emit('createMeld', { type: meld.type, cardIds: meld.cardIds });
            await this.sleepAsync(300);
          }

          // Don't discard - we should have won!
          this.pendingAction = false;
          return;
        }

        // Can't go out yet, try layoffs
        await this.handleLayoffPhase(updatedState);
      }
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
    // Can only lay off after meeting round requirements
    const currentState = this.gameState || state;
    if (!currentState.hasMetRequirements) {
      return;
    }

    // Keep laying off cards until no more can be laid off
    let madeLayoff = true;

    while (madeLayoff) {
      madeLayoff = false;

      // Get fresh state each iteration
      const freshState = this.gameState || currentState;
      const hand = freshState.myHand || [];
      const allPlayers = freshState.players || [];

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

    // COMPETITIVE AI: Check if opponents want this card (denial value)
    // If multiple opponents are tracking this card, buying it denies them
    if (state.players) {
      const myId = state.players.find(p => p.isMe)?.id;
      const opponents = state.players.filter(p => p.id !== myId);
      let opponentsWhoWantCard = 0;

      for (const opponent of opponents) {
        if (this.wouldHelpOpponentAdvanced(card, opponent)) {
          opponentsWhoWantCard++;
        }
      }

      // Add denial value if opponents want this card
      if (opponentsWhoWantCard > 0) {
        benefit += opponentsWhoWantCard * 10; // 10 points per opponent who wants it
        console.log(`${this.playerName}: ${opponentsWhoWantCard} opponent(s) want ${card.rank}${card.suit}, denial value +${opponentsWhoWantCard * 10}`);
      }
    }

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

  // ===== MELD COMBINATION VALIDATOR (#11) =====
  // Try all possible meld combinations using backtracking
  findBestMeldCombination(hand, requirements, aggressive = false) {
    console.log(`${this.playerName} trying all meld combinations for requirements: ${requirements.sets || 0} sets, ${requirements.runs || 0} runs`);

    // Generate ALL possible sets and runs from hand
    const allPossibleSets = this.findAllPossibleSets(hand, requirements.setSizes || []);
    const allPossibleRuns = this.findAllPossibleRuns(hand, requirements.runSizes || []);

    console.log(`${this.playerName} found ${allPossibleSets.length} possible set groups, ${allPossibleRuns.length} possible run groups`);

    // Try to find a valid combination using backtracking
    const bestCombination = this.backtrackMeldCombination(
      allPossibleSets,
      allPossibleRuns,
      requirements,
      aggressive
    );

    if (bestCombination) {
      console.log(`${this.playerName} FOUND VALID COMBINATION with ${bestCombination.length} melds!`);
      return bestCombination;
    }

    console.log(`${this.playerName} could not find valid meld combination`);
    return [];
  }

  // Backtracking to find valid meld combination
  backtrackMeldCombination(possibleSets, possibleRuns, requirements, aggressive) {
    const totalSetsNeeded = requirements.sets || 0;
    const totalRunsNeeded = requirements.runs || 0;
    const setSizes = requirements.setSizes || [];
    const runSizes = requirements.runSizes || [];

    // Try all combinations of sets
    const setCombinations = this.generateCombinations(possibleSets, totalSetsNeeded);

    for (const setGroup of setCombinations) {
      // Check if sets have card conflicts
      const setCards = new Set();
      let hasConflict = false;

      for (const set of setGroup) {
        for (const card of set.cards) {
          if (setCards.has(card.id)) {
            hasConflict = true;
            break;
          }
          setCards.add(card.id);
        }
        if (hasConflict) break;
      }

      if (hasConflict) continue;

      // Filter runs that don't conflict with chosen sets
      const validRuns = possibleRuns.filter(run => {
        return !run.cards.some(card => setCards.has(card.id));
      });

      // Try all combinations of runs
      const runCombinations = this.generateCombinations(validRuns, totalRunsNeeded);

      for (const runGroup of runCombinations) {
        // Check if runs have card conflicts among themselves
        const runCards = new Set();
        let runConflict = false;

        for (const run of runGroup) {
          for (const card of run.cards) {
            if (runCards.has(card.id)) {
              runConflict = true;
              break;
            }
            runCards.add(card.id);
          }
          if (runConflict) break;
        }

        if (runConflict) continue;

        // Found a valid combination!
        const melds = [];

        // Add sets
        for (let i = 0; i < setGroup.length; i++) {
          const set = setGroup[i];
          const requiredSize = setSizes[i] || 3;
          const cardsToUse = aggressive ? set.cards : set.cards.slice(0, requiredSize);

          melds.push({
            type: 'set',
            cardIds: cardsToUse.map(c => c.id),
            cards: cardsToUse
          });
        }

        // Add runs
        for (let i = 0; i < runGroup.length; i++) {
          const run = runGroup[i];
          const requiredSize = runSizes[i] || 4;
          const cardsToUse = aggressive ? run.cards : run.cards.slice(0, requiredSize);

          melds.push({
            type: 'run',
            cardIds: cardsToUse.map(c => c.id),
            cards: cardsToUse
          });
        }

        return melds;
      }
    }

    return null;
  }

  // Generate all combinations of items (choose k from array)
  generateCombinations(items, k) {
    if (k === 0) return [[]];
    if (items.length === 0) return [];
    if (items.length < k) return [];

    const result = [];

    const combine = (start, chosen) => {
      if (chosen.length === k) {
        result.push([...chosen]);
        return;
      }

      for (let i = start; i < items.length; i++) {
        chosen.push(items[i]);
        combine(i + 1, chosen);
        chosen.pop();
      }
    };

    combine(0, []);
    return result;
  }

  findBestMelds(hand, state, aggressive = false) {
    const melds = [];
    const requirements = this.getRoundRequirements(state.currentRound);
    const usedCards = new Set();

    // ===== USE MELD COMBINATION VALIDATOR (#11) =====
    // Try the new backtracking approach first
    const validCombination = this.findBestMeldCombination(hand, requirements, aggressive);
    if (validCombination && validCombination.length > 0) {
      return validCombination;
    }

    // Fallback to old greedy approach if backtracking fails
    console.log(`${this.playerName} backtracking failed, using greedy approach`);

    // ===== WILDCARD HOARDING STRATEGY =====
    // Try to meet requirements WITHOUT using wildcards first
    // This preserves wildcards for critical situations (going out, difficult melds)
    const wildcards = hand.filter(c => c.isWild);
    const nonWildcardHand = hand.filter(c => !c.isWild);

    let sets = [];
    let runs = [];
    let usedWildcards = false;

    // First attempt: Try to find melds without using any wildcards
    if (wildcards.length > 0) {
      console.log(`${this.playerName} wildcard hoarding: trying to meet requirements without ${wildcards.length} wildcard(s)`);

      sets = this.findSetsWithSizes(nonWildcardHand, requirements.setSizes || []);
      const setsFound = sets.length;

      if (setsFound >= (requirements.sets || 0)) {
        const remainingNonWildCards = nonWildcardHand.filter(c =>
          !sets.some(set => set.cards.some(sc => sc.id === c.id))
        );
        runs = this.findRunsWithSizes(remainingNonWildCards, requirements.runSizes || []);

        const runsFound = runs.length;
        const totalSetsNeeded = requirements.sets || 0;
        const totalRunsNeeded = requirements.runs || 0;

        if (setsFound >= totalSetsNeeded && runsFound >= totalRunsNeeded) {
          console.log(`${this.playerName} SUCCESS: met requirements WITHOUT using wildcards! (Saved ${wildcards.length} wildcard(s))`);
          // Successfully met requirements without wildcards!
          // Don't use wildcards at all
        } else {
          // Failed without wildcards, need to use them
          console.log(`${this.playerName} needs wildcards to meet requirements (found ${setsFound}/${totalSetsNeeded} sets, ${runsFound}/${totalRunsNeeded} runs)`);
          usedWildcards = true;
        }
      } else {
        console.log(`${this.playerName} needs wildcards to meet requirements (found ${setsFound}/${requirements.sets || 0} sets)`);
        usedWildcards = true;
      }
    } else {
      // No wildcards in hand, proceed normally
      usedWildcards = true;
    }

    // Second attempt: If we failed without wildcards, use them
    if (usedWildcards || wildcards.length === 0) {
      // Try to find sets first with proper sizes
      sets = this.findSetsWithSizes(hand, requirements.setSizes || []);
    }
    let setIndex = 0;
    for (const set of sets) {
      const requiredSize = requirements.setSizes && requirements.setSizes[setIndex]
        ? requirements.setSizes[setIndex]
        : 3;

      if (set.cards.length >= requiredSize) {
        // In aggressive mode, use ALL cards; otherwise use exact number
        const cardsToUse = aggressive ? set.cards : set.cards.slice(0, requiredSize);

        melds.push({
          type: 'set',
          cardIds: cardsToUse.map(c => c.id)
        });
        cardsToUse.forEach(c => usedCards.add(c.id));
        setIndex++;

        if (aggressive) {
          console.log(`${this.playerName} aggressive meld: using ALL ${cardsToUse.length} cards for set (min required: ${requiredSize})`);
        }
      }
    }

    // Try to find runs with proper sizes
    const remainingCards = hand.filter(c => !usedCards.has(c.id));

    // Only recalculate runs if we're using wildcards (or had no wildcards)
    if (usedWildcards || wildcards.length === 0) {
      runs = this.findRunsWithSizes(remainingCards, requirements.runSizes || []);
    }
    // Otherwise, we already calculated runs without wildcards above

    let runIndex = 0;
    for (const run of runs) {
      const requiredSize = requirements.runSizes && requirements.runSizes[runIndex]
        ? requirements.runSizes[runIndex]
        : 4;

      if (run.cards.length >= requiredSize) {
        // In aggressive mode, use ALL cards; otherwise use exact number
        const cardsToUse = aggressive ? run.cards : run.cards.slice(0, requiredSize);

        melds.push({
          type: 'run',
          cardIds: cardsToUse.map(c => c.id)
        });
        cardsToUse.forEach(c => usedCards.add(c.id));
        runIndex++;

        if (aggressive) {
          console.log(`${this.playerName} aggressive meld: using ALL ${cardsToUse.length} cards for run (min required: ${requiredSize})`);
        }
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

    // PERFORMANCE FIX: Calculate winning cards ONCE instead of for each card evaluation
    // This prevents 624+ calls to expensive findGoOutMelds function
    const winningCards = this.calculateOneDrawVictoryCards(hand, state);

    // Use advanced discard scoring: lower score = better to discard
    // Score considers: card potential, points, and opponent needs
    let bestCard = nonWildCards[0];
    let bestScore = Infinity;

    for (const card of nonWildCards) {
      const score = this.calculateDiscardScore(card, hand, state, opponents, winningCards);

      console.log(`${this.playerName} discard analysis: ${card.rank}${card.suit} score=${score.toFixed(1)}`);

      if (score < bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }

    console.log(`${this.playerName} choosing to discard: ${bestCard.rank}${bestCard.suit} (score=${bestScore.toFixed(1)})`);
    return bestCard;
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

  // ===== FLEXIBLE MELD PLANNING (#7) =====
  // Find ALL possible sets (not just greedy first choice)
  findAllPossibleSets(hand, setSizes) {
    const wildcards = hand.filter(c => c.isWild);
    const nonWildCards = hand.filter(c => !c.isWild);

    // Group by rank
    const rankGroups = {};
    for (const card of nonWildCards) {
      if (!rankGroups[card.rank]) {
        rankGroups[card.rank] = [];
      }
      rankGroups[card.rank].push(card);
    }

    const allSets = [];

    // For each required set size, find all possible sets of that size
    for (const requiredSize of setSizes) {
      // Try each rank group
      for (const rank in rankGroups) {
        const cards = rankGroups[rank];
        const naturalCards = cards.length;
        const wildsNeeded = Math.max(0, requiredSize - naturalCards);

        // Can we make a set of this size from this rank?
        if (naturalCards + wildcards.length >= requiredSize && wildsNeeded <= wildcards.length) {
          // Create the set
          const setCards = [...cards];

          // Add wildcards if needed
          for (let i = 0; i < wildsNeeded && i < wildcards.length; i++) {
            setCards.push(wildcards[i]);
          }

          if (setCards.length >= requiredSize) {
            allSets.push({
              cards: setCards,
              minSize: requiredSize,
              rank: rank,
              wildsUsed: wildsNeeded
            });
          }
        }
      }
    }

    return allSets;
  }

  // Find ALL possible runs (not just greedy first choice)
  findAllPossibleRuns(hand, runSizes) {
    const wildcards = hand.filter(c => c.isWild);
    const nonWildCards = hand.filter(c => !c.isWild);

    // Group by suit
    const suitGroups = {};
    for (const card of nonWildCards) {
      if (!suitGroups[card.suit]) {
        suitGroups[card.suit] = [];
      }
      suitGroups[card.suit].push(card);
    }

    const allRuns = [];

    // For each required run size, find all possible runs of that size
    for (const requiredSize of runSizes) {
      // Try each suit
      for (const suit in suitGroups) {
        const cards = suitGroups[suit];

        // Sort by value
        const sorted = cards.sort((a, b) => {
          const aVal = this.getCardValue(a);
          const bVal = this.getCardValue(b);
          return aVal - bVal;
        });

        // Try all possible starting positions for runs
        for (let start = 0; start < sorted.length; start++) {
          // Try to build a run starting from this card
          const run = this.tryBuildRunOfSize(sorted, start, requiredSize, wildcards);

          if (run && run.cards.length >= requiredSize) {
            allRuns.push({
              cards: run.cards,
              minSize: requiredSize,
              suit: suit,
              wildsUsed: run.wildsUsed
            });
          }
        }
      }
    }

    return allRuns;
  }

  // Try to build a run of specific size starting from a position
  tryBuildRunOfSize(sortedCards, startIdx, targetSize, availableWilds) {
    if (startIdx >= sortedCards.length) return null;

    const runCards = [sortedCards[startIdx]];
    let currentValue = this.getCardValue(sortedCards[startIdx]);
    let wildsUsed = 0;
    let nextIdx = startIdx + 1;

    while (runCards.length < targetSize) {
      const nextValue = currentValue + 1;

      // Check if we've reached the limit (K is highest non-Ace)
      if (nextValue > 13) break;

      // Do we have a natural card for this value?
      if (nextIdx < sortedCards.length && this.getCardValue(sortedCards[nextIdx]) === nextValue) {
        runCards.push(sortedCards[nextIdx]);
        currentValue = nextValue;
        nextIdx++;
      }
      // Can we use a wildcard?
      else if (wildsUsed < availableWilds.length) {
        runCards.push(availableWilds[wildsUsed]);
        wildsUsed++;
        currentValue = nextValue;
      }
      // Can't continue
      else {
        break;
      }
    }

    if (runCards.length >= targetSize) {
      return { cards: runCards, wildsUsed };
    }

    return null;
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

  // ===== GO OUT DETECTION =====

  // Find meld combinations that use ALL cards to go out
  findGoOutMelds(hand, state) {
    if (hand.length === 0) return [];

    console.log(`${this.playerName} checking if can go out with ${hand.length} cards`);

    // Try to find any valid combination of melds that uses ALL cards
    const allMelds = this.findAllPossibleMelds(hand);

    if (allMelds.length === 0) {
      return null; // Cannot go out
    }

    // Find combination that uses all cards
    const goOutCombination = this.findMeldCombinationUsingAllCards(hand, allMelds);

    if (goOutCombination) {
      console.log(`${this.playerName} CAN GO OUT! Found ${goOutCombination.length} melds using all ${hand.length} cards`);
      return goOutCombination;
    }

    return null;
  }

  // Find ALL possible melds (sets and runs) in hand, not just minimum requirements
  findAllPossibleMelds(hand) {
    const possibleMelds = [];

    // Find all possible sets (3+ of same rank)
    const rankGroups = {};
    const wildcards = hand.filter(c => c.isWild);

    for (const card of hand) {
      if (card.isWild) continue;
      if (!rankGroups[card.rank]) {
        rankGroups[card.rank] = [];
      }
      rankGroups[card.rank].push(card);
    }

    // Add sets of various sizes (3, 4, 5, etc.)
    for (const rank in rankGroups) {
      const cards = rankGroups[rank];

      // Try sets of size 3, 4, 5+ with and without wildcards
      for (let size = 3; size <= cards.length + wildcards.length; size++) {
        if (cards.length >= size) {
          // Natural set
          possibleMelds.push({
            type: 'set',
            cards: cards.slice(0, size),
            cardIds: cards.slice(0, size).map(c => c.id)
          });
        } else if (cards.length + wildcards.length >= size) {
          // Set with wildcards
          const wildsNeeded = size - cards.length;
          if (wildsNeeded <= wildcards.length) {
            possibleMelds.push({
              type: 'set',
              cards: [...cards, ...wildcards.slice(0, wildsNeeded)],
              cardIds: [...cards, ...wildcards.slice(0, wildsNeeded)].map(c => c.id)
            });
          }
        }
      }
    }

    // Find all possible runs (4+ cards in sequence)
    const suitGroups = {};
    for (const card of hand) {
      if (card.isWild) continue;
      if (!suitGroups[card.suit]) {
        suitGroups[card.suit] = [];
      }
      suitGroups[card.suit].push(card);
    }

    for (const suit in suitGroups) {
      const cards = suitGroups[suit].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));

      // Find all runs in this suit (with and without wildcards)
      const runs = this.findAllRunsInSuit(cards, wildcards);
      possibleMelds.push(...runs);
    }

    return possibleMelds;
  }

  // Find all possible runs in a suit
  findAllRunsInSuit(sortedCards, availableWilds) {
    const runs = [];

    // Try starting from each card
    for (let start = 0; start < sortedCards.length; start++) {
      // Try runs of various lengths
      for (let end = start + 1; end <= sortedCards.length; end++) {
        const subset = sortedCards.slice(start, end);
        const run = this.tryBuildRun(subset, [...availableWilds]);

        if (run && run.length >= 4) {
          runs.push({
            type: 'run',
            cards: run,
            cardIds: run.map(c => c.id)
          });
        }
      }
    }

    return runs;
  }

  // Try to build a run from cards, using wildcards to fill gaps
  tryBuildRun(cards, availableWilds) {
    if (cards.length === 0) return null;

    const result = [cards[0]];
    let expectedNextValue = this.getCardValue(cards[0]) + 1;

    for (let i = 1; i < cards.length; i++) {
      const cardValue = this.getCardValue(cards[i]);

      // Fill gaps with wildcards
      while (expectedNextValue < cardValue && availableWilds.length > 0) {
        result.push(availableWilds.shift());
        expectedNextValue++;
      }

      if (cardValue === expectedNextValue) {
        result.push(cards[i]);
        expectedNextValue = cardValue + 1;
      } else if (cardValue > expectedNextValue) {
        // Gap too large, can't continue
        break;
      }
      // Skip duplicates
    }

    return result.length >= 4 ? result : null;
  }

  // Find a combination of melds that uses all cards
  findMeldCombinationUsingAllCards(hand, possibleMelds) {
    // Use backtracking to find a valid combination
    const usedCards = new Set();
    const selectedMelds = [];

    const backtrack = (meldIndex) => {
      // Check if all cards are used
      if (usedCards.size === hand.length) {
        return true; // Found a valid combination!
      }

      // Try remaining melds
      for (let i = meldIndex; i < possibleMelds.length; i++) {
        const meld = possibleMelds[i];

        // Check if any card in this meld is already used
        const hasConflict = meld.cards.some(c => usedCards.has(c.id));
        if (hasConflict) continue;

        // Try using this meld
        meld.cards.forEach(c => usedCards.add(c.id));
        selectedMelds.push(meld);

        // Recurse
        if (backtrack(i + 1)) {
          return true;
        }

        // Backtrack
        meld.cards.forEach(c => usedCards.delete(c.id));
        selectedMelds.pop();
      }

      return false;
    };

    if (backtrack(0)) {
      return selectedMelds;
    }

    return null;
  }

  // ===== OPPONENT TRACKING METHODS =====

  // Update opponent tracking based on game state changes
  updateOpponentTracking(state) {
    if (!state || !state.players) return;

    const myId = state.players.find(p => p.isMe)?.id;

    // Initialize tracking for new opponents
    for (const player of state.players) {
      if (player.id === myId) continue;

      if (!this.opponentTracking[player.id]) {
        this.opponentTracking[player.id] = {
          pickedCards: [], // Cards taken from discard or bought
          discardedCards: [], // Cards they discarded
          likelyBuilding: { ranks: {}, suits: {} } // What they might be building
        };
      }

      // Initialize last hand size tracking
      if (this.lastPlayerHands[player.id] === undefined) {
        this.lastPlayerHands[player.id] = player.handSize;
      }
    }

    // Track new discards
    if (state.discardPile && state.discardPile.length > this.lastDiscardPileSize) {
      const newDiscard = state.discardPile[state.discardPile.length - 1];
      this.seenCards.add(`${newDiscard.rank}${newDiscard.suit}`);

      // Identify who discarded (the last player who acted)
      const lastPlayerId = state.lastDiscarder;
      if (lastPlayerId && lastPlayerId !== myId && this.opponentTracking[lastPlayerId]) {
        this.opponentTracking[lastPlayerId].discardedCards.push(newDiscard);
        console.log(`${this.playerName} tracked: opponent discarded ${newDiscard.rank}${newDiscard.suit}`);
      }

      this.lastDiscardPileSize = state.discardPile.length;
    }

    // Track cards opponents picked up (detect hand size increase)
    for (const player of state.players) {
      if (player.id === myId) continue;

      const previousHandSize = this.lastPlayerHands[player.id];
      const currentHandSize = player.handSize;

      // If hand size increased, they picked up a card
      if (currentHandSize > previousHandSize) {
        const topDiscard = state.discardPile && state.discardPile.length > 0
          ? state.discardPile[state.discardPile.length - 1]
          : null;

        if (topDiscard && this.opponentTracking[player.id]) {
          this.opponentTracking[player.id].pickedCards.push(topDiscard);
          this.updateLikelyBuilding(player.id, topDiscard);
          console.log(`${this.playerName} tracked: opponent picked ${topDiscard.rank}${topDiscard.suit}`);
        }
      }

      this.lastPlayerHands[player.id] = currentHandSize;
    }

    // Track cards in melds (these are known cards)
    for (const player of state.players) {
      if (player.melds) {
        for (const meld of player.melds) {
          for (const card of meld.cards) {
            this.seenCards.add(`${card.rank}${card.suit}`);
          }
        }
      }
    }
  }

  // Update what we think opponent is building
  updateLikelyBuilding(playerId, card) {
    const tracking = this.opponentTracking[playerId];
    if (!tracking) return;

    // Track rank frequency (for sets)
    if (!tracking.likelyBuilding.ranks[card.rank]) {
      tracking.likelyBuilding.ranks[card.rank] = 0;
    }
    tracking.likelyBuilding.ranks[card.rank]++;

    // Track suit frequency (for runs)
    if (!tracking.likelyBuilding.suits[card.suit]) {
      tracking.likelyBuilding.suits[card.suit] = [];
    }
    tracking.likelyBuilding.suits[card.suit].push(card.rank);
  }

  // Check if a card would likely help an opponent
  wouldHelpOpponentAdvanced(card, opponent) {
    const tracking = this.opponentTracking[opponent.id];
    if (!tracking) return false;

    // Check if they're collecting this rank (for sets)
    const rankCount = tracking.likelyBuilding.ranks[card.rank] || 0;
    if (rankCount >= 1) {
      console.log(`${this.playerName}: Card ${card.rank}${card.suit} would help opponent build set`);
      return true; // They've picked this rank before
    }

    // Check if they're building a run in this suit
    const suitCards = tracking.likelyBuilding.suits[card.suit] || [];
    if (suitCards.length >= 2) {
      // They have multiple cards of this suit, check if our card fits the sequence
      const values = suitCards.map(rank => this.getCardValue({ rank, suit: card.suit }));
      const cardValue = this.getCardValue(card);

      for (const value of values) {
        if (Math.abs(cardValue - value) <= 2) {
          console.log(`${this.playerName}: Card ${card.rank}${card.suit} would help opponent build run`);
          return true; // Our card is close to their suit collection
        }
      }
    }

    // Check if they can layoff on our melds
    if (opponent.melds) {
      for (const meld of opponent.melds) {
        if (this.canLayoffCard(card, meld)) {
          console.log(`${this.playerName}: Card ${card.rank}${card.suit} could layoff on opponent meld`);
          return true;
        }
      }
    }

    return false;
  }

  // ===== DEADWOOD MINIMIZATION METHODS =====

  // Calculate total deadwood (unmelded cards) points in hand
  calculateDeadwood(hand, state) {
    if (!hand || hand.length === 0) return 0;

    // If we've met requirements, all cards in hand are deadwood
    if (state && state.hasMetRequirements) {
      return hand.reduce((sum, card) => sum + this.getCardPoints(card), 0);
    }

    // If we haven't met requirements, calculate deadwood as cards that don't contribute to potential melds
    // For now, we'll use a simpler approach: assume all cards are deadwood until we meld
    return hand.reduce((sum, card) => sum + this.getCardPoints(card), 0);
  }

  // Calculate potential value of a card (how close it is to forming melds)
  // ===== CARD VERSATILITY SCORING (#8) =====
  calculateCardVersatility(card) {
    if (card.isWild) return 50; // Wildcards are maximally versatile

    const value = this.getCardValue(card);

    // Middle cards (6,7,8,9) can fit in the most runs
    // They have 9-10 potential run positions
    if (value >= 6 && value <= 9) {
      return 30; // High versatility
    }

    // Cards 4,5,10,J have good versatility (7-8 positions)
    if (value >= 4 && value <= 5) {
      return 20; // Good versatility
    }
    if (value >= 10 && value <= 11) {
      return 20; // Good versatility
    }

    // Edge cards (A,2,3,Q,K) have limited versatility (3-6 positions)
    if (value >= 1 && value <= 3) {
      return 5; // Low versatility - prefer to discard
    }
    if (value >= 12 && value <= 13) {
      return 5; // Low versatility - prefer to discard
    }

    return 10; // Default
  }

  calculateCardPotential(card, hand, state) {
    if (card.isWild) {
      return 100; // Wildcards have max potential
    }

    let potential = 0;

    // ===== CARD VERSATILITY SCORING (#8) =====
    // Add versatility bonus - middle cards are more valuable
    const versatility = this.calculateCardVersatility(card);
    potential += versatility;

    // Check set potential (cards of same rank)
    const sameRankCards = hand.filter(c => c.rank === card.rank && !c.isWild && c.id !== card.id);
    if (sameRankCards.length >= 2) {
      potential += 50; // Can immediately form a set
    } else if (sameRankCards.length === 1) {
      potential += 25; // One away from a set
    }

    // Check run potential (cards of same suit in sequence)
    const sameSuitCards = hand.filter(c => c.suit === card.suit && !c.isWild && c.id !== card.id);
    const withCard = [...sameSuitCards, card].sort((a, b) =>
      this.getCardValue(a) - this.getCardValue(b)
    );

    const longestRun = this.findLongestSequence(withCard);
    if (longestRun >= 4) {
      potential += 50; // Can form a run
    } else if (longestRun === 3) {
      potential += 30; // Close to a run
    } else if (longestRun === 2) {
      potential += 15; // Starting a run
    }

    // Check if card can be laid off on existing melds (post-meld phase)
    if (state && state.hasMetRequirements && state.players) {
      for (const player of state.players) {
        if (player.melds) {
          for (const meld of player.melds) {
            if (this.canLayoffCard(card, meld)) {
              potential += 40; // Can be laid off
              break;
            }
          }
        }
      }
    }

    return potential;
  }

  // Calculate efficiency score: lower is better to discard (high points, low potential)
  // ===== TURN ORDER AWARENESS AND RISK ASSESSMENT =====
  // Assess how threatening an opponent is (0-100 scale)
  assessOpponentThreat(opponent, state) {
    if (!opponent) return 0;

    let threat = 0;

    // Factor 1: Hand size (fewer cards = higher threat)
    const handSize = opponent.handSize || 10;
    if (handSize <= 2) {
      threat += 80; // EXTREME threat - about to win
    } else if (handSize <= 4) {
      threat += 50; // High threat
    } else if (handSize <= 6) {
      threat += 25; // Medium threat
    } else {
      threat += 5; // Low threat
    }

    // Factor 2: Has met requirements? (much more threatening)
    if (opponent.hasMetRequirements) {
      threat += 30;
    }

    // Factor 3: Number of melds (more melds = closer to winning)
    const meldCount = opponent.melds ? opponent.melds.length : 0;
    threat += meldCount * 5;

    return Math.min(100, threat);
  }

  // Get the next player in turn order
  getNextPlayer(state) {
    if (!state.players || state.players.length === 0) return null;

    const currentIndex = state.currentPlayerIndex;
    const nextIndex = (currentIndex + 1) % state.players.length;

    return state.players[nextIndex];
  }

  // Calculate urgency to win based on opponent threats
  calculateWinUrgency(state) {
    const opponents = state.players.filter(p => !p.isMe);
    if (opponents.length === 0) return 0;

    let maxThreat = 0;
    let nextPlayerThreat = 0;

    // Get next player (most critical)
    const nextPlayer = this.getNextPlayer(state);
    if (nextPlayer && !nextPlayer.isMe) {
      nextPlayerThreat = this.assessOpponentThreat(nextPlayer, state);
    }

    // Check all opponents
    for (const opponent of opponents) {
      const threat = this.assessOpponentThreat(opponent, state);
      maxThreat = Math.max(maxThreat, threat);
    }

    // Next player threat is 1.5x more important (they go before us)
    const urgency = Math.max(nextPlayerThreat * 1.5, maxThreat);

    if (urgency > 60) {
      console.log(`${this.playerName} URGENT: Next player threat=${nextPlayerThreat.toFixed(0)}, Max opponent threat=${maxThreat.toFixed(0)}`);
    }

    return urgency;
  }

  // ===== ONE-TURN VICTORY PROBABILITY =====
  // Calculate which cards would allow us to go out on the next draw
  calculateOneDrawVictoryCards(hand, state) {
    // Only relevant if we've met requirements
    if (!state.hasMetRequirements) {
      return [];
    }

    const winningCards = [];
    const allRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const allSuits = ['♠', '♥', '♦', '♣'];

    // Test each possible card we could draw
    for (const rank of allRanks) {
      for (const suit of allSuits) {
        // Create hypothetical card
        const hypotheticalCard = {
          id: 'test-' + rank + suit,
          rank: rank,
          suit: suit,
          isWild: false
        };

        // Simulate adding this card to our hand
        const testHand = [...hand, hypotheticalCard];

        // Check if we could go out with this hand
        const goOutMelds = this.findGoOutMelds(testHand, state);

        if (goOutMelds && goOutMelds.length > 0) {
          winningCards.push({ rank, suit });
        }
      }
    }

    if (winningCards.length > 0) {
      console.log(`${this.playerName} can win next turn by drawing: ${winningCards.map(c => c.rank + c.suit).join(', ')} (${winningCards.length} cards)`);
    }

    return winningCards;
  }

  // Check if a card is critical for a potential one-turn victory
  isCardCriticalForVictory(card, hand, state, winningCards) {
    // If we can't win next turn, nothing is critical
    if (winningCards.length === 0) {
      return false;
    }

    // PERFORMANCE OPTIMIZATION: Instead of recalculating all winning cards for the modified hand,
    // we can check if this card is required for ANY of our meld combinations that would let us go out.
    // This is much faster than full recalculation.

    // Quick heuristic: If this card appears in any melds we've already made,
    // or if removing it would prevent us from meeting requirements, it's critical
    const handWithoutCard = hand.filter(c => c.id !== card.id);

    // Only do full check if we have very few cards (< 4), otherwise use heuristic
    if (hand.length <= 4) {
      // With few cards, do the full check
      const newWinningCards = this.calculateOneDrawVictoryCards(handWithoutCard, state);
      const lostOpportunities = winningCards.length - newWinningCards.length;

      if (lostOpportunities > 0) {
        console.log(`${this.playerName} CRITICAL: discarding ${card.rank}${card.suit} would lose ${lostOpportunities} winning opportunities!`);
        return true;
      }
    }
    // For larger hands, assume cards are not critical (performance over perfect accuracy)

    return false;
  }

  calculateDiscardScore(card, hand, state, opponents, winningCards) {
    const points = this.getCardPoints(card);
    const potential = this.calculateCardPotential(card, hand, state);

    // TURN ORDER AWARENESS - Check if next player or any opponent would benefit
    let helpsOpponent = false;
    let helpsNextPlayer = false;
    const nextPlayer = this.getNextPlayer(state);

    for (const opponent of opponents) {
      if (this.wouldHelpOpponentAdvanced(card, opponent)) {
        helpsOpponent = true;

        // Check if this is the next player specifically
        if (nextPlayer && opponent.id === nextPlayer.id) {
          helpsNextPlayer = true;
        }
        break;
      }
    }

    // Calculate overall game urgency based on opponent threats
    const winUrgency = this.calculateWinUrgency(state);
    const nextPlayerThreat = nextPlayer ? this.assessOpponentThreat(nextPlayer, state) : 0;

    // ONE-TURN VICTORY PROBABILITY CHECK
    // winningCards is now passed as a parameter (calculated once per discard decision)
    // This prevents expensive recalculation for each card being evaluated
    const isCriticalForVictory = this.isCardCriticalForVictory(card, hand, state, winningCards);

    // Score formula: want to discard high-point, low-potential cards that don't help opponents
    // Lower score = better to discard
    let score = potential - points;

    // TURN ORDER AWARENESS PENALTIES
    // Heavy penalty if it helps the NEXT player (they go before us!)
    if (helpsNextPlayer) {
      const nextPlayerPenalty = 250 + (nextPlayerThreat * 3); // Scale with their threat level
      score += nextPlayerPenalty;
      console.log(`${this.playerName} TURN ORDER: ${card.rank}${card.suit} would help NEXT player (threat=${nextPlayerThreat.toFixed(0)}, penalty=+${nextPlayerPenalty.toFixed(0)})`);
    } else if (helpsOpponent) {
      // Penalty for helping any opponent (less severe than next player)
      score += 200;
    }

    // Increase defensive play when ANY opponent is threatening
    if (winUrgency > 60 && helpsOpponent) {
      const urgencyPenalty = (winUrgency - 60) * 5; // Extra penalty based on urgency
      score += urgencyPenalty;
      console.log(`${this.playerName} DEFENSIVE: High urgency (${winUrgency.toFixed(0)}), avoiding helpful discard (penalty=+${urgencyPenalty.toFixed(0)})`);
    }

    // MASSIVE penalty if this card is critical for a one-turn victory
    if (isCriticalForVictory) {
      score += 500; // Highest priority - never discard victory-enabling cards
      console.log(`${this.playerName} heavily penalizing ${card.rank}${card.suit} (critical for victory, score +500)`);
    } else if (winningCards.length > 0) {
      // Even if not critical, we're close to winning, so be more conservative
      score += 50; // Slight penalty to prefer keeping cards when close to victory
    }

    return score;
  }

  sleepAsync(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AIPlayer;
