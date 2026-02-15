/**
 * Hawaiian Rummy - Room Socket Handlers
 * Handles room creation, joining, and lobby management
 */

import { Server, Socket } from 'socket.io';
import { GameManager, DISCONNECT_GRACE_PERIOD, DisconnectedPlayer } from '../game-manager';
import { broadcastGameState, initializeTutorialGame } from './game-handler';
import { AIManager } from '../ai/ai-manager';
import { profileManager } from '../profile-manager.js';
import type { Card, Rank, Suit } from '../../shared/game-engine/types';
import type { SavedGame } from '../../shared/profile-types.js';

export interface RoomHandlerDeps {
  io: Server;
  gameManager: GameManager;
  logAnalytics: (event: string, data?: any) => void;
  spawnAIPlayers?: (roomId: string, maxAI?: number) => void;
  aiManager?: AIManager;
}

export interface SocketData {
  roomId?: string;
  playerName?: string;
  playerId: string;
  profileId?: string;  // Player's profile ID if they have one
}

/**
 * Handle grace period expiration - convert player to AI
 */
function handleGracePeriodExpired(
  io: Server,
  gameManager: GameManager,
  aiManager: AIManager | undefined,
  roomId: string,
  disconnectedPlayer: DisconnectedPlayer
) {
  console.log(`[Room ${roomId}] Grace period expired for ${disconnectedPlayer.playerName}`);

  // Convert to AI player
  const newAiId = gameManager.convertToAIPlayer(roomId, disconnectedPlayer);
  if (!newAiId) {
    console.error(`[Room ${roomId}] Failed to convert ${disconnectedPlayer.playerName} to AI`);
    return;
  }

  // Register with AI manager
  if (aiManager) {
    aiManager.registerAI(roomId, newAiId, disconnectedPlayer.playerName);
  }

  // Notify all clients
  io.to(roomId).emit('playerTakenOverByAI', {
    originalPlayerId: disconnectedPlayer.playerId,
    newPlayerId: newAiId,
    playerName: disconnectedPlayer.playerName
  });

  // Broadcast updated game state
  broadcastGameState(io, gameManager, roomId);
}

/**
 * Get lobby update data for a room
 */
function getLobbyUpdate(gameManager: GameManager, roomId: string) {
  const room = gameManager.getRoom(roomId);
  const state = room?.state;
  if (!state) return null;

  // Order players with host first
  const hostId = state.hostPlayerId;
  const orderedPlayers = hostId
    ? [
        ...state.players.filter(id => id === hostId),
        ...state.players.filter(id => id !== hostId)
      ]
    : state.players;

  return {
    roomId,
    players: orderedPlayers.map(id => ({
      id,
      name: state.playerNames[id] || 'Unknown'
    })),
    gameStarted: state.gameStarted,
    tutorialMode: state.tutorialMode
  };
}

/**
 * Set up room-related socket handlers
 */
