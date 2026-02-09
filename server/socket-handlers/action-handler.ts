/**
 * Hawaiian Rummy - Action Socket Handlers
 * Handles game actions (draw, meld, discard, layoff)
 */

import { Server, Socket } from 'socket.io';
import { GameManager } from '../game-manager';
import {
  DrawCardAction,
  TakeDiscardAction,
  CreateMeldAction,
  CancelMeldsAction,
  LayoffCardAction,
  DiscardAction,
  ReorderHandAction,
  MeldType
} from '../../shared/game-engine/types';

export interface ActionHandlerDeps {
  io: Server;
  gameManager: GameManager;
  getSocketData: () => { roomId?: string; playerName?: string; playerId: string };
  broadcastGameState: (roomId: string) => void;
}

/**
 * Set up action-related socket handlers
 */
export function setupActionHandlers(socket: Socket, deps: ActionHandlerDeps) {
  const { io, gameManager, getSocketData, broadcastGameState } = deps;

  /**
   * Draw a card from the deck
   */
  socket.on('drawCard', () => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const action: DrawCardAction = {
      type: 'DRAW_CARD',
      playerId: socket.id
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      socket.emit('error', result.error);
      return;
    }

    broadcastGameState(roomId);
  });

  /**
   * Take a card from the discard pile
   */
  socket.on('takeDiscard', () => {
    const { roomId, playerName } = getSocketData();
    if (!roomId) return;

    // Log the attempt for debugging
    const currentState = gameManager.getGameState(roomId);
    const buyWindowRemaining = gameManager.getBuyWindowRemaining(roomId);
    console.log(`[ACTION] ${playerName} attempting takeDiscard:`);
    console.log(`  - phase: ${currentState?.gamePhase}`);
    console.log(`  - buyJustProcessed: ${currentState?.buyJustProcessed}`);
    console.log(`  - buyWindow active: ${gameManager.isBuyWindowActive(roomId)} (${buyWindowRemaining}s remaining)`);
    console.log(`  - buyRequests: ${currentState?.buyRequests.length}`);
    console.log(`  - lastDiscardTimestamp: ${currentState?.lastDiscardTimestamp}`);

    const action: TakeDiscardAction = {
      type: 'TAKE_DISCARD',
      playerId: socket.id
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      console.log(`[ACTION] takeDiscard FAILED: ${result.error}`);
      socket.emit('error', result.error);
      return;
    }

    console.log(`[ACTION] ${playerName} took discard successfully`);

    // Notify players who had buy requests that current player took the card
    const state = gameManager.getGameState(roomId);
    if (state && result.sideEffects) {
      for (const effect of result.sideEffects) {
        if (effect.type === 'BUY_PROCESSED') {
          // Player took the discard, notify others their buy was cancelled
          state.players.forEach(playerId => {
            if (playerId !== socket.id) {
              const playerSocket = io.sockets.sockets.get(playerId);
              if (playerSocket) {
                playerSocket.emit('buyNotification', {
                  type: 'denied',
                  message: `✗ ${getSocketData().playerName} took the discard - buy cancelled`
                });
              }
            }
          });
        }
      }
    }

    broadcastGameState(roomId);
  });

  /**
   * Create a meld
   */
  socket.on('createMeld', (
    data: { type: MeldType; cardIds: string[]; wildcardPlacement?: number; wildcardPositions?: { wildcardPlacement?: string } },
    callback?: Function
  ) => {
    const { roomId } = getSocketData();
    if (!roomId) {
      if (callback) callback({ success: false, error: 'No room' });
      return;
    }

    // Handle wildcardPlacement from either direct value or wildcardPositions object
    let wildcardPlacement = data.wildcardPlacement;
    if (wildcardPlacement === undefined && data.wildcardPositions?.wildcardPlacement) {
      wildcardPlacement = parseInt(data.wildcardPositions.wildcardPlacement, 10);
    }

    const action: CreateMeldAction = {
      type: 'CREATE_MELD',
      playerId: socket.id,
      meldType: data.type,
      cardIds: data.cardIds,
      wildcardPlacement
    };

    const result = gameManager.processAction(roomId, action);
    console.log(`[SERVER] createMeld result: success=${result.success}, error=${result.error}, sideEffects=${JSON.stringify(result.sideEffects?.map(e => e.type))}`);

    if (!result.success) {
      // Check if we need wildcard position choice
      if (result.sideEffects?.some(e => e.type === 'NEEDS_WILDCARD_POSITION')) {
        const effect = result.sideEffects.find(e => e.type === 'NEEDS_WILDCARD_POSITION');
        if (effect && effect.type === 'NEEDS_WILDCARD_POSITION') {
          console.log(`[SERVER] Emitting needMeldWildcardPosition with ${effect.arrangements.length} arrangements`);
          socket.emit('needMeldWildcardPosition', {
            cardIds: data.cardIds,
            type: data.type,
            arrangements: effect.arrangements.map((a: any) => ({
              sequence: a.sequence,
              description: a.description
            }))
          });
          return;
        }
      }

      console.log(`[SERVER] Emitting error: ${result.error}`);
      socket.emit('error', result.error || 'Invalid meld');
      if (callback) callback({ success: false, error: result.error });
      return;
    }

    if (callback) callback({ success: true });
    broadcastGameState(roomId);
  });

  /**
   * Cancel melds
   */
  socket.on('cancelMelds', () => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const action: CancelMeldsAction = {
      type: 'CANCEL_MELDS',
      playerId: socket.id
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      socket.emit('error', result.error);
      return;
    }

    broadcastGameState(roomId);
  });

  /**
   * Layoff a card onto a meld
   */
  socket.on('layoffCard', (data: {
    cardId: string;
    meldOwnerId: string;
    meldIndex: number;
    wildcardPosition?: 'beginning' | 'end';
    wildcardToReplace?: string;
    wildcardNewPosition?: 'beginning' | 'end';
  }) => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const action: LayoffCardAction = {
      type: 'LAYOFF_CARD',
      playerId: socket.id,
      cardId: data.cardId,
      meldOwnerId: data.meldOwnerId,
      meldIndex: data.meldIndex,
      wildcardPosition: data.wildcardPosition,
      wildcardToReplace: data.wildcardToReplace,
      wildcardNewPosition: data.wildcardNewPosition
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      // Check if we need wildcard position choice
      if (result.sideEffects?.some(e => e.type === 'NEEDS_WILDCARD_POSITION')) {
        const effect = result.sideEffects.find(e => e.type === 'NEEDS_WILDCARD_POSITION');
        if (effect && effect.type === 'NEEDS_WILDCARD_POSITION') {
          console.log(`[SERVER] Layoff needs wildcard position: ${effect.arrangements.map((a: any) => a.sequence).join(', ')}`);
          socket.emit('needWildcardPosition', {
            validPositions: effect.arrangements.map((a: any) => a.sequence),
            cardId: data.cardId,
            meldOwnerId: data.meldOwnerId,
            meldIndex: data.meldIndex,
            wildcardToReplace: data.wildcardToReplace // Include for replacement case
          });
          return;
        }
      }

      console.log(`[SERVER] Layoff error: ${result.error}`);
      socket.emit('error', result.error);
      return;
    }

    broadcastGameState(roomId);
  });

  /**
   * Discard a card
   */
  socket.on('discard', (data: { cardId: string } | string) => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    // Handle both formats: { cardId: '...' } or just '...'
    const cardId = typeof data === 'string' ? data : data.cardId;

    const action: DiscardAction = {
      type: 'DISCARD',
      playerId: socket.id,
      cardId
    };

    const result = gameManager.processAction(roomId, action);

    if (!result.success) {
      socket.emit('error', result.error);
      return;
    }

    broadcastGameState(roomId);
  });

  /**
   * Reorder hand
   */
  socket.on('reorderHand', (data: { cardIds: string[] } | string[]) => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    // Handle both formats: { cardIds: [...] } or just [...]
    const cardIds = Array.isArray(data) ? data : data.cardIds;

    const action: ReorderHandAction = {
      type: 'REORDER_HAND',
      playerId: socket.id,
      cardIds
    };

    const result = gameManager.processAction(roomId, action);

    if (result.success) {
      broadcastGameState(roomId);
    }
  });

  /**
   * Continue to next round - handles both 'continue' and 'continueToNextRound' events
   */
  const handleContinue = () => {
    const { roomId } = getSocketData();
    if (!roomId) return;

    const result = gameManager.processAction(roomId, {
      type: 'CONTINUE_TO_NEXT_ROUND',
      playerId: socket.id
    });

    if (result.success) {
      broadcastGameState(roomId);
    }
  };

  socket.on('continue', handleContinue);
  socket.on('continueToNextRound', handleContinue);
}
