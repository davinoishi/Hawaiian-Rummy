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
  GamePhase,
  ChatMessage
} from '@shared/game-engine/types';

// Disconnected player info for UI
interface DisconnectedPlayerInfo {
  playerId: string;
  playerName: string;
  gracePeriodEnds: number;
}

// Rematch vote state
interface RematchVoteState {
  votes: string[];
  votedCount: number;
  total: number;
}

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

  // Disconnected players tracking
  disconnectedPlayers: DisconnectedPlayerInfo[];

  // Chat state
  chatMessages: ChatMessage[];
  unreadChatCount: number;
  chatOpen: boolean;

  // Rematch state
  rematchVotes: RematchVoteState | null;
  hasVotedForRematch: boolean;

  // Room password (for invite links)
  roomPassword: string | null;

  // Actions
  setRoomId: (roomId: string | null) => void;
  setPlayerName: (name: string) => void;
  setAppPhase: (phase: GameState['appPhase']) => void;
  updateLobby: (data: { roomId: string; players: Array<{ id: string; name: string }>; gameStarted: boolean }) => void;
  updateGameState: (state: ClientGameState) => void;
  updateTurnOrder: (data: GameState['turnOrderData']) => void;
  setTurnOrderCountdown: (count: number | null) => void;
  addDisconnectedPlayer: (info: DisconnectedPlayerInfo) => void;
  removeDisconnectedPlayer: (playerId: string) => void;
  clearDisconnectedPlayers: () => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChatMessages: () => void;
  setChatOpen: (open: boolean) => void;
  setRematchVotes: (votes: RematchVoteState | null) => void;
  setHasVotedForRematch: (voted: boolean) => void;
  setRoomPassword: (password: string | null) => void;
  reset: () => void;
}

const initialState = {
  roomId: null,
  playerName: null,
  lobbyPlayers: [],
  appPhase: 'join' as const,
  turnOrderData: null,
  turnOrderCountdown: null,
  disconnectedPlayers: [],
  chatMessages: [] as ChatMessage[],
  unreadChatCount: 0,
  chatOpen: false,
  rematchVotes: null as RematchVoteState | null,
  hasVotedForRematch: false,
  roomPassword: null as string | null,

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

  updateGameState: (state) => set((prev) => ({
    ...prev,
    ...state,
    appPhase: state.gamePhase === 'gameOver'
      ? 'gameOver'
      : state.gamePhase === 'roundSummary'
        ? 'roundSummary'
        : 'playing'
  })),

  updateTurnOrder: (data) => set({
    turnOrderData: data,
    appPhase: 'turnOrder'
  }),

  setTurnOrderCountdown: (count) => set({ turnOrderCountdown: count }),

  addDisconnectedPlayer: (info) => set((state) => ({
    disconnectedPlayers: [
      ...state.disconnectedPlayers.filter(p => p.playerId !== info.playerId),
      info
    ]
  })),

  removeDisconnectedPlayer: (playerId) => set((state) => ({
    disconnectedPlayers: state.disconnectedPlayers.filter(p => p.playerId !== playerId)
  })),

  clearDisconnectedPlayers: () => set({ disconnectedPlayers: [] }),

  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, msg].slice(-100), // Keep last 100 messages
    unreadChatCount: state.chatOpen ? 0 : state.unreadChatCount + 1
  })),

  clearChatMessages: () => set({ chatMessages: [], unreadChatCount: 0 }),

  setChatOpen: (open) => set((state) => ({
    chatOpen: open,
    unreadChatCount: open ? 0 : state.unreadChatCount
  })),

  setRematchVotes: (votes) => set({ rematchVotes: votes }),

  setHasVotedForRematch: (voted) => set({ hasVotedForRematch: voted }),

  setRoomPassword: (password) => set({ roomPassword: password }),

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
