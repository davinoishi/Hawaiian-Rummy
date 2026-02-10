/**
 * useLocalGame - Hook for managing offline/local games against AI
 */

import { useCallback, useRef } from 'react';
import { useGameStore, useSocketStore } from '../store';
import {
  initLocalGame,
  startLocalGame,
  processLocalAction,
  cleanupLocalGame,
  isLocalGameRunning,
  getLocalPlayerId
} from '../services/local-game';
import type { GameAction, ClientGameState } from '@shared/game-engine/types';

export function useLocalGame() {
  const updateGameState = useGameStore((state) => state.updateGameState);
  const setRoomId = useGameStore((state) => state.setRoomId);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const setAppPhase = useGameStore((state) => state.setAppPhase);
  const reset = useGameStore((state) => state.reset);
  const saveGameSession = useSocketStore((state) => state.saveGameSession);

  // Track whether we're in local mode
  const isLocalModeRef = useRef(false);

  /**
   * Start a new local game against AI
   */
  const createLocalGame = useCallback((playerName: string, numAI: number = 3) => {
    // State change handler for local game
    const onStateChange = (state: ClientGameState) => {
      updateGameState(state);
    };

    // Initialize the local game
    const { roomId, playerId } = initLocalGame(playerName, numAI, onStateChange);

    // Update stores
    setPlayerName(playerName);
    setRoomId(roomId);
    isLocalModeRef.current = true;

    // Save session (for reconnection after page reload)
    saveGameSession(roomId, playerName);

    // Set app phase to lobby (briefly)
    setAppPhase('lobby');

    // Start the game after a short delay
    setTimeout(() => {
      startLocalGame();
    }, 500);

    return { roomId, playerId };
  }, [updateGameState, setRoomId, setPlayerName, setAppPhase, saveGameSession]);

  /**
   * Process an action in the local game
   */
  const submitLocalAction = useCallback((action: GameAction) => {
    if (!isLocalGameRunning()) {
      console.warn('[LocalGame] No local game running');
      return { success: false, error: 'No local game running' };
    }

    return processLocalAction(action);
  }, []);

  /**
   * Exit local game and cleanup
   */
  const exitLocalGame = useCallback(() => {
    cleanupLocalGame();
    isLocalModeRef.current = false;
    reset();
  }, [reset]);

  /**
   * Check if currently in local game mode
   */
  const isInLocalGame = useCallback(() => {
    return isLocalModeRef.current && isLocalGameRunning();
  }, []);

  /**
   * Get local player ID
   */
  const getPlayerId = useCallback(() => {
    return getLocalPlayerId();
  }, []);

  return {
    createLocalGame,
    submitLocalAction,
    exitLocalGame,
    isInLocalGame,
    getPlayerId
  };
}
