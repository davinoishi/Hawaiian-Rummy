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
  Card,
  PlayerState
} from '../shared/game-engine/types';
import type { SavedGameState, SavedPlayerState, SavedCard, SavedMeld } from '../shared/profile-types.js';
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
import { ROUND_REQUIREMENTS, BUY_WINDOW_DURATION, TURN_IDLE_TIMEOUT } from '../shared/game-engine/constants';
import { getCardPoints, getCardDisplay, isWildcard } from '../shared/game-engine/card-utils';

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
  password?: string;
  playerProfileIds: Map<string, string>;  // Map socket ID to profile ID

  /** Timestamp of the last successful action in this room, used by the idle-turn timer */
  turnActivityAt: number;
  /** currentPlayerIndex the idle clock is running for, so turn changes restart it */
  turnClockPlayerIndex: number;
  /** lastDiscardTimestamp whose buy-window expiry has already been broadcast (avoids re-broadcasting) */
  buyWindowExpiryNotifiedFor: number | null;
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
  createRoom(roomId?: string, password?: string): Room {
    const id = roomId || this.generateRoomId();
    const room: Room = {
      id,
      state: createInitialGameState(),
      aiPlayerIds: [],
      disconnectedPlayers: new Map(),
      createdAt: Date.now(),
      password: password || undefined,
      playerProfileIds: new Map(),
      turnActivityAt: Date.now(),
      turnClockPlayerIndex: -1,
      buyWindowExpiryNotifiedFor: null
    };
    this.rooms.set(id, room);
    return room;
  }

  /**
   * Validate room password
   * Returns true if password matches or room has no password
   */
  validateRoomPassword(roomId: string, password?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (!room.password) return true; // No password required
    return room.password === password;
  }

  /**
   * Check if room requires password
   */
  roomRequiresPassword(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return room?.password !== undefined && room.password !== '';
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
  addPlayerToRoom(roomId: string, playerId: string, playerName: string, profileId?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (room.state.gameStarted) return false;
    if (room.state.players.length >= 4) return false;

    room.state = addPlayer(room.state, playerId, playerName);

    // Store profile ID if provided
    if (profileId) {
      room.playerProfileIds.set(playerId, profileId);
    }
    return true;
  }

  /**
   * Get a player's profile ID
   */
  getPlayerProfileId(roomId: string, playerId: string): string | undefined {
    const room = this.rooms.get(roomId);
    return room?.playerProfileIds.get(playerId);
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
      // Any successful action means the table is moving - restart the idle clock.
      room.turnActivityAt = Date.now();
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
   * Check if buy window should be skipped
   * Returns true if no one can or would want to buy
   */
  shouldSkipBuyWindow(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const state = room.state;
    const maxBuys = ROUND_REQUIREMENTS[state.currentRound]?.maxBuys || 3;

    // Skip if every player either can't buy or won't buy
    // A player can't buy if: buyCount >= maxBuys
    // A player won't buy if: hasMetRequirements (no incentive)
    const playerStatuses = state.players.map(playerId => {
      const playerState = state.playerStates[playerId];
      if (!playerState) return { playerId, cantBuy: true, wontBuy: true, skip: true };

      const cantBuy = playerState.buyCount >= maxBuys;
      const wontBuy = playerState.hasMetRequirements;

      return { playerId, cantBuy, wontBuy, skip: cantBuy || wontBuy };
    });

    return playerStatuses.every(p => p.skip);
  }

  /**
   * Check if buy window is active
   */
  isBuyWindowActive(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.state.lastDiscardTimestamp) return false;

    // Check if we should skip the buy window
    if (this.shouldSkipBuyWindow(roomId)) {
      return false;
    }

    const elapsed = Date.now() - room.state.lastDiscardTimestamp;
    return elapsed < BUY_WINDOW_DURATION;
  }

  /**
   * Get buy window remaining time in seconds
   */
  getBuyWindowRemaining(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room || !room.state.lastDiscardTimestamp) return 0;

    // Check if we should skip the buy window
    if (this.shouldSkipBuyWindow(roomId)) {
      return 0;
    }

    const elapsed = Date.now() - room.state.lastDiscardTimestamp;
    return Math.max(0, Math.ceil((BUY_WINDOW_DURATION - elapsed) / 1000));
  }

  /**
   * Restart the idle clock when the turn moves to a different player.
   *
   * The turn advances through several paths (a normal discard, a skipped
   * disconnect, an AI takeover, a new round), so rather than resetting the
   * clock in each of them we detect the change here and let the caller - the
   * server tick - drive it.
   */
  syncTurnClock(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.turnClockPlayerIndex !== room.state.currentPlayerIndex) {
      room.turnClockPlayerIndex = room.state.currentPlayerIndex;
      room.turnActivityAt = Date.now();
    }
  }

  /**
   * Whether the idle-turn timer applies to the current player right now.
   *
   * The timer only guards *connected humans*. AI players are driven by
   * AIManager, and disconnected players are already handled by the
   * DISCONNECT_GRACE_PERIOD path in room-handler.
   */
  private isIdleTimerApplicable(room: Room): boolean {
    const state = room.state;
    if (!state.gameStarted) return false;
    if (state.tutorialMode) return false;
    if (state.gamePhase === 'roundSummary' || state.gamePhase === 'gameOver') return false;

    const currentPlayerId = state.players[state.currentPlayerIndex];
    if (!currentPlayerId) return false;
    if (room.aiPlayerIds.includes(currentPlayerId)) return false;
    if (room.disconnectedPlayers.has(currentPlayerId)) return false;

    // Only enforce the clock when someone is actually waiting. A solo player
    // against AI can take as long as they like.
    const connectedHumans = state.players.filter(
      id => !room.aiPlayerIds.includes(id) && !room.disconnectedPlayers.has(id)
    );
    if (connectedHumans.length < 2) return false;

    return true;
  }

  /**
   * Seconds remaining before the current player's turn is auto-played.
   * Returns 0 when the timer does not apply.
   */
  getTurnTimeRemaining(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room || !this.isIdleTimerApplicable(room)) return 0;

    const elapsed = Date.now() - room.turnActivityAt;
    return Math.max(0, Math.ceil((TURN_IDLE_TIMEOUT - elapsed) / 1000));
  }

  /**
   * Whether the current player has been idle past TURN_IDLE_TIMEOUT.
   */
  isTurnIdleExpired(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !this.isIdleTimerApplicable(room)) return false;

    return Date.now() - room.turnActivityAt >= TURN_IDLE_TIMEOUT;
  }

  /**
   * Pick the card an auto-played turn should discard.
   *
   * Prefers the highest-point non-wild card: that trims the most points off the
   * idle player's round score without throwing away a wildcard they will want
   * if they come back. Falls back to the first card if the hand is all wilds.
   */
  private chooseAutoDiscard(hand: Card[]): Card | undefined {
    if (hand.length === 0) return undefined;

    const nonWild = hand.filter(card => !isWildcard(card));
    const candidates = nonWild.length > 0 ? nonWild : hand;

    return candidates.reduce((best, card) =>
      getCardPoints(card) > getCardPoints(best) ? card : best
    );
  }

  /**
   * Auto-play the current player's turn after they have gone idle.
   *
   * Plays the minimum legal turn - draw from the deck, then discard - so hand
   * sizes stay correct rather than skipping the turn outright. Any staged melds
   * that do not meet the round requirement are cancelled first, since
   * canDiscard() blocks a discard while incomplete melds are on the table.
   *
   * Returns a summary for the notification, or null if nothing could be played
   * (in which case the caller should fall back to advancing the turn).
   */
  autoPlayIdleTurn(roomId: string): { playerId: string; playerName: string; cardDisplay: string } | null {
    const room = this.rooms.get(roomId);
    if (!room || !this.isIdleTimerApplicable(room)) return null;

    const playerId = room.state.players[room.state.currentPlayerIndex];
    const playerName = room.state.playerNames[playerId] || 'Unknown';

    // Clear incomplete melds so the discard below is allowed.
    const playerState = room.state.playerStates[playerId];
    if (playerState && playerState.melds.length > 0 && !playerState.hasMetRequirements) {
      this.processAction(roomId, { type: 'CANCEL_MELDS', playerId });
    }

    // Draw only if we are still in the draw phase - an idle player may have
    // already drawn and then stalled while deciding what to meld.
    if (room.state.gamePhase === 'draw') {
      const drawResult = this.processAction(roomId, { type: 'DRAW_CARD', playerId });
      if (!drawResult.success) {
        // Deck is empty or the draw is otherwise blocked; let the caller skip.
        return null;
      }
    }

    const card = this.chooseAutoDiscard(room.state.playerStates[playerId]?.hand || []);
    if (!card) return null;

    const discardResult = this.processAction(roomId, { type: 'DISCARD', playerId, cardId: card.id });
    if (!discardResult.success) {
      console.log(`[Room ${roomId}] Auto-play discard failed for ${playerName}: ${discardResult.error}`);
      return null;
    }

    return { playerId, playerName, cardDisplay: getCardDisplay(card) };
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
      turnTimeRemaining: this.getTurnTimeRemaining(roomId),
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

    // Transfer profile ID mapping
    const profileId = room.playerProfileIds.get(oldId);
    if (profileId) {
      room.playerProfileIds.delete(oldId);
      room.playerProfileIds.set(newId, profileId);
    }

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

  /**
   * Reset game state for rematch
   * Keeps players, names, and AI IDs but resets all game state
   */
  resetGameForRematch(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const state = room.state;

    // Reset player states (clear hands, melds, scores, etc.)
    const resetPlayerStates: Record<string, PlayerState> = {};
    for (const playerId of state.players) {
      resetPlayerStates[playerId] = {
        hand: [],
        melds: [],
        score: 0,
        roundScores: [],
        roundsWon: 0,
        buyCount: 0,
        hasMetRequirements: false
      };
    }

    room.state = {
      ...createInitialGameState(),
      players: state.players,
      playerNames: state.playerNames,
      playerStates: resetPlayerStates,
      tutorialMode: state.tutorialMode,
      hostPlayerId: state.hostPlayerId // Preserve the original host
    };

    console.log(`[Room ${roomId}] Game reset for rematch`);
    return true;
  }

  /**
   * Get a serializable game state for saving
   * Only includes the essential state needed to resume the game
   */
  getSaveableGameState(roomId: string): SavedGameState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const state = room.state;

    // Convert player states
    const savedPlayerStates: Record<string, SavedPlayerState> = {};
    for (const playerId of state.players) {
      const ps = state.playerStates[playerId];
      savedPlayerStates[playerId] = {
        hand: ps.hand.map(this.cardToSavedCard),
        melds: ps.melds.map(m => ({
          type: m.type,
          cards: m.cards.map(this.cardToSavedCard)
        })),
        score: ps.score,
        roundScores: [...ps.roundScores],
        roundsWon: ps.roundsWon,
        buyCount: ps.buyCount,
        hasMetRequirements: ps.hasMetRequirements
      };
    }

    return {
      players: [...state.players],
      playerNames: { ...state.playerNames },
      playerStates: savedPlayerStates,
      currentRound: state.currentRound,
      currentPlayerIndex: state.currentPlayerIndex,
      gamePhase: state.gamePhase,
      deck: state.deck.map(this.cardToSavedCard),
      discardPile: state.discardPile.map(this.cardToSavedCard)
    };
  }

  /**
   * Convert a Card to SavedCard (strips any non-essential data)
   */
  private cardToSavedCard(card: Card): SavedCard {
    return {
      id: card.id,
      suit: card.suit,
      rank: card.rank,
      isWild: card.isWild
    };
  }

  /**
   * Restore a game from saved state
   */
  restoreGameFromSave(roomId: string, humanPlayerId: string, savedState: SavedGameState, aiManager?: any, options?: { preserveAIIds?: boolean }): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Find the human player ID in the saved state (should be the only non-AI player)
    // We need to map saved player IDs to the new human player ID
    const savedHumanPlayerId = savedState.players.find(id => !id.startsWith('ai-'));
    if (!savedHumanPlayerId) return false;

    // Create new AI IDs for the AI players
    const aiIdMap: Record<string, string> = {};
    const newAiPlayerIds: string[] = [];

    for (const savedPlayerId of savedState.players) {
      if (savedPlayerId === savedHumanPlayerId) {
        // Map to new human player ID
        aiIdMap[savedPlayerId] = humanPlayerId;
      } else if (options?.preserveAIIds) {
        // Keep original AI IDs (e.g. ai-tournament-{Name}) so tournament lookups work
        aiIdMap[savedPlayerId] = savedPlayerId;
        newAiPlayerIds.push(savedPlayerId);
      } else {
        // Create new AI ID
        const newAiId = `ai-restored-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        aiIdMap[savedPlayerId] = newAiId;
        newAiPlayerIds.push(newAiId);
      }
    }

    // Rebuild the state with new player IDs
    const newPlayers = savedState.players.map(id => aiIdMap[id]);
    const newPlayerNames: Record<string, string> = {};
    const newPlayerStates: Record<string, PlayerState> = {};

    for (const savedId of savedState.players) {
      const newId = aiIdMap[savedId];
      newPlayerNames[newId] = savedState.playerNames[savedId];

      const savedPs = savedState.playerStates[savedId];
      newPlayerStates[newId] = {
        hand: savedPs.hand.map(c => ({ ...c } as Card)),
        melds: savedPs.melds.map(m => ({
          type: m.type,
          cards: m.cards.map(c => ({ ...c } as Card))
        })),
        score: savedPs.score,
        roundScores: [...savedPs.roundScores],
        roundsWon: savedPs.roundsWon,
        buyCount: savedPs.buyCount,
        hasMetRequirements: savedPs.hasMetRequirements
      };
    }

    // Update the room state
    room.state = {
      players: newPlayers,
      playerNames: newPlayerNames,
      playerStates: newPlayerStates,
      disconnectedPlayerIds: [],
      gameStarted: true,
      gamePhase: savedState.gamePhase as GameState['gamePhase'],
      currentPlayerIndex: savedState.currentPlayerIndex,
      currentRound: savedState.currentRound,
      deck: savedState.deck.map(c => ({ ...c } as Card)),
      discardPile: savedState.discardPile.map(c => ({ ...c } as Card)),
      buyRequests: [],
      passedBuy: [],
      buyJustProcessed: false,
      lastDiscarder: null,
      lastDiscardTimestamp: null,
      continueClicked: [],
      tutorialMode: false,
      hostPlayerId: humanPlayerId
    };

    // Update room AI tracking
    room.aiPlayerIds = newAiPlayerIds;
    room.playerProfileIds.clear();

    // Register AIs with the AI manager if provided
    if (aiManager) {
      for (const savedId of savedState.players) {
        if (savedId !== savedHumanPlayerId) {
          const newAiId = aiIdMap[savedId];
          const aiName = savedState.playerNames[savedId];
          aiManager.registerAI(roomId, newAiId, aiName);
        }
      }
    }

    console.log(`[Room ${roomId}] Game restored from save, round ${savedState.currentRound + 1}`);
    return true;
  }
}

// Export singleton instance
export const gameManager = new GameManager();
