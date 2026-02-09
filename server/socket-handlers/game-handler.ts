/**
 * Hawaiian Rummy - Game Socket Handlers
 * Handles game start, turn order, and state broadcasting
 */

import { Server, Socket } from 'socket.io';
import { GameManager } from '../game-manager';
import { AI_NAMES } from '../../shared/game-engine/constants';
import type { Card, Rank, Suit } from '../../shared/game-engine/types';

export interface GameHandlerDeps {
  io: Server;
  gameManager: GameManager;
  getSocketData: () => { roomId?: string; playerName?: string; playerId: string };
  logAnalytics: (event: string, data?: any) => void;
  spawnAIPlayers?: (roomId: string, maxAI?: number) => void;
}

/**
 * Sleep helper
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Broadcast game state to all players in a room
 */
export function broadcastGameState(
  io: Server,
  gameManager: GameManager,
  roomId: string
) {
  console.log('[SERVER] broadcastGameState called for room:', roomId);
  const state = gameManager.getGameState(roomId);
  if (!state) {
    console.log('[SERVER] No game state found for room:', roomId);
    return;
  }

  const currentPlayerId = state.players[state.currentPlayerIndex];
  console.log('[SERVER] Broadcasting to players:', state.players, 'currentPlayer:', currentPlayerId, 'phase:', state.gamePhase);

  state.players.forEach(playerId => {
    const socket = io.sockets.sockets.get(playerId);
    console.log('[SERVER] Player', playerId, 'socket:', socket ? 'found' : 'NOT FOUND');
    if (socket) {
      const clientState = gameManager.getClientGameState(roomId, playerId);
      if (clientState) {
        console.log('[SERVER] Emitting gameState to', playerId, '- isMyTurn:', clientState.isMyTurn, 'phase:', clientState.gamePhase, 'buyWindowActive:', clientState.buyWindowActive);
        socket.emit('gameState', clientState);
      }
    }
  });
}

/**
 * Determine turn order by random selection
 */
async function determineTurnOrder(
  io: Server,
  gameManager: GameManager,
  roomId: string
) {
  const state = gameManager.getGameState(roomId);
  if (!state) return;

  console.log(`[Room ${roomId}] Starting turn order determination...`);

  // Start with all players in a pool
  const remainingPlayers = [...state.players];
  const selectedOrder: string[] = [];

  // Send initial state - all positions empty
  io.to(roomId).emit('turnOrderUpdate', {
    phase: 'selecting',
    position: 0,
    selectedOrder: [],
    remainingPlayers: remainingPlayers.map(id => ({
      playerId: id,
      name: state.playerNames[id] || 'Unknown'
    }))
  });

  await sleep(1500);

  // Select players one by one for positions 1-4
  for (let position = 1; position <= remainingPlayers.length + selectedOrder.length; position++) {
    if (remainingPlayers.length === 0) break;

    // Randomly select from remaining players
    const randomIndex = Math.floor(Math.random() * remainingPlayers.length);
    const selectedPlayerId = remainingPlayers[randomIndex];
    const selectedName = state.playerNames[selectedPlayerId] || 'Unknown';

    // Remove from remaining and add to selected
    remainingPlayers.splice(randomIndex, 1);
    selectedOrder.push(selectedPlayerId);

    console.log(`[Room ${roomId}] Position ${position}: ${selectedName}`);

    // Send update showing this selection
    io.to(roomId).emit('turnOrderUpdate', {
      phase: 'selecting',
      position: position,
      justSelected: selectedPlayerId,
      selectedOrder: selectedOrder.map((id, idx) => ({
        playerId: id,
        name: state.playerNames[id] || 'Unknown',
        position: idx + 1
      })),
      remainingPlayers: remainingPlayers.map(id => ({
        playerId: id,
        name: state.playerNames[id] || 'Unknown'
      }))
    });

    // Wait between selections
    await sleep(position < 4 ? 1500 : 1000);
  }

  // Update game state with new order
  gameManager.setPlayerOrder(roomId, selectedOrder);

  // Send final result
  io.to(roomId).emit('turnOrderUpdate', {
    phase: 'final',
    selectedOrder: selectedOrder.map((id, idx) => ({
      playerId: id,
      name: state.playerNames[id] || 'Unknown',
      position: idx + 1
    }))
  });

  console.log(`[Room ${roomId}] Turn order determined:`, selectedOrder.map(id =>
    state.playerNames[id] || 'Unknown'
  ));

  // Wait to show final results
  await sleep(3000);

  // Countdown and start game
  for (let i = 3; i > 0; i--) {
    console.log('[SERVER] Emitting turnOrderCountdown:', i);
    io.to(roomId).emit('turnOrderCountdown', i);
    await sleep(1000);
  }

  // Start the actual game
  console.log('[SERVER] Starting game for room:', roomId);
  gameManager.startGame(roomId);
  console.log('[SERVER] Game started, broadcasting state');
  broadcastGameState(io, gameManager, roomId);
}

