/**
 * Local Game Runner - Enables offline play against AI
 *
 * This service runs the game engine locally in the browser,
 * enabling single-player games against AI without network connection.
 */

import {
  GameState,
  GameAction,
  ClientGameState,
  ClientPlayer,
  Card,
  Meld,
  ActionResult,
  DrawCardAction,
  TakeDiscardAction,
  CreateMeldAction,
  CancelMeldsAction,
  DiscardAction,
  LayoffCardAction,
  RequestBuyAction,
  PassBuyAction,
  ContinueToNextRoundAction,
  ReorderHandAction
} from '@shared/game-engine/types';
import {
  createInitialGameState,
  addPlayer,
  startGame,
  setPlayerOrder,
  processAction
} from '@shared/game-engine/game-state';
import { ROUND_REQUIREMENTS, AI_DECISION_DELAY, BUY_WINDOW_DURATION } from '@shared/game-engine/constants';
import { StandardAIStrategy, AIStrategy } from '@shared/ai';

// AI player names
const AI_NAMES = ['Bot Alice', 'Bot Bob', 'Bot Carol', 'Bot David'];

/**
 * Local game runner state
 */
interface LocalGameRunner {
  gameState: GameState;
  playerId: string;
  aiPlayers: Map<string, { name: string; strategy: AIStrategy }>;
  buyWindowTimeout: ReturnType<typeof setTimeout> | null;
  buyWindowActive: boolean;
  onStateChange: (state: ClientGameState) => void;
}

let runner: LocalGameRunner | null = null;
let aiProcessorId: ReturnType<typeof setInterval> | null = null;

/**
 * Generate a unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Initialize a new local game
 */
export function initLocalGame(
  playerName: string,
  numAI: number,
  onStateChange: (state: ClientGameState) => void
): { roomId: string; playerId: string } {
  // Clean up any existing game
  cleanupLocalGame();

  const playerId = `player-${generateId()}`;
  const roomId = `local-${generateId()}`;

  // Create initial state
  let gameState = createInitialGameState();
  gameState = addPlayer(gameState, playerId, playerName);

  // Add AI players
  const aiPlayers = new Map<string, { name: string; strategy: AIStrategy }>();
  for (let i = 0; i < numAI && i < AI_NAMES.length; i++) {
    const aiId = `ai-${generateId()}`;
    const aiName = AI_NAMES[i];
    gameState = addPlayer(gameState, aiId, aiName);
    aiPlayers.set(aiId, { name: aiName, strategy: new StandardAIStrategy() });
  }

  runner = {
    gameState,
    playerId,
    aiPlayers,
    buyWindowTimeout: null,
    buyWindowActive: false,
    onStateChange
  };

  // Start AI processor
  startAIProcessor();

  // Return room info
  return { roomId, playerId };
}

/**
 * Start the game with randomized player order
 */
export function startLocalGame(): void {
  if (!runner) return;

  // Randomize player order
  const shuffledPlayers = [...runner.gameState.players].sort(() => Math.random() - 0.5);
  runner.gameState = setPlayerOrder(runner.gameState, shuffledPlayers);

  // Start the game
  runner.gameState = startGame(runner.gameState);

  // Set initial buy window
  setBuyWindow();

  // Notify state change
  broadcastState();
}

/**
 * Process a player action
 */
export function processLocalAction(action: GameAction): ActionResult {
  if (!runner) {
    return { success: false, error: 'No local game running', newState: null as any };
  }

  // Process the action
  const result = processAction(runner.gameState, action);

  if (result.success) {
    runner.gameState = result.newState;

    // Handle discard - start buy window
    if (action.type === 'DISCARD') {
      runner.gameState = {
        ...runner.gameState,
        lastDiscarder: action.playerId,
        lastDiscardTimestamp: Date.now()
      };
      setBuyWindow();
    }

    // Handle draw from deck - clear buy state
    if (action.type === 'DRAW_CARD') {
      clearBuyWindow();
    }

    // Handle take discard - clear buy state
    if (action.type === 'TAKE_DISCARD') {
      clearBuyWindow();
    }

    broadcastState();
  }

  return result;
}

/**
 * Create client-visible state (hiding other players' hands)
 */
