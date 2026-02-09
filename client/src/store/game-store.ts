/**
 * Game Store - Manages game state received from server
 */

import { create } from 'zustand';
import type {
  ClientGameState,
  ClientPlayer,
  Card,
  Meld,
  BuyRequest,
  GamePhase
} from '@shared/game-engine/types';

interface GameState extends Partial<ClientGameState> {
  // Connection state
  roomId: string | null;
  playerName: string | null;

  // Lobby state
  lobbyPlayers: Array<{ id: string; name: string }>;

  // Game phase for UI
  appPhase: 'join' | 'lobby' | 'turnOrder' | 'playing' | 'roundSummary' | 'gameOver';

  // Turn order animation data
  turnOrderData: {
    phase: string;
    position: number;
    justSelected?: string;
    selectedOrder: Array<{ playerId: string; name: string; position: number }>;
    remainingPlayers: Array<{ playerId: string; name: string }>;
  } | null;
  turnOrderCountdown: number | null;

  // Actions
  setRoomId: (roomId: string | null) => void;
  setPlayerName: (name: string) => void;
  setAppPhase: (phase: GameState['appPhase']) => void;
  updateLobby: (data: { roomId: string; players: Array<{ id: string; name: string }>; gameStarted: boolean }) => void;
  updateGameState: (state: ClientGameState) => void;
  updateTurnOrder: (data: GameState['turnOrderData']) => void;
  setTurnOrderCountdown: (count: number | null) => void;
  reset: () => void;
}

const initialState = {
  roomId: null,
  playerName: null,
  lobbyPlayers: [],
  appPhase: 'join' as const,
  turnOrderData: null,
  turnOrderCountdown: null,

  // Game state
  players: [],
  myHand: [],
  myMelds: [],
  discardPile: [],
  deckSize: 0,
  currentPlayerIndex: 0,
  currentRound: 0,
  gamePhase: undefined,
  isMyTurn: false,
  hasMetRequirements: false,
  buyRequests: [],
  myBuyCount: 0,
  maxBuys: 3,
  canBuy: false,
  canDraw: false,
  canTakeDiscard: false,
  shouldShowPass: false,
  hasBuyRequest: false,
  hasPassed: false,
  nextPlayerToBuy: null,
  winner: null,
  isWinner: false,
  continueClicked: [],
  hasContinued: false,
  buyWindowActive: false,
  buyWindowRemaining: 0,
  buyJustProcessed: false,
  tutorialMode: false,
  tutorialStep: 0,
};

export const useGameStore = create<GameState>((set) => ({
  ...initialState,

  setRoomId: (roomId) => set({ roomId }),

  setPlayerName: (name) => set({ playerName: name }),

  setAppPhase: (phase) => set({ appPhase: phase }),

  updateLobby: (data) => set({
    roomId: data.roomId,
    lobbyPlayers: data.players,
    appPhase: data.gameStarted ? 'playing' : 'lobby'
  }),

  updateGameState: (state) => set({
    ...state,
    appPhase: state.gamePhase === 'gameOver'
      ? 'gameOver'
      : state.gamePhase === 'roundSummary'
        ? 'roundSummary'
        : 'playing'
  }),

  updateTurnOrder: (data) => set({
    turnOrderData: data,
    appPhase: 'turnOrder'
  }),

  setTurnOrderCountdown: (count) => set({ turnOrderCountdown: count }),

  reset: () => set(initialState)
}));

// Selectors
export const selectCurrentPlayer = (state: GameState): ClientPlayer | undefined =>
  state.players?.[state.currentPlayerIndex ?? 0];

export const selectMyPlayer = (state: GameState): ClientPlayer | undefined =>
  state.players?.find(p => p.isMe);

export const selectOpponents = (state: GameState): ClientPlayer[] => {
  if (!state.players) return [];

  // Find my position
  const myIndex = state.players.findIndex(p => p.isMe);
  if (myIndex === -1) return state.players.filter(p => !p.isMe);

  // Get opponents in turn order (starting from the player after me)
  const opponents: ClientPlayer[] = [];
  const numPlayers = state.players.length;

  for (let i = 1; i < numPlayers; i++) {
    const playerIndex = (myIndex + i) % numPlayers;
    const player = state.players[playerIndex];
    if (!player.isMe) {
      opponents.push(player);
    }
  }

  return opponents;
};

export const selectTopDiscard = (state: GameState): Card | undefined =>
  state.discardPile?.[state.discardPile.length - 1];