/**
 * Set up game-related socket handlers
 */
export function setupGameHandlers(socket: Socket, deps: GameHandlerDeps) {
  const { io, gameManager, getSocketData, logAnalytics, spawnAIPlayers } = deps;

  /**
   * Start the game
   */
  socket.on('startGame', () => {
    console.log('[DEBUG] startGame event received');
    const socketData = getSocketData();
    console.log('[DEBUG] socketData:', socketData);
    const { roomId } = socketData;
    if (!roomId) {
      console.log('[DEBUG] No roomId found');
      return;
    }

    const state = gameManager.getGameState(roomId);
    console.log('[DEBUG] game state:', state ? 'exists' : 'null', 'players:', state?.players?.length);
    if (!state) return;

    if (state.players.length < 1) {
      socket.emit('error', 'Need at least 1 player to start');
      return;
    }

    // Prevent multiple start attempts
    if (state.gameStarted || state.gamePhase === 'turnOrder') {
      console.log(`[Room ${roomId}] Game already started or starting, ignoring duplicate start request`);
      return;
    }

    // Mark as starting
    const room = gameManager.getRoom(roomId);
    if (room) {
      room.state.gamePhase = 'turnOrder';
    }

    // Check for tutorial mode
    if (state.tutorialMode) {
      // Spawn only 1 AI player for tutorial (to practice layoffs)
      if (spawnAIPlayers) {
        spawnAIPlayers(roomId, 1);
      }

      // Initialize tutorial after AI spawns
      setTimeout(() => {
        initializeTutorialGame(io, gameManager, roomId);
      }, 500);
      return;
    }

    // Spawn AI players to fill up to 4 players
    if (spawnAIPlayers) {
      spawnAIPlayers(roomId);
    }

    // Give AI players time to join, then determine turn order
    setTimeout(() => {
      determineTurnOrder(io, gameManager, roomId);
    }, 1000);
  });

  /**
   * Request new game after game over
   */
  socket.on('newGame', () => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const state = gameManager.getGameState(roomId);
    if (!state) return;

    if (state.gamePhase === 'gameOver') {
      gameManager.startGame(roomId);
      broadcastGameState(io, gameManager, roomId);
    }
  });
}

/**
 * Initialize a tutorial game with predetermined cards
 * Sets up a scenario where the player can learn:
 * - Drawing cards
 * - Creating melds (two sets of 3)
 * - Discarding
 * - Layoffs on AI melds (AI will meld first so player can practice)
 */