export function setupRoomHandlers(socket: Socket, deps: RoomHandlerDeps) {
  const { io, gameManager, logAnalytics, spawnAIPlayers, aiManager } = deps;

  // Store room/player info on socket
  const socketData: SocketData = {
    playerId: socket.id
  };

  /**
   * Create a new room
   */
  socket.on('createRoom', (playerName: string, tutorialMode: boolean, passwordOrCallbackOrOptions?: string | Function | { password?: string; profileId?: string }, maybeCallback?: Function) => {
    // Handle multiple signatures:
    // (playerName, tutorialMode, callback)
    // (playerName, tutorialMode, password, callback)
    // (playerName, tutorialMode, { password?, profileId? }, callback)
    let password: string | undefined;
    let profileId: string | undefined;
    let callback: Function | undefined;

    if (typeof passwordOrCallbackOrOptions === 'function') {
      callback = passwordOrCallbackOrOptions;
    } else if (typeof passwordOrCallbackOrOptions === 'string') {
      password = passwordOrCallbackOrOptions;
      callback = maybeCallback;
    } else if (passwordOrCallbackOrOptions && typeof passwordOrCallbackOrOptions === 'object') {
      password = passwordOrCallbackOrOptions.password;
      profileId = passwordOrCallbackOrOptions.profileId;
      callback = maybeCallback;
    }

    console.log('[SERVER] createRoom received from socket:', socket.id, 'playerName:', playerName, 'tutorialMode:', tutorialMode, 'hasPassword:', !!password, 'profileId:', profileId);
    const roomId = gameManager.generateRoomId();
    gameManager.createRoom(roomId, password);

    socketData.roomId = roomId;
    socketData.playerName = playerName;
    socketData.profileId = profileId;
    socket.join(roomId);
    console.log('[DEBUG] socketData set:', socketData);

    // Add player to room with profile ID
    gameManager.addPlayerToRoom(roomId, socket.id, playerName, profileId);

    // Set tutorial mode and host
    const room = gameManager.getRoom(roomId);
    if (room) {
      room.state.tutorialMode = tutorialMode || false;
      room.state.hostPlayerId = socket.id; // Track who created the room
    }

    console.log(`[Room ${roomId}] ${playerName} created room. Tutorial mode: ${tutorialMode}`);

    logAnalytics(tutorialMode ? 'tutorial_started' : 'game_created', {
      roomId,
      playerName,
      tutorialMode
    });

    if (callback) {
      callback({ roomId, tutorialMode: room?.state.tutorialMode, hasPassword: !!password });
    }

    // For tutorial mode, auto-start the game immediately
    if (tutorialMode && spawnAIPlayers) {
      console.log(`[Room ${roomId}] Tutorial mode - auto-starting game`);

      // Spawn 1 AI player
      spawnAIPlayers(roomId, 1);

      // Initialize tutorial after AI spawns
      setTimeout(() => {
        initializeTutorialGame(io, gameManager, roomId);
      }, 500);
      return;
    }

    // Broadcast lobby update (for non-tutorial games)
    const lobbyUpdate = getLobbyUpdate(gameManager, roomId);
    console.log('[SERVER] Emitting lobbyUpdate to room:', roomId, 'socketId:', socket.id, 'data:', JSON.stringify(lobbyUpdate));
    if (lobbyUpdate) {
      // Emit to room (for other players)
      io.to(roomId).emit('lobbyUpdate', lobbyUpdate);
      // Also emit directly to this socket (in case room join timing issue)
      socket.emit('lobbyUpdate', lobbyUpdate);
      console.log('[SERVER] lobbyUpdate emitted to room and socket');
    }
  });

  /**
   * Join an existing room
   */
  socket.on('joinGame', (data: { playerName: string; roomId: string; password?: string; profileId?: string }, callback?: Function) => {
    const { playerName, roomId, password, profileId } = data;

    const room = gameManager.getRoom(roomId);

    // Check if room exists
    if (!room) {
      socket.emit('error', 'Room not found');
      if (callback) callback({ error: 'Room not found' });
      return;
    }

    // Check if password is required but not provided
    if (gameManager.roomRequiresPassword(roomId) && !password) {
      socket.emit('passwordRequired', { roomId });
      if (callback) callback({ error: 'Password required', passwordRequired: true });
      return;
    }

    // Validate password
    if (!gameManager.validateRoomPassword(roomId, password)) {
      socket.emit('invalidPassword', { roomId });
      if (callback) callback({ error: 'Invalid password' });
      return;
    }

    const state = gameManager.getGameState(roomId);

    if (state?.gameStarted) {
      socket.emit('gameAlreadyStarted');
      if (callback) callback({ error: 'Game already started' });
      return;
    }

    if (state && state.players.length >= 4) {
      socket.emit('gameFull');
      if (callback) callback({ error: 'Game is full' });
      return;
    }

    socketData.roomId = roomId;
    socketData.playerName = playerName;
    socketData.profileId = profileId;
    socket.join(roomId);

    gameManager.addPlayerToRoom(roomId, socket.id, playerName, profileId);

    console.log(`[Room ${roomId}] ${playerName} joined. Players: ${state?.players.length || 0 + 1}, profileId: ${profileId}`);

    logAnalytics('player_joined', {
      roomId,
      playerName,
      playerCount: (state?.players.length || 0) + 1
    });

    if (callback) {
      callback({ success: true, roomId });
    }

    // Broadcast lobby update
    const lobbyUpdate = getLobbyUpdate(gameManager, roomId);
    if (lobbyUpdate) {
      io.to(roomId).emit('lobbyUpdate', lobbyUpdate);
    }
  });

  /**
   * Handle disconnect
   */
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    const { roomId, playerName } = socketData;
    if (!roomId) return;

    const state = gameManager.getGameState(roomId);

    // If game not started, use existing removal logic
    if (!state?.gameStarted) {
      gameManager.removePlayerFromRoom(roomId, socket.id);

      // Broadcast lobby update
      const lobbyUpdate = getLobbyUpdate(gameManager, roomId);
      if (lobbyUpdate) {
        io.to(roomId).emit('lobbyUpdate', lobbyUpdate);
      }
      return;
    }

    // Game active - start grace period
    const disconnectedPlayer = gameManager.markPlayerDisconnected(roomId, socket.id);
    if (!disconnectedPlayer) return;

    // Notify clients
    io.to(roomId).emit('playerDisconnected', {
      playerId: socket.id,
      playerName: disconnectedPlayer.playerName,
      gracePeriodEnds: Date.now() + DISCONNECT_GRACE_PERIOD
    });

    // Check if it was their turn or if they had pending actions
    const currentPlayerId = gameManager.getCurrentPlayerId(roomId);
    const wasTheirTurn = currentPlayerId === socket.id;
    const hadBuyRequest = state.buyRequests.some(r => r.playerId === socket.id);

    console.log(`[Room ${roomId}] Disconnect check: currentPlayer=${currentPlayerId}, disconnectedPlayer=${socket.id}, wasTheirTurn=${wasTheirTurn}, phase=${state.gamePhase}`);

    // If it's their turn, cancel any staged melds and skip to next player
    if (wasTheirTurn) {
      // Cancel any staged melds first
      if (state.gamePhase === 'meld') {
        gameManager.processAction(roomId, { type: 'CANCEL_MELDS', playerId: socket.id });
      }
      const advanced = gameManager.advanceToNextActivePlayer(roomId);
      console.log(`[Room ${roomId}] advanceToNextActivePlayer returned: ${advanced}`);

      // Log the new state after advancing
      const newState = gameManager.getGameState(roomId);
      const newCurrentPlayer = gameManager.getCurrentPlayerId(roomId);
      console.log(`[Room ${roomId}] After advance: newCurrentPlayer=${newCurrentPlayer}, phase=${newState?.gamePhase}, buyWindowActive=${gameManager.isBuyWindowActive(roomId)}`);
    }

    // Remove any pending buy requests from this player (if not already cleared by advance)
    if (hadBuyRequest && !wasTheirTurn) {
      gameManager.processAction(roomId, { type: 'CANCEL_BUY', playerId: socket.id });
    }

    // Broadcast updated state to remaining players
    console.log(`[Room ${roomId}] Broadcasting state after disconnect`);
    broadcastGameState(io, gameManager, roomId);

    // Set 45-second grace period timer
    disconnectedPlayer.gracePeriodTimer = setTimeout(() => {
      handleGracePeriodExpired(io, gameManager, aiManager, roomId, disconnectedPlayer);
    }, DISCONNECT_GRACE_PERIOD);
  });

  /**
   * Handle reconnection to game
   */
  socket.on('reconnectToGame', (data: { roomId: string; playerName: string }, callback?: Function) => {
    const { roomId, playerName } = data;

    // Find disconnected player by name
    const disconnectedEntry = gameManager.findDisconnectedByName(roomId, playerName);

    if (!disconnectedEntry) {
      // Check if the player was already taken over by AI
      const room = gameManager.getRoom(roomId);
      const state = room?.state;

      // Look for an AI player with the same name
      const aiTookOver = room && state && room.aiPlayerIds.some(aiId =>
        state.playerNames[aiId] === playerName
      );

      if (aiTookOver) {
        if (callback) callback({ success: false, error: 'Position taken over by AI' });
      } else {
        if (callback) callback({ success: false, error: 'No disconnected player found' });
      }
      return;
    }

    const originalId = disconnectedEntry.playerId;

    // Clear grace period timer
    gameManager.clearGracePeriodTimer(roomId, originalId);

    // Update socket ID
    if (!gameManager.updatePlayerSocketId(roomId, originalId, socket.id)) {
      if (callback) callback({ success: false, error: 'Failed to update player session' });
      return;
    }

    // Update socket data
    socketData.roomId = roomId;
    socketData.playerName = playerName;

    // Join room
    socket.join(roomId);

    // Notify all players
    io.to(roomId).emit('playerReconnected', {
      playerId: socket.id,
      playerName
    });

    // Send game state to reconnected player
    const clientState = gameManager.getClientGameState(roomId, socket.id);
    if (clientState) {
      socket.emit('gameState', clientState);
    }

    console.log(`[Room ${roomId}] ${playerName} reconnected with new socket ${socket.id}`);

    if (callback) callback({ success: true, roomId });
  });

  /**
   * Set room password (host only)
   */
  socket.on('setRoomPassword', (data: { roomId: string; password: string }, callback?: Function) => {
    const { roomId, password } = data;

    const room = gameManager.getRoom(roomId);
    if (!room) {
      if (callback) callback({ error: 'Room not found' });
      return;
    }

    const state = room.state;

    // Only host can set password
    if (state.hostPlayerId !== socket.id) {
      if (callback) callback({ error: 'Only the host can set the password' });
      return;
    }

    // Can only set password before game starts
    if (state.gameStarted) {
      if (callback) callback({ error: 'Cannot set password after game has started' });
      return;
    }

    // Set the password
    room.password = password.trim() || undefined;

    console.log(`[Room ${roomId}] Password ${room.password ? 'set' : 'cleared'} by host`);

    if (callback) callback({ success: true });
  });

  // ===== REMATCH HANDLING =====

  // Track rematch votes per room (stored on Room object would be better, but using closure for simplicity)
  const rematchVotes: Map<string, Set<string>> = new Map();

  /**
   * Handle rematch vote request
   */
  socket.on('requestRematch', (data: { roomId: string }, callback?: Function) => {
    const { roomId } = data;
    const room = gameManager.getRoom(roomId);
    const state = room?.state;

    if (!room || !state || state.gamePhase !== 'gameOver') {
      if (callback) callback({ error: 'Cannot request rematch' });
      return;
    }

    // Initialize votes for room if needed
    if (!rematchVotes.has(roomId)) {
      rematchVotes.set(roomId, new Set());
    }

    const votes = rematchVotes.get(roomId)!;
    votes.add(socket.id);

    // Count only human players (non-AI)
    const humanPlayers = state.players.filter(id => !room.aiPlayerIds.includes(id));
    const totalHumans = humanPlayers.length;
    const votedCount = humanPlayers.filter(id => votes.has(id)).length;

    console.log(`[Room ${roomId}] Rematch vote from ${socketData.playerName}: ${votedCount}/${totalHumans}`);

    // Broadcast vote update
    io.to(roomId).emit('rematchVoteUpdate', {
      votes: Array.from(votes),
      votedCount,
      total: totalHumans
    });

    if (callback) callback({ success: true });

    // Check if all humans voted
    if (votedCount >= totalHumans) {
      console.log(`[Room ${roomId}] All players voted for rematch, resetting game`);

      // Reset the game
      gameManager.resetGameForRematch(roomId);
      rematchVotes.delete(roomId);

      // Notify clients
      io.to(roomId).emit('rematchStarting', { roomId });

      // Send lobby update
      const lobbyUpdate = getLobbyUpdate(gameManager, roomId);
      if (lobbyUpdate) {
        io.to(roomId).emit('lobbyUpdate', lobbyUpdate);
      }
    }
  });

  // ===== CHAT HANDLING =====

  /**
   * Handle chat message
   */
  socket.on('sendChatMessage', (data: { roomId: string; message: string }, callback?: Function) => {
    const { roomId, message } = data;

    // Validate message
    if (!message || typeof message !== 'string') {
      if (callback) callback({ error: 'Invalid message' });
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0 || trimmedMessage.length > 200) {
      if (callback) callback({ error: 'Message must be 1-200 characters' });
      return;
    }

    const room = gameManager.getRoom(roomId);
    if (!room) {
      if (callback) callback({ error: 'Room not found' });
      return;
    }

    const state = room.state;
    const playerName = state.playerNames[socket.id];

    if (!playerName) {
      if (callback) callback({ error: 'Player not in room' });
      return;
    }

    // Create chat message
    const chatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      playerId: socket.id,
      playerName,
      message: trimmedMessage,
      timestamp: Date.now()
    };

    // Broadcast to all players in room
    io.to(roomId).emit('chatMessage', chatMessage);

    console.log(`[Room ${roomId}] Chat from ${playerName}: ${trimmedMessage.substring(0, 50)}${trimmedMessage.length > 50 ? '...' : ''}`);

    if (callback) callback({ success: true });
  });

  // ===== SAVE/LOAD GAME HANDLING =====

  /**
   * Save current game state
   */
  socket.on('saveGame', (data: { roomId: string; profileId: string }, callback?: Function) => {
    console.log('[SAVE] saveGame event received:', data);
    const { roomId, profileId } = data;

    // Validate profile exists
    if (!profileManager.profileExists(profileId)) {
      console.log('[SAVE] Profile not found:', profileId);
      if (callback) callback({ error: 'Profile not found' });
      return;
    }

    const room = gameManager.getRoom(roomId);
    if (!room) {
      console.log('[SAVE] Room not found:', roomId);
      if (callback) callback({ error: 'Room not found' });
      return;
    }

    const state = room.state;
    console.log('[SAVE] Game phase:', state.gamePhase, 'Players:', state.players.length, 'AIs:', room.aiPlayerIds.length);

    // Only allow saving single-player games (1 human + AIs)
    const humanPlayers = state.players.filter(id => !room.aiPlayerIds.includes(id));
    console.log('[SAVE] Human players:', humanPlayers.length);
    if (humanPlayers.length !== 1) {
      console.log('[SAVE] Not a single-player game');
      if (callback) callback({ error: 'Can only save single-player games' });
      return;
    }

    // Allow saving during active game phases (not lobby, turnOrder, roundSummary, or gameOver)
    const invalidPhases = ['lobby', 'turnOrder', 'roundSummary', 'gameOver'];
    if (invalidPhases.includes(state.gamePhase)) {
      console.log('[SAVE] Invalid game phase for saving:', state.gamePhase);
      if (callback) callback({ error: `Cannot save during ${state.gamePhase} phase` });
      return;
    }

    // Get serializable game state
    const savedState = gameManager.getSaveableGameState(roomId);
    if (!savedState) {
      if (callback) callback({ error: 'Failed to serialize game state' });
      return;
    }

    // Get AI opponent names
    const aiOpponents = room.aiPlayerIds.map(id => state.playerNames[id]);
    const humanPlayerId = humanPlayers[0];
    const playerScore = state.playerStates[humanPlayerId].score;

    // Create saved game entry
    const savedGame: SavedGame = {
      id: `save-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      profileId,
      savedAt: new Date().toISOString(),
      gameState: savedState,
      currentRound: state.currentRound,
      playerScore,
      aiOpponents
    };

    // Save to profile manager
    if (profileManager.saveGame(profileId, savedGame)) {
      console.log(`[SAVE] Game saved successfully for profile ${profileId}`);
      const response = { success: true, savedGame: { id: savedGame.id, savedAt: savedGame.savedAt } };
      console.log('[SAVE] Sending response:', response);
      if (callback) callback(response);
    } else {
      console.log('[SAVE] profileManager.saveGame returned false');
      if (callback) callback({ error: 'Failed to save game' });
    }
  });

  /**
   * Check if a profile has a saved game
   */
  socket.on('checkSavedGame', (data: { profileId: string }, callback?: Function) => {
    const { profileId } = data;

    const savedGame = profileManager.getSavedGame(profileId);
    if (savedGame) {
      if (callback) callback({
        hasSavedGame: true,
        savedGame: {
          id: savedGame.id,
          savedAt: savedGame.savedAt,
          currentRound: savedGame.currentRound,
          playerScore: savedGame.playerScore,
          aiOpponents: savedGame.aiOpponents
        }
      });
    } else {
      if (callback) callback({ hasSavedGame: false });
    }
  });

  /**
   * Load and resume a saved game
   */
  socket.on('loadSavedGame', (data: { profileId: string; playerName: string }, callback?: Function) => {
    const { profileId, playerName } = data;

    // Get the saved game
    const savedGame = profileManager.getSavedGame(profileId);
    if (!savedGame) {
      if (callback) callback({ error: 'No saved game found' });
      return;
    }

    // Create a new room for the restored game
    const roomId = gameManager.generateRoomId();
    gameManager.createRoom(roomId);

    // Update socket data
    socketData.roomId = roomId;
    socketData.playerName = playerName;
    socketData.profileId = profileId;
    socket.join(roomId);

    // Add the human player to the room first
    gameManager.addPlayerToRoom(roomId, socket.id, playerName, profileId);

    // Restore the game state
    if (!gameManager.restoreGameFromSave(roomId, socket.id, savedGame.gameState, aiManager)) {
      gameManager.deleteRoom(roomId);
      if (callback) callback({ error: 'Failed to restore game state' });
      return;
    }

    // Store profile ID for stats tracking
    const room = gameManager.getRoom(roomId);
    if (room) {
      room.playerProfileIds.set(socket.id, profileId);
    }

    // Delete the saved game after successfully loading
    profileManager.deleteSavedGame(profileId);

    console.log(`[Room ${roomId}] Restored saved game for ${playerName}`);

    if (callback) callback({ success: true, roomId });

    // Send game state to the player
    broadcastGameState(io, gameManager, roomId);
  });

  /**
   * Delete a saved game without loading it
   */
  socket.on('deleteSavedGame', (data: { profileId: string }, callback?: Function) => {
    const { profileId } = data;

    if (profileManager.deleteSavedGame(profileId)) {
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ error: 'No saved game found' });
    }
  });

  // Return socket data getter and setter for other handlers
  return {
    getSocketData: () => socketData,
    setSocketData: (data: Partial<SocketData>) => {
      if (data.roomId !== undefined) socketData.roomId = data.roomId;
      if (data.playerName !== undefined) socketData.playerName = data.playerName;
      if (data.profileId !== undefined) socketData.profileId = data.profileId;
    }
  };
}