function createClientState(state: GameState, playerId: string): ClientGameState {
  const playerState = state.playerStates[playerId];
  const currentPlayerId = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayerId === playerId;
  const roundReq = ROUND_REQUIREMENTS[state.currentRound];

  // Build player list with visibility rules
  const players: ClientPlayer[] = state.players.map((id, index) => {
    const ps = state.playerStates[id];
    const isMe = id === playerId;
    const isAI = runner?.aiPlayers.has(id) ?? false;

    return {
      id,
      name: state.playerNames[id] || 'Unknown',
      handSize: ps?.hand.length ?? 0,
      melds: ps?.melds ?? [],
      score: ps?.score ?? 0,
      roundScores: ps?.roundScores ?? [],
      roundsWon: ps?.roundsWon ?? 0,
      wins: ps?.roundsWon ?? 0, // Alias for backwards compatibility
      buyCount: ps?.buyCount ?? 0,
      hasMetRequirements: ps?.hasMetRequirements ?? false,
      isMe,
      isAI
    };
  });

  // Calculate buy window state
  const buyWindowActive = runner?.buyWindowActive ?? false;
  let buyWindowRemaining = 0;
  if (buyWindowActive && state.lastDiscardTimestamp) {
    const elapsed = Date.now() - state.lastDiscardTimestamp;
    // Convert to seconds (UI expects seconds, not milliseconds)
    buyWindowRemaining = Math.max(0, (BUY_WINDOW_DURATION - elapsed) / 1000);
  }

  // Find winner
  let winner: { id: string; name: string; score: number } | null = null;
  let isWinner = false;
  if (state.gamePhase === 'roundSummary' || state.gamePhase === 'gameOver') {
    // Round winner is whoever went out (has 0 cards)
    for (const id of state.players) {
      if (state.playerStates[id]?.hand.length === 0) {
        winner = {
          id,
          name: state.playerNames[id] || 'Unknown',
          score: state.playerStates[id]?.score ?? 0
        };
        isWinner = id === playerId;
        break;
      }
    }
  }

  return {
    players,
    myHand: playerState?.hand ?? [],
    myMelds: playerState?.melds ?? [],
    discardPile: state.discardPile,
    deckSize: state.deck.length,
    currentPlayerIndex: state.currentPlayerIndex,
    currentRound: state.currentRound,
    gamePhase: state.gamePhase,
    isMyTurn,
    hasMetRequirements: playerState?.hasMetRequirements ?? false,
    buyRequests: state.buyRequests,
    myBuyCount: playerState?.buyCount ?? 0,
    maxBuys: roundReq.maxBuys,
    canBuy: !isMyTurn &&
            (playerState?.buyCount ?? 0) < roundReq.maxBuys &&
            state.discardPile.length > 0 &&
            state.lastDiscarder !== playerId &&
            !state.buyJustProcessed &&
            buyWindowActive,
    canDraw: isMyTurn &&
             state.gamePhase === 'draw',
    canTakeDiscard: isMyTurn &&
                    state.gamePhase === 'draw' &&
                    !state.buyJustProcessed &&
                    state.discardPile.length > 0 &&
                    state.buyRequests.length === 0 &&
                    !buyWindowActive,
    shouldShowPass: state.buyRequests.length > 0 &&
                    !state.passedBuy.includes(playerId) &&
                    !state.buyRequests.some(r => r.playerId === playerId),
    hasBuyRequest: state.buyRequests.some(r => r.playerId === playerId),
    hasPassed: state.passedBuy.includes(playerId),
    nextPlayerToBuy: state.buyRequests[0]?.playerId
      ? state.playerNames[state.buyRequests[0].playerId]
      : null,
    winner,
    isWinner,
    continueClicked: state.continueClicked,
    hasContinued: state.continueClicked.includes(playerId),
    buyWindowActive,
    buyWindowRemaining,
    buyJustProcessed: state.buyJustProcessed,
    tutorialMode: state.tutorialMode,
    tutorialStep: 0
  };
}

/**
 * Broadcast state to client
 */
function broadcastState(): void {
  if (!runner) return;

  const clientState = createClientState(runner.gameState, runner.playerId);
  runner.onStateChange(clientState);
}

/**
 * Set buy window timer
 */
function setBuyWindow(): void {
  if (!runner) return;

  clearBuyWindow();

  runner.buyWindowActive = true;
  runner.buyWindowTimeout = setTimeout(() => {
    if (runner) {
      runner.buyWindowActive = false;
      broadcastState();
    }
  }, BUY_WINDOW_DURATION);

  broadcastState();
}

/**
 * Clear buy window
 */
function clearBuyWindow(): void {
  if (!runner) return;

  if (runner.buyWindowTimeout) {
    clearTimeout(runner.buyWindowTimeout);
    runner.buyWindowTimeout = null;
  }
  runner.buyWindowActive = false;
}