export function initializeTutorialGame(io: Server, gameManager: GameManager, roomId: string) {
  const state = gameManager.getGameState(roomId);
  if (!state) return;

  console.log(`[Room ${roomId}] Initializing tutorial game with ${state.players.length} players`);

  // Get player IDs
  const humanPlayerId = state.players[0]; // First player is the human
  const aiPlayerIds = state.players.slice(1);

  // Helper to create cards
  let cardIdCounter = 0;
  const makeCard = (rank: Rank, suit: Suit, isWild = false): Card => ({
    rank,
    suit,
    id: `tut-${cardIdCounter++}`,
    isWild
  });

  // Player's hand - easy to make 2 sets of 3 for round 1
  const playerHand: Card[] = [
    // Set 1: Three 7s
    makeCard('7', '♠'),
    makeCard('7', '♥'),
    makeCard('7', '♦'),
    // Set 2: Three 8s
    makeCard('8', '♠'),
    makeCard('8', '♥'),
    makeCard('8', '♦'),
    // Extra cards - player needs to discard these
    makeCard('K', '♥'),
    makeCard('Q', '♦'),
    makeCard('J', '♣')
  ];

  // AI hands - give them sets so they can meld (for layoff practice)
  const aiHands: Record<string, Card[]> = {};
  aiPlayerIds.forEach((aiId, index) => {
    const ranks: Rank[] = ['9', '10', '3', '4'];
    const baseRank = ranks[index % ranks.length];
    aiHands[aiId] = [
      // Set 1
      makeCard(baseRank, '♠'),
      makeCard(baseRank, '♥'),
      makeCard(baseRank, '♦'),
      // Set 2
      makeCard('5', '♠'),
      makeCard('5', '♥'),
      makeCard('5', '♦'),
      // Extra cards
      makeCard('2', '♠', true),
      makeCard('A', '♦'),
      makeCard('6', '♣')
    ];
  });

  // Deck - enough cards to play multiple turns
  const deck: Card[] = [
    // Cards that can be laid off on 7s set
    makeCard('7', '♣'),
    // Cards that can be laid off on 8s set
    makeCard('8', '♣'),
    // General cards
    makeCard('10', '♠'),
    makeCard('3', '♣'),
    makeCard('A', '♠'),
    makeCard('K', '♠'),
    makeCard('Q', '♠'),
    makeCard('J', '♠'),
    makeCard('9', '♣'),
    makeCard('4', '♣'),
    makeCard('6', '♥'),
    makeCard('Joker', '♠', true),
    makeCard('2', '♥', true)
  ];

  // Add more cards for extended play
  const extraRanks: Rank[] = ['3', '4', '5', '6', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  extraRanks.forEach(rank => {
    suits.forEach(suit => {
      deck.push(makeCard(rank, suit, rank === '2'));
    });
  });

  // Initial discard card
  const discardPile: Card[] = [makeCard('6', '♠')];

  // Build player states
  const playerStates: Record<string, any> = {};

  // Human player state
  playerStates[humanPlayerId] = {
    hand: playerHand,
    melds: [],
    score: 0,
    roundScores: [],
    hasMetRequirements: false,
    buyCount: 0,
    roundsWon: 0
  };

  // AI player states
  aiPlayerIds.forEach(aiId => {
    playerStates[aiId] = {
      hand: aiHands[aiId] || [],
      melds: [],
      score: 0,
      roundScores: [],
      hasMetRequirements: false,
      buyCount: 0,
      roundsWon: 0
    };
  });

  // Create modified state for tutorial
  const newState = {
    ...state,
    deck,
    discardPile,
    currentRound: 0,
    gameStarted: true,
    currentPlayerIndex: 0, // Human goes first
    gamePhase: 'draw' as const,
    tutorialStep: 0,
    tutorialMode: true,
    playerStates,
    buyRequests: [],
    passedBuy: [],
    buyJustProcessed: false,
    lastDiscarder: null,
    lastDiscardTimestamp: null,
    continueClicked: []
  };

  gameManager.setGameState(roomId, newState);
  console.log(`[Room ${roomId}] Tutorial initialized: ${state.players.length} players, ${deck.length} cards in deck`);

  // Broadcast state to all players
  broadcastGameState(io, gameManager, roomId);
}

/**
 * Create broadcast function for use by other handlers
 */
export function createBroadcastFunction(io: Server, gameManager: GameManager) {
  return (roomId: string) => broadcastGameState(io, gameManager, roomId);
}
