/**
 * useSocketEvents - Hook for setting up socket event listeners
 */

import { useEffect, useRef } from 'react';
import { useSocketStore } from '../store/socket-store';
import { useGameStore } from '../store/game-store';
import type { Socket } from 'socket.io-client';
import { useUIStore } from '../store/ui-store';
import { useAudio } from './useAudio';
import { useHaptics } from './useHaptics';
import type { ClientGameState, ChatMessage } from '@shared/game-engine/types';

interface LobbyUpdate {
  roomId: string;
  players: Array<{ id: string; name: string }>;
  gameStarted: boolean;
}

interface TurnOrderData {
  phase: string;
  position: number;
  justSelected?: string;
  selectedOrder: Array<{ playerId: string; name: string; position: number }>;
  remainingPlayers: Array<{ playerId: string; name: string }>;
}

interface ErrorData {
  message: string;
}

interface BuyNotification {
  type: 'granted' | 'denied' | 'info';
  message: string;
}

interface PlayerDisconnectedData {
  playerId: string;
  playerName: string;
  gracePeriodEnds: number;
}

interface PlayerReconnectedData {
  playerId: string;
  playerName: string;
}

interface PlayerTakenOverByAIData {
  originalPlayerId: string;
  newPlayerId: string;
  playerName: string;
}

interface RematchVoteUpdateData {
  votes: string[];
  votedCount: number;
  total: number;
}

interface PasswordRequiredData {
  roomId: string;
}

