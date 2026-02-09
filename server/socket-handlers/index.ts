/**
 * Hawaiian Rummy - Socket Handlers Index
 * Aggregates all socket handlers
 */

import { Server, Socket } from 'socket.io';
import { GameManager } from '../game-manager';
import { setupRoomHandlers } from './room-handler';
import { setupGameHandlers, createBroadcastFunction } from './game-handler';
import { setupActionHandlers } from './action-handler';
import { setupBuyHandlers } from './buy-handler';

export interface SocketHandlersDeps {
  io: Server;
  gameManager: GameManager;
  logAnalytics: (event: string, data?: any) => void;
  spawnAIPlayers?: (roomId: string, maxAI?: number) => void;
}

/**
 * Set up all socket handlers for a connection
 */
export function setupSocketHandlers(socket: Socket, deps: SocketHandlersDeps) {
  const { io, gameManager, logAnalytics, spawnAIPlayers } = deps;

  // Create broadcast function
  const broadcastGameState = createBroadcastFunction(io, gameManager);

  // Set up room handlers and get socket data getter
  const { getSocketData } = setupRoomHandlers(socket, {
    io,
    gameManager,
    logAnalytics,
    spawnAIPlayers
  });

  // Set up game handlers
  setupGameHandlers(socket, {
    io,
    gameManager,
    getSocketData,
    logAnalytics,
    spawnAIPlayers
  });

  // Set up action handlers
  setupActionHandlers(socket, {
    io,
    gameManager,
    getSocketData,
    broadcastGameState
  });

  // Set up buy handlers
  setupBuyHandlers(socket, {
    io,
    gameManager,
    getSocketData,
    broadcastGameState
  });
}

export { broadcastGameState, initializeTutorialGame } from './game-handler';
