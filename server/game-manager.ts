/**
 * Hawaiian Rummy - Game Manager
 * Manages game rooms and state using the shared game engine
 */

import {
  GameState,
  GameAction,
  ActionResult,
  ClientGameState,
  ClientPlayer,
  Card
} from '../shared/game-engine/types';
import {
  createInitialGameState,
  addPlayer,
  removePlayer,
  setPlayerOrder,
  startGame,
  startNewRound,
  processAction,
  getCurrentPlayerId,
  getGameWinner,
  getAvailableActions
} from '../shared/game-engine/game-state';
import { ROUND_REQUIREMENTS, BUY_WINDOW_DURATION } from '../shared/game-engine/constants';

/**
 * Grace period for disconnected players in milliseconds (45 seconds)
 */
export const DISCONNECT_GRACE_PERIOD = 45000;

/**
 * Disconnected player tracking data
 */
export interface DisconnectedPlayer {
  playerId: string;
  roomId: string;
  playerName: string;
  disconnectedAt: number;
  gracePeriodTimer: NodeJS.Timeout;
}

/**
 * Room data structure
 */
export interface Room {
  id: string;
  state: GameState;
  aiPlayerIds: string[];
  disconnectedPlayers: Map<string, DisconnectedPlayer>;
  createdAt: number;
}

/**
 * Game Manager class
 * Handles all room and game state management
 */
export class GameManager {
  private rooms: Map<string, Room> = new Map();