/**
 * Start AI processor (runs periodically)
 */
function startAIProcessor(): void {
  if (aiProcessorId) {
    clearInterval(aiProcessorId);
  }

  aiProcessorId = setInterval(() => {
    processAITurns();
  }, 500);
}

/**
 * Process AI turns
 */
async function processAITurns(): Promise<void> {
  if (!runner || !runner.gameState.gameStarted) return;

  const state = runner.gameState;

  for (const [aiId, ai] of runner.aiPlayers) {
    if (needsAction(state, aiId)) {
      // Add delay to make it feel natural
      await sleep(AI_DECISION_DELAY);

      // Get fresh state after delay
      if (!runner) return;
      const freshState = runner.gameState;

      await processAIAction(aiId, ai, freshState);
    }
  }
}

/**
 * Check if AI needs to take action
 */
function needsAction(state: GameState, aiId: string): boolean {
  // Round summary - check if AI needs to continue
  if (state.gamePhase === 'roundSummary') {
    return !state.continueClicked.includes(aiId);
  }

  // Current player's turn
  const currentPlayerId = state.players[state.currentPlayerIndex];
  if (currentPlayerId === aiId) {
    return true;
  }

  // Buy/pass decisions
  if (state.gamePhase === 'draw' && state.buyRequests.length > 0) {
    if (state.lastDiscarder === aiId) return false;
    const shouldPass = !state.buyRequests.some(r => r.playerId === aiId) &&
                       !state.passedBuy.includes(aiId);
    return shouldPass;
  }

  // Buy window active - can request buy
  if (state.gamePhase === 'draw' &&
      currentPlayerId !== aiId &&
      runner?.buyWindowActive) {
    const playerState = state.playerStates[aiId];
    const roundReq = ROUND_REQUIREMENTS[state.currentRound];
    const canBuy = playerState &&
                   playerState.buyCount < roundReq.maxBuys &&
                   !state.buyJustProcessed &&
                   state.discardPile.length > 0 &&
                   state.lastDiscarder !== aiId &&
                   !state.buyRequests.some(r => r.playerId === aiId) &&
                   !state.passedBuy.includes(aiId);
    return canBuy;
  }

  return false;
}

/**
 * Process a single AI action
 */
async function processAIAction(
  aiId: string,
  ai: { name: string; strategy: AIStrategy },
  state: GameState
): Promise<void> {
  if (!runner) return;

  const currentPlayerId = state.players[state.currentPlayerIndex];

  // Handle round summary
  if (state.gamePhase === 'roundSummary') {
    const action: ContinueToNextRoundAction = {
      type: 'CONTINUE_TO_NEXT_ROUND',
      playerId: aiId
    };
    processLocalAction(action);
    return;
  }

  // Current player's turn
  if (currentPlayerId === aiId) {
    if (state.gamePhase === 'draw') {
      await handleAIDrawPhase(aiId, ai, state);
    } else if (state.gamePhase === 'meld') {
      await handleAIMeldPhase(aiId, ai, state);
    }
    return;
  }

  // Off-turn: buy/pass decisions
  await handleAIOffTurn(aiId, ai, state);
}

/**
 * Handle AI draw phase
 */
async function handleAIDrawPhase(
  aiId: string,
  ai: { name: string; strategy: AIStrategy },
  state: GameState
): Promise<void> {
  // Wait for buy window to expire
  if (runner?.buyWindowActive && state.buyRequests.length === 0) {
    return; // Wait for window
  }

  const decision = ai.strategy.decideDrawPhase(state, aiId);

  switch (decision.action) {
    case 'DRAW_CARD':
      processLocalAction({ type: 'DRAW_CARD', playerId: aiId });
      break;
    case 'TAKE_DISCARD':
      processLocalAction({ type: 'TAKE_DISCARD', playerId: aiId });
      break;
    case 'PASS_BUY':
      processLocalAction({ type: 'PASS_BUY', playerId: aiId });
      break;
  }
}

/**
 * Handle AI meld phase
 */
