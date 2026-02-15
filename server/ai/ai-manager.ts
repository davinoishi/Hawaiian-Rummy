/**
 * Hawaiian Rummy - AI Manager
 * Manages AI players using direct game engine integration (no sockets)
 */

import { Server } from 'socket.io';
import { GameManager } from '../game-manager';
import { AIStrategy, DrawDecision, BuyDecision } from './ai-strategy';
import { StandardAIStrategy } from './strategies/standard-ai';
import {
  GameState,
  GameAction,
  DrawCardAction,
  TakeDiscardAction,
  CreateMeldAction,
  CancelMeldsAction,
  DiscardAction,
  LayoffCardAction,
  RequestBuyAction,
  PassBuyAction,
  ContinueToNextRoundAction
} from '../../shared/game-engine/types';
import { AI_DECISION_DELAY } from '../../shared/game-engine/constants';
import type { TournamentManager } from '../tournament-manager.js';

/**
 * AI Player data
 */
interface AIPlayer {
  id: string;
  roomId: string;
  name: string;
  strategy: AIStrategy;
}

/**
 * AI Manager class
 * Manages all AI players across rooms
 */
export class AIManager {
  private aiPlayers: Map<string, AIPlayer> = new Map();
  private gameManager: GameManager;
  private io: Server;
  private defaultStrategy: AIStrategy;
  private processingTurn: Set<string> = new Set(); // Track which AIs are processing
  private tournamentManager: TournamentManager | null = null;

  constructor(gameManager: GameManager, io: Server) {
    this.gameManager = gameManager;
    this.io = io;
    this.defaultStrategy = new StandardAIStrategy();

    // Start the AI turn processor
    this.startAIProcessor();
  }

  /**
   * Set tournament manager reference for persisting game state after AI actions
   */
  setTournamentManager(tm: TournamentManager): void {
    this.tournamentManager = tm;
  }

  /**
   * Register an AI player
   */
  registerAI(roomId: string, aiId: string, name: string, strategy?: AIStrategy): void {
    const aiPlayer: AIPlayer = {
      id: aiId,
      roomId,
      name,
      strategy: strategy || this.defaultStrategy
    };

    this.aiPlayers.set(aiId, aiPlayer);
    console.log(`[AI] Registered ${name} (${aiId}) in room ${roomId}`);
  }

  /**
   * Unregister an AI player
   */
  unregisterAI(aiId: string): void {
    const ai = this.aiPlayers.get(aiId);
    if (ai) {
      console.log(`[AI] Unregistered ${ai.name} (${aiId})`);
      this.aiPlayers.delete(aiId);
    }
  }

  /**
   * Unregister all AIs in a room
   */
  unregisterRoomAIs(roomId: string): void {
    for (const [aiId, ai] of this.aiPlayers) {
      if (ai.roomId === roomId) {
        this.aiPlayers.delete(aiId);
      }
    }
  }

  /**
   * Get AI player by ID
   */
  getAI(aiId: string): AIPlayer | undefined {
    return this.aiPlayers.get(aiId);
  }

  /**
   * Check if an ID belongs to an AI
   */
  isAI(playerId: string): boolean {
    return this.aiPlayers.has(playerId);
  }

  /**
   * Start the AI turn processor
   * This runs periodically to check if any AI needs to act
   */
  private startAIProcessor(): void {
    setInterval(() => {
      this.processAITurns();
    }, 500); // Check every 500ms
  }

  /**
   * Process turns for all AIs
   */
  private processAITurns(): void {
    for (const [aiId, ai] of this.aiPlayers) {
      // Skip if already processing
      if (this.processingTurn.has(aiId)) continue;

      // Always get fresh state for each AI check
      const state = this.gameManager.getGameState(ai.roomId);
      if (!state || !state.gameStarted) continue;

      // Check if AI needs to act
      const needsAction = this.checkIfAINeedsAction(state, aiId);
      if (needsAction) {
        const currentPlayer = state.players[state.currentPlayerIndex];
        console.log(`[AI] ${ai.name} needs action (phase: ${state.gamePhase}, current: ${currentPlayer === aiId ? 'self' : 'other'}, passedBuy: ${state.passedBuy.includes(aiId)})`);
        this.processingTurn.add(aiId);
        this.processAIAction(ai, state);
      }
    }
  }