export function useSocketEvents() {
  const socket = useSocketStore((state) => state.socket);

  // Store callbacks in refs to avoid effect re-runs
  const callbacksRef = useRef({
    updateLobby: useGameStore.getState().updateLobby,
    updateGameState: useGameStore.getState().updateGameState,
    updateTurnOrder: useGameStore.getState().updateTurnOrder,
    setTurnOrderCountdown: useGameStore.getState().setTurnOrderCountdown,
    setAppPhase: useGameStore.getState().setAppPhase,
    addDisconnectedPlayer: useGameStore.getState().addDisconnectedPlayer,
    removeDisconnectedPlayer: useGameStore.getState().removeDisconnectedPlayer,
    clearDisconnectedPlayers: useGameStore.getState().clearDisconnectedPlayers,
    addChatMessage: useGameStore.getState().addChatMessage,
    clearChatMessages: useGameStore.getState().clearChatMessages,
    setRematchVotes: useGameStore.getState().setRematchVotes,
    setHasVotedForRematch: useGameStore.getState().setHasVotedForRematch,
    saveGameSession: useSocketStore.getState().saveGameSession,
    clearGameSession: useSocketStore.getState().clearGameSession,
    setBuyNotification: useUIStore.getState().setBuyNotification,
    setErrorMessage: useUIStore.getState().setErrorMessage,
    setShowConfetti: useUIStore.getState().setShowConfetti,
    clearSelection: useUIStore.getState().clearSelection,
    setWildcardPositionPrompt: useUIStore.getState().setWildcardPositionPrompt,
    setMeldWildcardPositionPrompt: useUIStore.getState().setMeldWildcardPositionPrompt
  });

  // Audio and haptics
  const audio = useAudio();
  const haptics = useHaptics();
  const audioRef = useRef(audio);
  const hapticsRef = useRef(haptics);

  // Keep refs updated
  audioRef.current = audio;
  hapticsRef.current = haptics;

  // Track if listeners are registered
  const listenersRegistered = useRef(false);

  useEffect(() => {
    if (!socket) {
      console.log('[useSocketEvents] No socket available');
      return;
    }

    // Prevent duplicate listener registration
    if (listenersRegistered.current) {
      console.log('[useSocketEvents] Listeners already registered');
      return;
    }

    console.log('[useSocketEvents] Registering event listeners for socket:', socket.id);
    listenersRegistered.current = true;

    const callbacks = callbacksRef.current;

    // Lobby events
    const handleLobbyUpdate = (data: LobbyUpdate) => {
      console.log('[CLIENT] lobbyUpdate received:', data);
      callbacks.updateLobby(data);

      // Save game session for reconnection
      const playerName = useGameStore.getState().playerName;
      if (data.roomId && playerName) {
        callbacks.saveGameSession(data.roomId, playerName);
      }
    };

    const handleGameStarted = () => {
      console.log('[CLIENT] gameStarted received');
      callbacks.setAppPhase('playing');
    };

    // Turn order events
    const handleTurnOrder = (data: TurnOrderData) => {
      console.log('[CLIENT] turnOrderUpdate received:', data.phase);
      callbacks.updateTurnOrder(data);
    };

    const handleTurnOrderCountdown = (count: number) => {
      console.log('[CLIENT] turnOrderCountdown received:', count);
      callbacks.setTurnOrderCountdown(count);
    };

    // Game state events
    const handleGameState = (state: ClientGameState) => {
      console.log('[CLIENT] gameState received, phase:', state.gamePhase);
      const previousState = useGameStore.getState();
      const wasMyTurn = previousState.isMyTurn;

      callbacks.updateGameState(state);

      // Play turn start sound/haptic
      if (state.isMyTurn && !wasMyTurn) {
        audioRef.current.playTurnStart();
        hapticsRef.current.turnStart();
      }

      // Handle round end
      if (state.gamePhase === 'roundSummary') {
        audioRef.current.playRoundEnd();
        hapticsRef.current.roundEnd();
      }

      // Handle game over
      if (state.gamePhase === 'gameOver') {
        // Clear game session when game ends
        callbacks.clearGameSession();
        callbacks.clearDisconnectedPlayers();

        if (state.isWinner) {
          audioRef.current.playGameWin();
          hapticsRef.current.gameWin();
          callbacks.setShowConfetti(true);
        }
      }
    };

    // Buy events
    const handleBuyNotification = (data: BuyNotification) => {
      callbacks.setBuyNotification(data);

      if (data.type === 'granted') {
        audioRef.current.playBuyGranted();
        hapticsRef.current.buyGranted();
      } else if (data.type === 'denied') {
        audioRef.current.playBuyDenied();
        hapticsRef.current.buyDenied();
      }

      // Auto-clear notification
      setTimeout(() => {
        callbacks.setBuyNotification(null);
      }, 3000);
    };

    // Error events - server sends string, not object
    const handleError = (data: string | ErrorData) => {
      const message = typeof data === 'string' ? data : data.message;
      callbacks.setErrorMessage(message);
      audioRef.current.playError();
      hapticsRef.current.error();

      // Auto-clear error
      setTimeout(() => {
        callbacks.setErrorMessage(null);
      }, 4000);
    };

    // Action feedback events
    const handleMeldCreated = () => {
      callbacks.clearSelection();
    };

    const handleActionRejected = (data: ErrorData) => {
      handleError(data);
    };

    // Wildcard position prompts
    const handleNeedMeldWildcardPosition = (data: {
      cardIds: string[];
      type: 'set' | 'run';
      arrangements: Array<{ sequence: string; description?: string }>;
    }) => {
      console.log('[CLIENT] needMeldWildcardPosition received:', data);
      callbacks.setMeldWildcardPositionPrompt({
        cardIds: data.cardIds,
        type: data.type,
        arrangements: data.arrangements
      });
    };

    const handleNeedWildcardPosition = (data: {
      validPositions: string[];
      cardId: string;
      meldOwnerId: string;
      meldIndex: number;
      wildcardToReplace?: string;
    }) => {
      console.log('[CLIENT] needWildcardPosition received:', data);
      callbacks.setWildcardPositionPrompt({
        validPositions: data.validPositions,
        cardId: data.cardId,
        meldOwnerId: data.meldOwnerId,
        meldIndex: data.meldIndex,
        wildcardToReplace: data.wildcardToReplace
      });
    };

    // Disconnect/reconnect events
    const handlePlayerDisconnected = (data: PlayerDisconnectedData) => {
      console.log('[CLIENT] playerDisconnected received:', data);
      callbacks.addDisconnectedPlayer({
        playerId: data.playerId,
        playerName: data.playerName,
        gracePeriodEnds: data.gracePeriodEnds
      });
    };

    const handlePlayerReconnected = (data: PlayerReconnectedData) => {
      console.log('[CLIENT] playerReconnected received:', data);
      callbacks.removeDisconnectedPlayer(data.playerId);
    };

    const handlePlayerTakenOverByAI = (data: PlayerTakenOverByAIData) => {
      console.log('[CLIENT] playerTakenOverByAI received:', data);
      callbacks.removeDisconnectedPlayer(data.originalPlayerId);
    };

    // Game join error events
    const handleGameAlreadyStarted = () => {
      console.log('[CLIENT] gameAlreadyStarted received');
      callbacks.setErrorMessage('This game has already started');
      useGameStore.getState().setAppPhase('join');
    };

    const handleGameFull = () => {
      console.log('[CLIENT] gameFull received');
      callbacks.setErrorMessage('This game is full (4 players max)');
      useGameStore.getState().setAppPhase('join');
    };

    // Password events
    const handlePasswordRequired = (data: PasswordRequiredData) => {
      console.log('[CLIENT] passwordRequired received:', data);
      callbacks.setErrorMessage('This room requires a password');
    };

    const handleInvalidPassword = (data: PasswordRequiredData) => {
      console.log('[CLIENT] invalidPassword received:', data);
      callbacks.setErrorMessage('Invalid password');
    };

    // Chat events
    const handleChatMessage = (msg: ChatMessage) => {
      console.log('[CLIENT] chatMessage received:', msg.playerName);
      callbacks.addChatMessage(msg);
    };

    // Rematch events
    const handleRematchVoteUpdate = (data: RematchVoteUpdateData) => {
      console.log('[CLIENT] rematchVoteUpdate received:', data);
      callbacks.setRematchVotes(data);
    };

    const handleRematchStarting = () => {
      console.log('[CLIENT] rematchStarting received');
      callbacks.setRematchVotes(null);
      callbacks.setHasVotedForRematch(false);
      callbacks.clearChatMessages();
      useGameStore.getState().setAppPhase('lobby');
    };

    // Register event listeners
    socket.on('lobbyUpdate', handleLobbyUpdate);
    socket.on('gameStarted', handleGameStarted);
    socket.on('turnOrderUpdate', handleTurnOrder);
    socket.on('turnOrderCountdown', handleTurnOrderCountdown);
    socket.on('gameState', handleGameState);
    socket.on('buyNotification', handleBuyNotification);
    socket.on('error', handleError);
    socket.on('meldCreated', handleMeldCreated);
    socket.on('actionRejected', handleActionRejected);
    socket.on('needMeldWildcardPosition', handleNeedMeldWildcardPosition);
    socket.on('needWildcardPosition', handleNeedWildcardPosition);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('playerReconnected', handlePlayerReconnected);
    socket.on('playerTakenOverByAI', handlePlayerTakenOverByAI);
    socket.on('gameAlreadyStarted', handleGameAlreadyStarted);
    socket.on('gameFull', handleGameFull);
    socket.on('passwordRequired', handlePasswordRequired);
    socket.on('invalidPassword', handleInvalidPassword);
    socket.on('chatMessage', handleChatMessage);
    socket.on('rematchVoteUpdate', handleRematchVoteUpdate);
    socket.on('rematchStarting', handleRematchStarting);

    console.log('[useSocketEvents] All listeners registered');

    // Cleanup
    return () => {
      console.log('[useSocketEvents] Cleaning up listeners');
      listenersRegistered.current = false;
      socket.off('lobbyUpdate', handleLobbyUpdate);
      socket.off('gameStarted', handleGameStarted);
      socket.off('turnOrderUpdate', handleTurnOrder);
      socket.off('turnOrderCountdown', handleTurnOrderCountdown);
      socket.off('gameState', handleGameState);
      socket.off('buyNotification', handleBuyNotification);
      socket.off('error', handleError);
      socket.off('meldCreated', handleMeldCreated);
      socket.off('actionRejected', handleActionRejected);
      socket.off('needMeldWildcardPosition', handleNeedMeldWildcardPosition);
      socket.off('needWildcardPosition', handleNeedWildcardPosition);
      socket.off('playerDisconnected', handlePlayerDisconnected);
      socket.off('playerReconnected', handlePlayerReconnected);
      socket.off('playerTakenOverByAI', handlePlayerTakenOverByAI);
      socket.off('gameAlreadyStarted', handleGameAlreadyStarted);
      socket.off('gameFull', handleGameFull);
      socket.off('passwordRequired', handlePasswordRequired);
      socket.off('invalidPassword', handleInvalidPassword);
      socket.off('chatMessage', handleChatMessage);
      socket.off('rematchVoteUpdate', handleRematchVoteUpdate);
      socket.off('rematchStarting', handleRematchStarting);
    };
  }, [socket]); // Only depend on socket
}