async function handleAIMeldPhase(
  aiId: string,
  ai: { name: string; strategy: AIStrategy },
  state: GameState
): Promise<void> {
  // Try to create melds
  const meldDecision = ai.strategy.decideMeldPhase(state, aiId);

  if (meldDecision.action === 'CREATE_MELD' && meldDecision.melds) {
    for (const meld of meldDecision.melds) {
      const action: CreateMeldAction = {
        type: 'CREATE_MELD',
        playerId: aiId,
        meldType: meld.type,
        cardIds: meld.cardIds,
        wildcardPlacement: meld.wildcardPlacement
      };

      let result = processLocalAction(action);

      // Handle wildcard position if needed
      if (!result.success && result.sideEffects?.some(e => e.type === 'NEEDS_WILDCARD_POSITION')) {
        const retryAction: CreateMeldAction = {
          ...action,
          wildcardPlacement: 0
        };
        result = processLocalAction(retryAction);
      }

      if (result.success) {
        await sleep(300);
      }
    }
  }

  // Get fresh state after melds
  if (!runner) return;
  const postMeldState = runner.gameState;
  const playerState = postMeldState.playerStates[aiId];

  // Try layoffs if requirements met
  if (playerState?.hasMetRequirements) {
    const layoffDecision = ai.strategy.decideLayoffPhase(postMeldState, aiId);

    if (layoffDecision.action === 'LAYOFF' && layoffDecision.layoffs) {
      for (const layoff of layoffDecision.layoffs) {
        const action: LayoffCardAction = {
          type: 'LAYOFF_CARD',
          playerId: aiId,
          cardId: layoff.cardId,
          meldOwnerId: layoff.meldOwnerId,
          meldIndex: layoff.meldIndex,
          wildcardPosition: layoff.wildcardPosition
        };

        const result = processLocalAction(action);

        if (result.success) {
          await sleep(300);

          // Check if went out
          if (!runner) return;
          const updatedHand = runner.gameState.playerStates[aiId]?.hand;
          if (!updatedHand || updatedHand.length === 0) {
            return;
          }
        }
      }
    }
  }

  // Discard
  if (!runner) return;
  const finalState = runner.gameState;
  if (finalState.playerStates[aiId]?.hand.length === 0) return;

  const discardDecision = ai.strategy.decideDiscard(finalState, aiId);

  const discardAction: DiscardAction = {
    type: 'DISCARD',
    playerId: aiId,
    cardId: discardDecision.cardId
  };

  const discardResult = processLocalAction(discardAction);

  // If discard failed, cancel melds and retry
  if (!discardResult.success && discardResult.error?.includes('requirements')) {
    processLocalAction({ type: 'CANCEL_MELDS', playerId: aiId });

    if (!runner) return;
    const refreshedState = runner.gameState;
    if (refreshedState.playerStates[aiId]?.hand.length > 0) {
      const newDecision = ai.strategy.decideDiscard(refreshedState, aiId);
      processLocalAction({
        type: 'DISCARD',
        playerId: aiId,
        cardId: newDecision.cardId
      });
    }
  }
}

/**
 * Handle AI off-turn actions
 */
async function handleAIOffTurn(
  aiId: string,
  ai: { name: string; strategy: AIStrategy },
  state: GameState
): Promise<void> {
  if (state.passedBuy.includes(aiId)) return;
  if (state.buyRequests.some(r => r.playerId === aiId)) return;

  // Check if we need to pass on existing buy requests
  if (state.buyRequests.length > 0) {
    const buyDecision = ai.strategy.decideBuy(state, aiId);

    if (buyDecision.action === 'REQUEST_BUY') {
      processLocalAction({ type: 'REQUEST_BUY', playerId: aiId });
    } else {
      processLocalAction({ type: 'PASS_BUY', playerId: aiId });
    }
    return;
  }

  // Check if should request buy
  if (!runner?.buyWindowActive) return;
  if (state.lastDiscarder === aiId) return;

  const playerState = state.playerStates[aiId];
  const roundReq = ROUND_REQUIREMENTS[state.currentRound];

  if (playerState &&
      playerState.buyCount < roundReq.maxBuys &&
      !state.buyJustProcessed &&
      state.discardPile.length > 0) {

    const buyDecision = ai.strategy.decideBuy(state, aiId);

    if (buyDecision.action === 'REQUEST_BUY') {
      processLocalAction({ type: 'REQUEST_BUY', playerId: aiId });
    } else {
      processLocalAction({ type: 'PASS_BUY', playerId: aiId });
    }
  }
}

/**
 * Clean up local game resources
 */
export function cleanupLocalGame(): void {
  if (aiProcessorId) {
    clearInterval(aiProcessorId);
    aiProcessorId = null;
  }

  if (runner?.buyWindowTimeout) {
    clearTimeout(runner.buyWindowTimeout);
  }

  runner = null;
}

/**
 * Check if local game is running
 */
export function isLocalGameRunning(): boolean {
  return runner !== null;
}

/**
 * Get current player ID
 */
export function getLocalPlayerId(): string | null {
  return runner?.playerId ?? null;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
