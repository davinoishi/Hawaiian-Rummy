/**
 * Hawaiian Rummy - Game State Management
 * Main orchestrator for game state transitions
 */

import {
  GameState,
  GameAction,
  ActionResult,
  PlayerState,
  Card,
  ActionSideEffect
} from './types';
import { createDeck, drawCards } from './deck';
import { INITIAL_HAND_SIZE, ROUND_REQUIREMENTS, TOTAL_ROUNDS } from './constants';
import { calculateHandPoints } from './card-utils';

// Import action processors
import { processDrawCard, processTakeDiscard } from './actions/draw-action';
import { processCreateMeld, processCancelMelds } from './actions/meld-action';
import { processLayoffCard } from './actions/layoff-action';
import { processDiscard, processReorderHand } from './actions/discard-action';
import { processRequestBuy, processCancelBuy, processPassBuy } from './actions/buy-action';

/**
 * Create initial game state for a new game
 */
export function createInitialGameState(): GameState {
  return {
    players: [],
    playerNames: {},
    playerStates: {},
    disconnectedPlayerIds: [],
    gameStarted: false,
    gamePhase: 'lobby',
    currentPlayerIndex: 0,
    currentRound: 0,
    deck: [],
    discardPile: [],
    buyRequests: [],
    passedBuy: [],
    buyJustProcessed: false,
    lastDiscarder: null,
    lastDiscardTimestamp: null,
    continueClicked: [],
    tutorialMode: false
  };
}

/**
 * Create initial player state
 */
export function createInitialPlayerState(): PlayerState {
  return {
    hand: [],
    melds: [],
    score: 0,
    roundScores: [],
    roundsWon: 0,
    buyCount: 0,
    hasMetRequirements: false
  };
}

/**
 * Add a player to the game
 */
export function addPlayer(state: GameState, playerId: string, playerName: string): GameState {
  if (state.gameStarted) {
    return state;
  }

  if (state.players.includes(playerId)) {
    return state;
  }

  return {
    ...state,
    players: [...state.players, playerId],
    playerNames: {
      ...state.playerNames,
      [playerId]: playerName
    },
    playerStates: {
      ...state.playerStates,
      [playerId]: createInitialPlayerState()
    }
  };
}

/**
 * Remove a player from the game
 */
export function removePlayer(state: GameState, playerId: string): GameState {
  const newPlayers = state.players.filter(id => id !== playerId);
  const { [playerId]: _, ...newPlayerNames } = state.playerNames;
  const { [playerId]: __, ...newPlayerStates } = state.playerStates;

  return {
    ...state,
    players: newPlayers,
    playerNames: newPlayerNames,
    playerStates: newPlayerStates
  };
}

/**
 * Set the player order (after randomization)
 */
export function setPlayerOrder(state: GameState, playerIds: string[]): GameState {
  return {
    ...state,
    players: playerIds,
    currentPlayerIndex: 0
  };
}

/**
 * Start the game
 */
export function startGame(state: GameState): GameState {
  if (state.gameStarted) {
    return state;
  }

  let newState: GameState = {
    ...state,
    gameStarted: true,
    currentRound: 0,
    currentPlayerIndex: 0
  };

  // Initialize scores for all players
  const newPlayerStates: Record<string, PlayerState> = {};
  for (const playerId of newState.players) {
    newPlayerStates[playerId] = {
      ...newState.playerStates[playerId],
      score: 0,
      roundsWon: 0,
      roundScores: []
    };
  }

  newState = {
    ...newState,
    playerStates: newPlayerStates
  };

  // Start the first round
  return startNewRound(newState);
}

/**
 * Start a new round
 */
export function startNewRound(state: GameState): GameState {
  const deck = createDeck();
  let remainingDeck = deck;

  // Deal cards to each player
  const newPlayerStates: Record<string, PlayerState> = {};

  for (const playerId of state.players) {
    const [hand, deckAfterDeal] = drawCards(remainingDeck, INITIAL_HAND_SIZE);
    remainingDeck = deckAfterDeal;

    newPlayerStates[playerId] = {
      ...state.playerStates[playerId],
      hand,
      melds: [],
      hasMetRequirements: false,
      buyCount: 0
    };
  }

  // First discard
  const [firstDiscard, deckAfterDiscard] = drawCards(remainingDeck, 1);

  return {
    ...state,
    deck: deckAfterDiscard,
    discardPile: firstDiscard,
    playerStates: newPlayerStates,
    gamePhase: 'draw',
    buyRequests: [],
    passedBuy: [],
    buyJustProcessed: false,
    lastDiscarder: null,
    lastDiscardTimestamp: Date.now(), // Set timestamp so buy window is active for initial discard
    continueClicked: []
  };
}

/**
 * End the current round and calculate scores
 */
export function endRound(state: GameState, winnerId: string | null): GameState {
  // Calculate scores for this round
  const newPlayerStates: Record<string, PlayerState> = {};

  for (const playerId of state.players) {
    const playerState = state.playerStates[playerId];
    const handPoints = calculateHandPoints(playerState.hand);

    newPlayerStates[playerId] = {
      ...playerState,
      score: playerState.score + handPoints,
      roundScores: [...playerState.roundScores, handPoints],
      roundsWon: playerId === winnerId ? playerState.roundsWon + 1 : playerState.roundsWon
    };
  }

  const isGameOver = state.currentRound >= TOTAL_ROUNDS - 1;

  return {
    ...state,
    playerStates: newPlayerStates,
    gamePhase: isGameOver ? 'gameOver' : 'roundSummary',
    continueClicked: []
  };
}

/**
 * Process a continue to next round action
 */