  /**
   * Check if an AI needs to take action
   */
  private checkIfAINeedsAction(state: GameState, aiId: string): boolean {
    // Check if it's round summary and AI hasn't continued
    if (state.gamePhase === 'roundSummary') {
      return !state.continueClicked.includes(aiId);
    }

    // Check if it's AI's turn
    const currentPlayerId = state.players[state.currentPlayerIndex];
    if (currentPlayerId === aiId) {
      return true;
    }

    // Check if AI can/should buy or pass
    if (state.gamePhase === 'draw' && state.buyRequests.length > 0) {
      // Don't pass on your own discard
      if (state.lastDiscarder === aiId) {
        return false;
      }

      // Check if AI should pass (hasn't already requested or passed)
      const shouldShowPass = !state.buyRequests.some(r => r.playerId === aiId) &&
        !state.passedBuy.includes(aiId);

      if (shouldShowPass) {
        return true;
      }
    }

    // Check if AI can buy (only during buy window)
    if (state.gamePhase === 'draw' && currentPlayerId !== aiId) {
      // Only consider buying if buy window is active
      if (!this.gameManager.isBuyWindowActive(this.aiPlayers.get(aiId)?.roomId || '')) {
        return false;
      }

      const playerState = state.playerStates[aiId];
      const maxBuys = this.getMaxBuys(state.currentRound);
      const canBuy = playerState &&
        playerState.buyCount < maxBuys &&
        !state.buyJustProcessed &&
        state.discardPile.length > 0 &&
        state.lastDiscarder !== aiId &&
        !state.buyRequests.some(r => r.playerId === aiId) &&
        !state.passedBuy.includes(aiId); // Don't trigger if already passed

      if (canBuy) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process an AI's action
   */
  private async processAIAction(ai: AIPlayer, state: GameState): Promise<void> {
    try {
      // Add thinking delay
      await this.sleep(AI_DECISION_DELAY);

      // Get fresh state
      const freshState = this.gameManager.getGameState(ai.roomId);
      if (!freshState) {
        this.processingTurn.delete(ai.id);
        return;
      }

      // Handle round summary
      if (freshState.gamePhase === 'roundSummary') {
        await this.handleRoundSummary(ai);
        return;
      }

      // Check if it's our turn
      const currentPlayerId = freshState.players[freshState.currentPlayerIndex];

      if (currentPlayerId === ai.id) {
        await this.handleAITurn(ai, freshState);
      } else {
        // Not our turn - handle buy/pass decisions
        await this.handleOffTurnActions(ai, freshState);
      }
    } catch (error) {
      console.error(`[AI] Error processing action for ${ai.name}:`, error);
    } finally {
      this.processingTurn.delete(ai.id);
    }
  }

  /**
   * Handle AI's turn
   */
  private async handleAITurn(ai: AIPlayer, state: GameState): Promise<void> {
    console.log(`[AI] ${ai.name} taking turn (phase: ${state.gamePhase})`);

    if (state.gamePhase === 'draw') {
      await this.handleDrawPhase(ai, state);
    } else if (state.gamePhase === 'meld') {
      await this.handleMeldPhase(ai, state);
    }
  }

  /**
   * Handle draw phase
   */
  private async handleDrawPhase(ai: AIPlayer, state: GameState): Promise<void> {
    // Log current state for debugging
    console.log(`[AI] ${ai.name} handleDrawPhase - buyRequests: ${state.buyRequests.length}, buyWindow: ${this.gameManager.isBuyWindowActive(ai.roomId)}`);

    // If buy window is still active, wait for it to expire
    if (this.gameManager.isBuyWindowActive(ai.roomId)) {
      console.log(`[AI] ${ai.name} waiting for buy window to expire`);
      return; // Wait, will retry later
    }

    // Make draw decision - AI can draw even with pending buy requests
    // (drawing from deck will process pending buys)
    const decision = ai.strategy.decideDrawPhase(state, ai.id);
    console.log(`[AI] ${ai.name} draw decision: ${decision.action}`);

    switch (decision.action) {
      case 'DRAW_CARD':
        const drawAction: DrawCardAction = {
          type: 'DRAW_CARD',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, drawAction);
        break;

      case 'TAKE_DISCARD':
        const takeAction: TakeDiscardAction = {
          type: 'TAKE_DISCARD',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, takeAction);
        break;

      case 'PASS_BUY':
        const passAction: PassBuyAction = {
          type: 'PASS_BUY',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, passAction);
        break;

      case 'WAIT':
        // Do nothing, will retry
        break;
    }
  }

  /**
   * Handle meld phase
   */
  private async handleMeldPhase(ai: AIPlayer, state: GameState): Promise<void> {
    const playerState = state.playerStates[ai.id];
    console.log(`[AI] ${ai.name} meld phase - hand: ${playerState.hand.length} cards: [${playerState.hand.map(c => `${c.rank}${c.suit}`).join(', ')}], melds: ${playerState.melds.length}`);

    // Try to create melds
    const meldDecision = ai.strategy.decideMeldPhase(state, ai.id);

    if (meldDecision.action === 'CREATE_MELD' && meldDecision.melds) {
      for (const meld of meldDecision.melds) {
        console.log(`[AI] ${ai.name} creating ${meld.type} with ${meld.cardIds.length} cards`);
        const action: CreateMeldAction = {
          type: 'CREATE_MELD',
          playerId: ai.id,
          meldType: meld.type,
          cardIds: meld.cardIds,
          wildcardPlacement: meld.wildcardPlacement
        };

        let result = this.executeAction(ai.roomId, action);

        // If multiple wildcard arrangements possible, pick the first one
        if (!result.success && result.sideEffects?.some(e => e.type === 'NEEDS_WILDCARD_POSITION')) {
          console.log(`[AI] ${ai.name} needs wildcard position, picking first arrangement`);
          const retryAction: CreateMeldAction = {
            ...action,
            wildcardPlacement: 0 // Pick first arrangement
          };
          result = this.executeAction(ai.roomId, retryAction);
        }

        if (result.success) {
          await this.sleep(300); // Brief pause between melds
        } else {
          console.log(`[AI] ${ai.name} meld failed: ${result.error}`);
        }
      }
    }

    // Get fresh state after melds
    const postMeldState = this.gameManager.getGameState(ai.roomId);
    if (!postMeldState) return;

    // Try layoffs if requirements are met
    const playerStateAfterMeld = postMeldState.playerStates[ai.id];
    console.log(`[AI] ${ai.name} after melds - hand: ${playerStateAfterMeld?.hand.length} cards, hasMetReqs: ${playerStateAfterMeld?.hasMetRequirements}`);

    if (playerStateAfterMeld?.hasMetRequirements) {
      const layoffDecision = ai.strategy.decideLayoffPhase(postMeldState, ai.id);

      if (layoffDecision.action === 'LAYOFF' && layoffDecision.layoffs) {
        console.log(`[AI] ${ai.name} attempting ${layoffDecision.layoffs.length} layoffs`);
        for (const layoff of layoffDecision.layoffs) {
          console.log(`[AI] ${ai.name} laying off card ${layoff.cardId} to ${layoff.meldOwnerId} meld ${layoff.meldIndex}`);
          const action: LayoffCardAction = {
            type: 'LAYOFF_CARD',
            playerId: ai.id,
            cardId: layoff.cardId,
            meldOwnerId: layoff.meldOwnerId,
            meldIndex: layoff.meldIndex,
            wildcardPosition: layoff.wildcardPosition
          };

          let result = this.executeAction(ai.roomId, action);

          // If wildcard position needed, retry with first valid position
          if (!result.success && result.sideEffects?.some(e => e.type === 'NEEDS_WILDCARD_POSITION')) {
            console.log(`[AI] ${ai.name} layoff needs wildcard position, picking first option`);
            const positionEffect = result.sideEffects?.find(e => e.type === 'NEEDS_WILDCARD_POSITION');
            const firstPosition = positionEffect?.arrangements?.[0]?.sequence as 'beginning' | 'end' | undefined;
            const retryAction: LayoffCardAction = {
              ...action,
              wildcardPosition: firstPosition || 'end'
            };
            result = this.executeAction(ai.roomId, retryAction);
          }

          if (result.success) {
            // Check updated hand size
            const updatedState = this.gameManager.getGameState(ai.roomId);
            const updatedHand = updatedState?.playerStates[ai.id]?.hand;
            console.log(`[AI] ${ai.name} layoff succeeded - hand now has ${updatedHand?.length} cards: [${updatedHand?.map(c => `${c.rank}${c.suit}`).join(', ')}]`);
            await this.sleep(300);

            // Check if we went out
            if (!updatedState || updatedHand?.length === 0) {
              console.log(`[AI] ${ai.name} went out!`);
              return; // Went out!
            }
          } else {
            console.log(`[AI] ${ai.name} layoff failed: ${result.error}`);
          }
        }
      }
    }

    // Discard
    const finalState = this.gameManager.getGameState(ai.roomId);
    if (!finalState || finalState.playerStates[ai.id]?.hand.length === 0) return;

    const discardDecision = ai.strategy.decideDiscard(finalState, ai.id);

    const handBeforeDiscard = finalState.playerStates[ai.id].hand;
    console.log(`[AI] ${ai.name} discarding card ${discardDecision.cardId}, hand before: ${handBeforeDiscard.length} cards: [${handBeforeDiscard.map(c => `${c.rank}${c.suit}`).join(', ')}]`);

    const discardAction: DiscardAction = {
      type: 'DISCARD',
      playerId: ai.id,
      cardId: discardDecision.cardId
    };

    const discardResult = this.executeAction(ai.roomId, discardAction);
    if (discardResult.success) {
      const afterDiscardState = this.gameManager.getGameState(ai.roomId);
      const handAfterDiscard = afterDiscardState?.playerStates[ai.id]?.hand;
      console.log(`[AI] ${ai.name} discard succeeded - hand now has ${handAfterDiscard?.length} cards`);
    } else {
      console.log(`[AI] ${ai.name} discard failed: ${discardResult.error}`);

      // If discard failed because requirements not met, cancel melds and retry
      if (discardResult.error?.includes('requirements') || discardResult.error?.includes('Meld')) {
        console.log(`[AI] ${ai.name} canceling melds due to incomplete requirements`);
        const cancelAction: CancelMeldsAction = {
          type: 'CANCEL_MELDS',
          playerId: ai.id
        };
        const cancelResult = this.executeAction(ai.roomId, cancelAction);

        if (cancelResult.success) {
          // Get fresh state and retry discard
          const refreshedState = this.gameManager.getGameState(ai.roomId);
          if (refreshedState && refreshedState.playerStates[ai.id]?.hand.length > 0) {
            const newDiscardDecision = ai.strategy.decideDiscard(refreshedState, ai.id);
            const retryDiscardAction: DiscardAction = {
              type: 'DISCARD',
              playerId: ai.id,
              cardId: newDiscardDecision.cardId
            };
            const retryResult = this.executeAction(ai.roomId, retryDiscardAction);
            if (retryResult.success) {
              console.log(`[AI] ${ai.name} discard succeeded after canceling melds`);
            } else {
              console.log(`[AI] ${ai.name} discard still failed after cancel: ${retryResult.error}`);
            }
          }
        }
      }
    }
  }

  /**
   * Handle off-turn actions (buying, passing)
   */
  private async handleOffTurnActions(ai: AIPlayer, state: GameState): Promise<void> {
    // Already passed this turn - nothing to do
    if (state.passedBuy.includes(ai.id)) {
      return;
    }

    // Already have a buy request - nothing to do
    if (state.buyRequests.some(r => r.playerId === ai.id)) {
      return;
    }

    // Check if we need to pass on existing buy requests
    if (state.buyRequests.length > 0) {
      const buyDecision = ai.strategy.decideBuy(state, ai.id);

      if (buyDecision.action === 'REQUEST_BUY') {
        console.log(`[AI] ${ai.name} requesting buy`);
        const action: RequestBuyAction = {
          type: 'REQUEST_BUY',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, action);
      } else {
        console.log(`[AI] ${ai.name} passing on buy`);
        const action: PassBuyAction = {
          type: 'PASS_BUY',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, action);
      }
      return;
    }

    // Check if we should request a buy (only during buy window)
    if (!this.gameManager.isBuyWindowActive(ai.roomId)) {
      return; // Buy window closed, no action needed
    }

    // Can't buy own discard
    if (state.lastDiscarder === ai.id) {
      return;
    }

    const playerState = state.playerStates[ai.id];
    const maxBuys = this.getMaxBuys(state.currentRound);

    if (playerState &&
        playerState.buyCount < maxBuys &&
        !state.buyJustProcessed &&
        state.discardPile.length > 0) {

      const buyDecision = ai.strategy.decideBuy(state, ai.id);

      if (buyDecision.action === 'REQUEST_BUY') {
        console.log(`[AI] ${ai.name} requesting buy`);
        const action: RequestBuyAction = {
          type: 'REQUEST_BUY',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, action);
      } else {
        // AI decided not to buy - pass to avoid being re-checked
        console.log(`[AI] ${ai.name} passing (doesn't want card)`);
        const action: PassBuyAction = {
          type: 'PASS_BUY',
          playerId: ai.id
        };
        this.executeAction(ai.roomId, action);
      }
    }
  }

  /**
   * Handle round summary
   */
  private async handleRoundSummary(ai: AIPlayer): Promise<void> {
    console.log(`[AI] ${ai.name} continuing to next round`);

    const action: ContinueToNextRoundAction = {
      type: 'CONTINUE_TO_NEXT_ROUND',
      playerId: ai.id
    };

    this.executeAction(ai.roomId, action);
  }

  /**
   * Execute an action and broadcast state
   */
  private executeAction(roomId: string, action: GameAction): { success: boolean; error?: string; sideEffects?: any[] } {
    // Capture buy requests before processing (they get cleared during buy resolution)
    const preState = this.gameManager.getGameState(roomId);
    const preBuyRequests = preState?.buyRequests?.map(r => r.playerId) || [];

    const result = this.gameManager.processAction(roomId, action);

    if (result.success) {
      // Notify human players about AI buy results
      if (result.sideEffects) {
        for (const effect of result.sideEffects) {
          if (effect.type === 'BUY_PROCESSED') {
            this.notifyBuyResult(roomId, effect.buyerId, effect.cardId, preBuyRequests);
          }
        }
      }
      this.broadcastGameState(roomId);
    } else {
      console.log(`[AI] Action failed: ${result.error}`);
    }

    return { success: result.success, error: result.error, sideEffects: result.sideEffects };
  }

  /**
   * Notify human players about a buy result from an AI action
   */
  private notifyBuyResult(roomId: string, buyerId: string, cardId: string, preBuyRequestPlayerIds: string[]): void {
    const state = this.gameManager.getGameState(roomId);
    if (!state) return;

    const buyerName = state.playerNames[buyerId] || 'Unknown';
    const playerState = state.playerStates[buyerId];
    const boughtCard = playerState?.hand.find(c => c.id === cardId);
    const cardDisplay = boughtCard ? `${boughtCard.rank}${boughtCard.suit}` : 'card';

    state.players.forEach(playerId => {
      if (this.isAI(playerId)) return;
      if (playerId === buyerId) return;

      const socket = this.io.sockets.sockets.get(playerId);
      if (!socket) return;

      const hadRequest = preBuyRequestPlayerIds.includes(playerId);
      if (hadRequest) {
        socket.emit('buyNotification', {
          type: 'denied',
          message: `\u2717 ${buyerName} won the buy (higher priority)`
        });
      } else {
        socket.emit('buyNotification', {
          type: 'info',
          message: `${buyerName} bought ${cardDisplay}`
        });
      }
    });
  }

  /**
   * Broadcast game state to all players
   */
  private broadcastGameState(roomId: string): void {
    const state = this.gameManager.getGameState(roomId);
    if (!state) return;

    state.players.forEach(playerId => {
      // Skip AI players - they don't need socket updates
      if (this.isAI(playerId)) return;

      const socket = this.io.sockets.sockets.get(playerId);
      if (socket) {
        const clientState = this.gameManager.getClientGameState(roomId, playerId);
        if (clientState) {
          socket.emit('gameState', clientState);
        }
      }
    });

    // Persist tournament game state after every AI action broadcast
    if (this.tournamentManager) {
      this.tournamentManager.saveIfTournamentGame(roomId);
    }
  }

  /**
   * Get max buys for a round
   */
  private getMaxBuys(round: number): number {
    const maxBuys = [3, 3, 3, 3, 3, 3, 3, 3, 3, 4];
    return maxBuys[round] || 3;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
