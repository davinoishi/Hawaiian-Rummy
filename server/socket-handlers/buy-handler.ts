/**
 * Hawaiian Rummy - Buy Socket Handlers
 * Handles buy requests, passes, and cancellations
 */

import { Server, Socket } from 'socket.io';
import { GameManager } from '../game-manager';
import {
  RequestBuyAction,
  CancelBuyAction,
  PassBuyAction
} from '../../shared/game-engine/types';

export interface BuyHandlerDeps {
  io: Server;
  gameManager: GameManager;
  getSocketData: () => { roomId?: string; playerName?: string; playerId: string };
  broadcastGameState: (roomId: string) => void;
}

/**
 * Set up buy-related socket handlers
 */
export function setupBuyHandlers(socket: Socket, deps: BuyHandlerDeps) {
  const { io, gameManager, getSocketData, broadcastGameState } = deps;

  /**
   * Request to buy the discard
   */
  socket.on('requestBuy', () => {
    const { roomId, playerName } = getSocketData();
    if (!roomId) return;

    const action: RequestBuyAction = {
      type: 'REQUEST_BUY',
      playerId: socket.id
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      socket.emit('error', result.error);
      return;
    }

    // Check for buy processed side effect
    if (result.sideEffects) {
      for (const effect of result.sideEffects) {
        if (effect.type === 'BUY_PROCESSED') {
          notifyBuyResult(io, gameManager, roomId, effect.buyerId, effect.cardId);
        }
      }
    }

    broadcastGameState(roomId);
  });

  /**
   * Cancel buy request
   */
  socket.on('cancelBuy', () => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const action: CancelBuyAction = {
      type: 'CANCEL_BUY',
      playerId: socket.id
    };

    const result = gameManager.processAction(roomId, action);

    if (result.success) {
      broadcastGameState(roomId);
    }
  });

  /**
   * Pass on buying
   */
  socket.on('passBuy', () => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const action: PassBuyAction = {
      type: 'PASS_BUY',
      playerId: socket.id
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      return;
    }

    // Check for buy processed side effect
    if (result.sideEffects) {
      for (const effect of result.sideEffects) {
        if (effect.type === 'BUY_PROCESSED') {
          notifyBuyResult(io, gameManager, roomId, effect.buyerId, effect.cardId);
        }
      }
    }

    broadcastGameState(roomId);
  });
}

/**
 * Notify all players about a buy result
 */
function notifyBuyResult(
  io: Server,
  gameManager: GameManager,
  roomId: string,
  buyerId: string,
  cardId: string
) {
  const state = gameManager.getGameState(roomId);
  if (!state) return;

  const buyerName = state.playerNames[buyerId] || 'Unknown';

  // Find the card that was bought
  const playerState = state.playerStates[buyerId];
  const boughtCard = playerState?.hand.find(c => c.id === cardId);
  const cardDisplay = boughtCard ? `${boughtCard.rank}${boughtCard.suit}` : 'card';

  // Notify all players
  state.players.forEach(playerId => {
    const playerSocket = io.sockets.sockets.get(playerId);
    if (!playerSocket) return;

    if (playerId === buyerId) {
      playerSocket.emit('buyNotification', {
        type: 'granted',
        message: `✓ You won the buy! (${cardDisplay})`
      });
    } else {
      // Check if this player had requested a buy
      const hadRequest = state.buyRequests.some(r => r.playerId === playerId);

      if (hadRequest) {
        playerSocket.emit('buyNotification', {
          type: 'denied',
          message: `✗ ${buyerName} won the buy (higher priority)`
        });
      } else {
        playerSocket.emit('buyNotification', {
          type: 'info',
          message: `${buyerName} bought ${cardDisplay}`
        });
      }
    }
  });
}
