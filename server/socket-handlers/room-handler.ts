/**
 * Hawaiian Rummy - Room Socket Handlers
 * Handles room creation, joining, and lobby management
 */

import { Server, Socket } from 'socket.io';
import { GameManager, DISCONNECT_GRACE_PERIOD, DisconnectedPlayer } from '../game-manager';
import { broadcastGameState, initializeTutorialGame } from './game-handler';
import { AIManager } from '../ai/ai-manager';
import type { Card, Rank, Suit } from '../../shared/game-engine/types';

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
  const state = gameManager.getGameState(roomId);
  if (!state) return null;

  return {
    roomId,
    players: state.players.map(id => ({
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
  socket.on('createRoom', (playerName: string, tutorialMode: boolean, callback?: Function) => {
    console.log('[SERVER] createRoom received from socket:', socket.id, 'playerName:', playerName, 'tutorialMode:', tutorialMode);
    const roomId = gameManager.generateRoomId();
    gameManager.createRoom(roomId);

    socketData.roomId = roomId;
    socketData.playerName = playerName;
    socket.join(roomId);
    console.log('[DEBUG] socketData set:', socketData);

    // Add player to room
    gameManager.addPlayerToRoom(roomId, socket.id, playerName);

    // Set tutorial mode
    const room = gameManager.getRoom(roomId);
    if (room) {
      room.state.tutorialMode = tutorialMode || false;
    }

    console.log(`[Room ${roomId}] ${playerName} created room. Tutorial mode: ${tutorialMode}`);

    logAnalytics(tutorialMode ? 'tutorial_started' : 'game_created', {
      roomId,
      playerName,
      tutorialMode
    });

    if (callback) {
      callback({ roomId, tutorialMode: room?.state.tutorialMode });
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
  socket.on('joinGame', (data: { playerName: string; roomId: string }, callback?: Function) => {
    const { playerName, roomId } = data;

    const room = gameManager.getOrCreateRoom(roomId);
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
    socket.join(roomId);

    gameManager.addPlayerToRoom(roomId, socket.id, playerName);

    console.log(`[Room ${roomId}] ${playerName} joined. Players: ${state?.players.length || 0 + 1}`);

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

  // Return socket data getter for other handlers
  return {
    getSocketData: () => socketData
  };
}
