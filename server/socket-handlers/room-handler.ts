/**
 * Hawaiian Rummy - Room Socket Handlers
 * Handles room creation, joining, and lobby management
 */

import { Server, Socket } from 'socket.io';
import { GameManager } from '../game-manager';
import { broadcastGameState, initializeTutorialGame } from './game-handler';
import type { Card, Rank, Suit } from '../../shared/game-engine/types';

export interface RoomHandlerDeps {
  io: Server;
  gameManager: GameManager;
  logAnalytics: (event: string, data?: any) => void;
  spawnAIPlayers?: (roomId: string, maxAI?: number) => void;
}

export interface SocketData {
  roomId?: string;
  playerName?: string;
  playerId: string;
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
  const { io, gameManager, logAnalytics, spawnAIPlayers } = deps;

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

    const { roomId } = socketData;
    if (!roomId) return;

    gameManager.removePlayerFromRoom(roomId, socket.id);

    // Broadcast lobby update
    const lobbyUpdate = getLobbyUpdate(gameManager, roomId);
    if (lobbyUpdate) {
      io.to(roomId).emit('lobbyUpdate', lobbyUpdate);
    }
  });

  // Return socket data getter for other handlers
  return {
    getSocketData: () => socketData
  };
}