export function processContinueToNextRound(state: GameState, playerId: string): ActionResult {
  if (state.gamePhase !== 'roundSummary') {
    return { success: false, error: 'Not in round summary phase', newState: state };
  }

  // Add player to continue list
  const newContinueClicked = state.continueClicked.includes(playerId)
    ? state.continueClicked
    : [...state.continueClicked, playerId];

  let newState: GameState = {
    ...state,
    continueClicked: newContinueClicked
  };

  // Check if all players have clicked continue
  if (newContinueClicked.length === state.players.length) {
    // Start next round
    newState = {
      ...newState,
      currentRound: newState.currentRound + 1
    };
    newState = startNewRound(newState);
  }

  return { success: true, newState };
}

/**
 * Validate an action before processing
 */
export function validateAction(state: GameState, action: GameAction): { valid: boolean; error?: string } {
  switch (action.type) {
    case 'DRAW_CARD':
      return { valid: true }; // Full validation in processor

    case 'TAKE_DISCARD':
      return { valid: true }; // Full validation in processor

    case 'CREATE_MELD':
      return { valid: true }; // Full validation in processor

    case 'CANCEL_MELDS':
      return { valid: true }; // Full validation in processor

    case 'LAYOFF_CARD':
      return { valid: true }; // Full validation in processor

    case 'DISCARD':
      return { valid: true }; // Full validation in processor

    case 'REQUEST_BUY':
      return { valid: true }; // Full validation in processor

    case 'CANCEL_BUY':
      return { valid: true }; // Full validation in processor

    case 'PASS_BUY':
      return { valid: true }; // Full validation in processor

    case 'CONTINUE_TO_NEXT_ROUND':
      return { valid: true }; // Full validation in processor

    case 'REORDER_HAND':
      return { valid: true }; // Full validation in processor

    default:
      return { valid: false, error: 'Unknown action type' };
  }
}

/**
 * Process a game action and return the new state
 */
export function processAction(state: GameState, action: GameAction): ActionResult {
  // First validate
  const validation = validateAction(state, action);
  if (!validation.valid) {
    return { success: false, error: validation.error, newState: state };
  }

  // Process based on action type
  let result: ActionResult;

  switch (action.type) {
    case 'DRAW_CARD':
      result = processDrawCard(state, action);
      break;

    case 'TAKE_DISCARD':
      result = processTakeDiscard(state, action);
      break;

    case 'CREATE_MELD':
      result = processCreateMeld(state, action);
      break;

    case 'CANCEL_MELDS':
      result = processCancelMelds(state, action);
      break;

    case 'LAYOFF_CARD':
      result = processLayoffCard(state, action);
      break;

    case 'DISCARD':
      result = processDiscard(state, action);
      break;

    case 'REQUEST_BUY':
      result = processRequestBuy(state, action);
      break;

    case 'CANCEL_BUY':
      result = processCancelBuy(state, action);
      break;

    case 'PASS_BUY':
      result = processPassBuy(state, action);
      break;

    case 'CONTINUE_TO_NEXT_ROUND':
      result = processContinueToNextRound(state, action.playerId);
      break;

    case 'REORDER_HAND':
      result = processReorderHand(state, action.playerId, action.cardIds);
      break;

    default:
      result = { success: false, error: 'Unknown action type', newState: state };
  }

  // Handle side effects
  if (result.success && result.sideEffects) {
    for (const effect of result.sideEffects) {
      if (effect.type === 'ROUND_ENDED') {
        result.newState = endRound(result.newState, effect.winnerId);
      }
    }
  }

  return result;
}

/**
 * Check if a player can perform any action
 */
export function getAvailableActions(state: GameState, playerId: string): string[] {
  const actions: string[] = [];
  const isCurrentPlayer = state.players[state.currentPlayerIndex] === playerId;
  const playerState = state.playerStates[playerId];

  if (state.gamePhase === 'draw') {
    if (isCurrentPlayer) {
      if (!state.buyJustProcessed && state.discardPile.length > 0) {
        actions.push('TAKE_DISCARD');
      }
      if (state.buyRequests.length === 0) {
        actions.push('DRAW_CARD');
      }
    } else {
      // Non-current player can buy
      if (playerState.buyCount < ROUND_REQUIREMENTS[state.currentRound].maxBuys) {
        actions.push('REQUEST_BUY');
      }
    }
  }

  if (state.gamePhase === 'meld' && isCurrentPlayer) {
    actions.push('CREATE_MELD', 'DISCARD');

    if (playerState.melds.length > 0) {
      actions.push('CANCEL_MELDS');
    }

    if (playerState.hasMetRequirements && playerState.hand.length > 0) {
      actions.push('LAYOFF_CARD');
    }
  }

  if (state.gamePhase === 'roundSummary') {
    if (!state.continueClicked.includes(playerId)) {
      actions.push('CONTINUE_TO_NEXT_ROUND');
    }
  }

  // Can always reorder hand
  actions.push('REORDER_HAND');

  // Can cancel buy if has a request
  if (state.buyRequests.some(r => r.playerId === playerId)) {
    actions.push('CANCEL_BUY');
  }

  // Can pass buy
  if (state.buyRequests.length > 0 && !state.passedBuy.includes(playerId)) {
    actions.push('PASS_BUY');
  }

  return actions;
}

/**
 * Get the current player ID
 */
export function getCurrentPlayerId(state: GameState): string | undefined {
  return state.players[state.currentPlayerIndex];
}

/**
 * Get the winner of the game (lowest score)
 */
export function getGameWinner(state: GameState): string | null {
  if (state.gamePhase !== 'gameOver') {
    return null;
  }

  let lowestScore = Infinity;
  let winnerId: string | null = null;

  for (const playerId of state.players) {
    const score = state.playerStates[playerId].score;
    if (score < lowestScore) {
      lowestScore = score;
      winnerId = playerId;
    }
  }

  return winnerId;
}