  /**
   * Generate a unique room ID
   */
  generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Create a new room
   */
  createRoom(roomId?: string): Room {
    const id = roomId || this.generateRoomId();
    const room: Room = {
      id,
      state: createInitialGameState(),
      aiPlayerIds: [],
      disconnectedPlayers: new Map(),
      createdAt: Date.now()
    };
    this.rooms.set(id, room);
    return room;
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get or create a room
   */
  getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = this.createRoom(roomId);
    }
    return room;
  }

  /**
   * Delete a room
   */
  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /**
   * Add a player to a room
   */
  addPlayerToRoom(roomId: string, playerId: string, playerName: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (room.state.gameStarted) return false;
    if (room.state.players.length >= 4) return false;

    room.state = addPlayer(room.state, playerId, playerName);
    return true;
  }

  /**
   * Remove a player from a room
   */
  removePlayerFromRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.state = removePlayer(room.state, playerId);

    // Remove from AI list if applicable
    room.aiPlayerIds = room.aiPlayerIds.filter(id => id !== playerId);

    // Clean up empty rooms
    if (room.state.players.length === 0) {
      this.deleteRoom(roomId);
    }
  }

  /**
   * Add an AI player to a room
   */
  addAIPlayer(roomId: string, playerId: string, playerName: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const added = this.addPlayerToRoom(roomId, playerId, playerName);
    if (added) {
      room.aiPlayerIds.push(playerId);
    }
    return added;
  }

  /**
   * Check if a player is AI
   */
  isAIPlayer(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.aiPlayerIds.includes(playerId);
  }

  /**
   * Get all AI player IDs in a room
   */
  getAIPlayerIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.aiPlayerIds];
  }

  /**
   * Set player order for a room
   */
  setPlayerOrder(roomId: string, playerIds: string[]): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.state = setPlayerOrder(room.state, playerIds);
  }

  /**
   * Start the game in a room
   */
  startGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.state.gameStarted) return false;
    if (room.state.players.length < 1) return false;

    room.state = startGame(room.state);
    return true;
  }

  /**
   * Process a game action
   */
  processAction(roomId: string, action: GameAction): ActionResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return {
        success: false,
        error: 'Room not found',
        newState: createInitialGameState()
      };
    }

    const result = processAction(room.state, action);
    if (result.success) {
      room.state = result.newState;
    }
    return result;
  }

  /**
   * Get the current player ID for a room
   */
  getCurrentPlayerId(roomId: string): string | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return getCurrentPlayerId(room.state);
  }

  /**
   * Check if it's a player's turn
   */
  isPlayerTurn(roomId: string, playerId: string): boolean {
    return this.getCurrentPlayerId(roomId) === playerId;
  }

  /**
   * Check if buy window is active
   */
  isBuyWindowActive(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.state.lastDiscardTimestamp) return false;
    const elapsed = Date.now() - room.state.lastDiscardTimestamp;
    return elapsed < BUY_WINDOW_DURATION;
  }

  /**
   * Get buy window remaining time in seconds
   */
  getBuyWindowRemaining(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room || !room.state.lastDiscardTimestamp) return 0;
    const elapsed = Date.now() - room.state.lastDiscardTimestamp;
    return Math.max(0, Math.ceil((BUY_WINDOW_DURATION - elapsed) / 1000));
  }

  /**
   * Get client-safe game state for a specific player
   */
  getClientGameState(roomId: string, playerId: string): ClientGameState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const state = room.state;
    const playerState = state.playerStates[playerId];
    if (!playerState) return null;

    const currentPlayerIndex = state.currentPlayerIndex;
    const playerIndex = state.players.indexOf(playerId);
    const isMyTurn = this.isPlayerTurn(roomId, playerId);

    // Get max buys for current round
    const maxBuys = ROUND_REQUIREMENTS[state.currentRound]?.maxBuys || 3;

    // Calculate player distance from current player
    const distance = (playerIndex - currentPlayerIndex + state.players.length) % state.players.length;

    // Find next player who has requested a buy
    let nextPlayerToBuy: string | null = null;
    let nextBuyerDistance = Infinity;
    for (const req of state.buyRequests) {
      const reqIndex = state.players.indexOf(req.playerId);
      const reqDistance = (reqIndex - currentPlayerIndex + state.players.length) % state.players.length;
      if (reqDistance > 0 && reqDistance < nextBuyerDistance) {
        nextBuyerDistance = reqDistance;
        nextPlayerToBuy = req.playerId;
      }
    }

    // Calculate can/should flags
    // Current player can always draw from deck on their turn during draw phase
    // (drawing from deck means they don't want the discard, so buy requests are irrelevant)
    const canDraw = isMyTurn &&
      state.gamePhase === 'draw';

    const canBuy = !isMyTurn &&
      state.gamePhase === 'draw' &&
      playerState.buyCount < maxBuys &&
      (state.lastDiscarder === null || state.lastDiscarder !== playerId) &&
      state.discardPile.length > 0 &&
      distance > 0 &&
      !state.buyJustProcessed;

    const shouldShowPass = state.buyRequests.length > 0 &&
      !state.buyRequests.some(r => r.playerId === playerId) &&
      (isMyTurn || (distance > 0 && state.buyRequests.some(req => {
        const reqIndex = state.players.indexOf(req.playerId);
        const reqDistance = (reqIndex - currentPlayerIndex + state.players.length) % state.players.length;
        return reqDistance > distance;
      })));

    const canTakeDiscard = isMyTurn &&
      state.gamePhase === 'draw' &&
      !state.buyJustProcessed &&
      !this.isBuyWindowActive(roomId);

    // Get winner if game is over
    const winner = getGameWinner(state);

    // Build players array
    const players: ClientPlayer[] = state.players.map(id => {
      const pState = state.playerStates[id];
      return {
        id,
        name: state.playerNames[id] || 'Unknown',
        handSize: pState.hand.length,
        score: pState.score,
        melds: pState.melds,
        buyCount: pState.buyCount,
        roundsWon: pState.roundsWon,
        wins: pState.roundsWon, // Alias for backwards compatibility
        roundScores: pState.roundScores,
        isMe: id === playerId,
        isAI: room.aiPlayerIds.includes(id),
        hasMetRequirements: pState.hasMetRequirements
      };
    });

    // Build winner object if game is over
    const winnerObj = winner ? {
      id: winner,
      name: state.playerNames[winner] || 'Unknown',
      score: state.playerStates[winner]?.score || 0
    } : null;

    return {
      players,
      myHand: playerState.hand,
      myMelds: playerState.melds,
      discardPile: state.discardPile,
      deckSize: state.deck.length,
      currentPlayerIndex: state.currentPlayerIndex,
      currentRound: state.currentRound,
      gamePhase: state.gamePhase,
      isMyTurn,
      hasMetRequirements: playerState.hasMetRequirements,
      buyRequests: state.buyRequests,
      myBuyCount: playerState.buyCount,
      maxBuys,
      canBuy,
      canDraw,
      canTakeDiscard,
      shouldShowPass,
      hasBuyRequest: state.buyRequests.some(r => r.playerId === playerId),
      hasPassed: state.passedBuy.includes(playerId),
      nextPlayerToBuy,
      winner: winnerObj,
      isWinner: winner === playerId,
      continueClicked: state.continueClicked,
      hasContinued: state.continueClicked.includes(playerId),
      buyWindowActive: this.isBuyWindowActive(roomId),
      buyWindowRemaining: this.getBuyWindowRemaining(roomId),
      buyJustProcessed: state.buyJustProcessed,
      tutorialMode: state.tutorialMode || false,
      tutorialStep: state.tutorialStep || 0
    };
  }

  /**
   * Get the raw game state (for AI or debugging)
   */
  getGameState(roomId: string): GameState | null {
    const room = this.rooms.get(roomId);
    return room ? room.state : null;
  }

  /**
   * Set the game state directly (for tutorials or testing)
   */
  setGameState(roomId: string, state: GameState): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.state = state;
    }
  }

  /**
   * Get available actions for a player
   */
  getAvailableActions(roomId: string, playerId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return getAvailableActions(room.state, playerId);
  }

  /**
   * Get all active rooms
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Clean up stale rooms (older than given age in ms)
   */
  cleanupStaleRooms(maxAgeMs: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [roomId, room] of this.rooms) {
      if (now - room.createdAt > maxAgeMs && !room.state.gameStarted) {
        this.deleteRoom(roomId);
        cleaned++;
      }
    }

    return cleaned;
  }

  // ===== DISCONNECT HANDLING =====

  /**
   * Mark a player as disconnected and start grace period tracking
   * Returns the DisconnectedPlayer entry for timer setup by caller
   */
  markPlayerDisconnected(roomId: string, playerId: string): DisconnectedPlayer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const playerName = room.state.playerNames[playerId];
    if (!playerName) return null;

    const disconnectedPlayer: DisconnectedPlayer = {
      playerId,
      roomId,
      playerName,
      disconnectedAt: Date.now(),
      gracePeriodTimer: null as unknown as NodeJS.Timeout // Will be set by caller
    };

    room.disconnectedPlayers.set(playerId, disconnectedPlayer);

    // Add to disconnectedPlayerIds in game state
    if (!room.state.disconnectedPlayerIds.includes(playerId)) {
      room.state.disconnectedPlayerIds = [...room.state.disconnectedPlayerIds, playerId];
    }

    console.log(`[Room ${roomId}] Player ${playerName} marked as disconnected`);
    return disconnectedPlayer;
  }

  /**
   * Check if a player is currently in disconnected grace period
   */
  isPlayerDisconnected(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.disconnectedPlayers.has(playerId);
  }

  /**
   * Get disconnected player entry
   */
  getDisconnectedPlayer(roomId: string, playerId: string): DisconnectedPlayer | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room.disconnectedPlayers.get(playerId);
  }

  /**
   * Find a disconnected player by name (for reconnection)
   */
  findDisconnectedByName(roomId: string, playerName: string): DisconnectedPlayer | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    for (const [, disconnected] of room.disconnectedPlayers) {
      if (disconnected.playerName === playerName) {
        return disconnected;
      }
    }
    return undefined;
  }

  /**
   * Clear grace period timer and remove from disconnected tracking
   */
  clearGracePeriodTimer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const disconnected = room.disconnectedPlayers.get(playerId);
    if (disconnected) {
      if (disconnected.gracePeriodTimer) {
        clearTimeout(disconnected.gracePeriodTimer);
      }
      room.disconnectedPlayers.delete(playerId);

      // Remove from disconnectedPlayerIds
      room.state.disconnectedPlayerIds = room.state.disconnectedPlayerIds.filter(
        id => id !== playerId
      );

      console.log(`[Room ${roomId}] Cleared grace period for ${disconnected.playerName}`);
    }
  }

  /**
   * Advance to next non-disconnected player, resetting phase to 'draw'
   */
  advanceToNextActivePlayer(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[Room ${roomId}] advanceToNextActivePlayer: room not found`);
      return false;
    }

    const state = room.state;
    const numPlayers = state.players.length;
    let attempts = 0;
    let nextIndex = (state.currentPlayerIndex + 1) % numPlayers;

    console.log(`[Room ${roomId}] advanceToNextActivePlayer: starting from index ${state.currentPlayerIndex}, looking for next active player`);
    console.log(`[Room ${roomId}] disconnectedPlayers map size: ${room.disconnectedPlayers.size}, keys: [${Array.from(room.disconnectedPlayers.keys()).join(', ')}]`);

    // Find next player who is not disconnected
    while (attempts < numPlayers) {
      const nextPlayerId = state.players[nextIndex];
      const isDisconnected = room.disconnectedPlayers.has(nextPlayerId);
      console.log(`[Room ${roomId}] Checking player ${nextPlayerId} at index ${nextIndex}: disconnected=${isDisconnected}`);

      if (!isDisconnected) {
        room.state = {
          ...state,
          currentPlayerIndex: nextIndex,
          gamePhase: 'draw',
          buyRequests: [],
          passedBuy: [],
          buyJustProcessed: false,
          lastDiscardTimestamp: null,  // Clear buy window when skipping turn
          lastDiscarder: null
        };
        console.log(`[Room ${roomId}] Advanced to player ${state.playerNames[nextPlayerId]} (index ${nextIndex})`);
        return true;
      }
      nextIndex = (nextIndex + 1) % numPlayers;
      attempts++;
    }

    // All players disconnected - shouldn't happen but handle gracefully
    console.log(`[Room ${roomId}] Warning: All players appear disconnected`);
    return false;
  }

  /**
   * Update a player's socket ID (for reconnection)
   * Transfers all player state from old ID to new ID
   */
  updatePlayerSocketId(roomId: string, oldId: string, newId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const state = room.state;

    // Check if old player exists
    if (!state.players.includes(oldId)) {
      return false;
    }

    // Update players array
    const playerIndex = state.players.indexOf(oldId);
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = newId;

    // Transfer player name
    const playerName = state.playerNames[oldId];
    const { [oldId]: _, ...restNames } = state.playerNames;
    const newPlayerNames = { ...restNames, [newId]: playerName };

    // Transfer player state
    const playerState = state.playerStates[oldId];
    const { [oldId]: __, ...restStates } = state.playerStates;
    const newPlayerStates = { ...restStates, [newId]: playerState };

    // Update buy requests
    const newBuyRequests = state.buyRequests.map(req =>
      req.playerId === oldId ? { ...req, playerId: newId } : req
    );

    // Update passed buy
    const newPassedBuy = state.passedBuy.map(id => id === oldId ? newId : id);

    // Update continue clicked
    const newContinueClicked = state.continueClicked.map(id => id === oldId ? newId : id);

    // Update last discarder
    const newLastDiscarder = state.lastDiscarder === oldId ? newId : state.lastDiscarder;

    // Remove from disconnectedPlayerIds
    const newDisconnectedPlayerIds = state.disconnectedPlayerIds.filter(id => id !== oldId);

    room.state = {
      ...state,
      players: newPlayers,
      playerNames: newPlayerNames,
      playerStates: newPlayerStates,
      buyRequests: newBuyRequests,
      passedBuy: newPassedBuy,
      continueClicked: newContinueClicked,
      lastDiscarder: newLastDiscarder,
      disconnectedPlayerIds: newDisconnectedPlayerIds
    };

    console.log(`[Room ${roomId}] Updated socket ID: ${oldId} -> ${newId} for ${playerName}`);
    return true;
  }

  /**
   * Convert a disconnected player to AI control
   * Returns the new AI player ID
   */
  convertToAIPlayer(roomId: string, disconnectedPlayer: DisconnectedPlayer): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const oldId = disconnectedPlayer.playerId;
    const newId = `ai-converted-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Update the player ID first (this preserves the original name)
    if (!this.updatePlayerSocketId(roomId, oldId, newId)) {
      return null;
    }

    // Add to AI player list
    room.aiPlayerIds.push(newId);

    // Clear from disconnected tracking
    room.disconnectedPlayers.delete(oldId);

    console.log(`[Room ${roomId}] Converted ${disconnectedPlayer.playerName} to AI control (${newId})`);
    return newId;
  }
}

// Export singleton instance
export const gameManager = new GameManager();
