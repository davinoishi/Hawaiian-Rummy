/**
 * Hawaiian Rummy - Core Types
 * Isomorphic types used by server, client, and AI
 */

// ===== CARD TYPES =====

export type Suit = '♠' | '♥' | '♦' | '♣' | '';

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isWild: boolean;
}

// ===== MELD TYPES =====

export type MeldType = 'set' | 'run';

export interface Meld {
  type: MeldType;
  cards: Card[];
}

// ===== ROUND REQUIREMENT TYPES =====

export interface RoundRequirement {
  sets: number;
  setSizes: number[];
  runs: number;
  runSizes: number[];
  totalCards: number;
  maxBuys: number;
  description: string;
}

// ===== PLAYER TYPES =====

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
}

export interface PlayerState {
  hand: Card[];
  melds: Meld[];
  score: number;
  roundScores: number[];
  roundsWon: number;
  buyCount: number;
  hasMetRequirements: boolean;
}

// ===== BUY REQUEST TYPES =====

export interface BuyRequest {
  playerId: string;
  timestamp: number;
}

// ===== GAME PHASE TYPES =====

export type GamePhase =
  | 'lobby'
  | 'turnOrder'
  | 'draw'
  | 'meld'
  | 'discard'
  | 'roundSummary'
  | 'gameOver';

// ===== GAME STATE TYPES =====

export interface GameState {
  // Players
  players: string[];
  playerNames: Record<string, string>;
  playerStates: Record<string, PlayerState>;

  // Game progression
  gameStarted: boolean;
  gamePhase: GamePhase;
  currentPlayerIndex: number;
  currentRound: number;

  // Deck and discard
  deck: Card[];
  discardPile: Card[];

  // Buy system
  buyRequests: BuyRequest[];
  passedBuy: string[];
  buyJustProcessed: boolean;
  lastDiscarder: string | null;
  lastDiscardTimestamp: number | null;

  // Round continuation
  continueClicked: string[];

  // Tutorial mode
  tutorialMode: boolean;
  tutorialStep?: number;
}

// ===== ACTION TYPES =====

export type ActionType =
  | 'DRAW_CARD'
  | 'TAKE_DISCARD'
  | 'CREATE_MELD'
  | 'CANCEL_MELDS'
  | 'LAYOFF_CARD'
  | 'DISCARD'
  | 'REQUEST_BUY'
  | 'CANCEL_BUY'
  | 'PASS_BUY'
  | 'CONTINUE_TO_NEXT_ROUND'
  | 'REORDER_HAND';

export interface BaseAction {
  type: ActionType;
  playerId: string;
}

export interface DrawCardAction extends BaseAction {
  type: 'DRAW_CARD';
}

export interface TakeDiscardAction extends BaseAction {
  type: 'TAKE_DISCARD';
}

export interface CreateMeldAction extends BaseAction {
  type: 'CREATE_MELD';
  meldType: MeldType;
  cardIds: string[];
  wildcardPlacement?: number | 'beginning' | 'end';
}

export interface CancelMeldsAction extends BaseAction {
  type: 'CANCEL_MELDS';
}

export interface LayoffCardAction extends BaseAction {
  type: 'LAYOFF_CARD';
  cardId: string;
  meldOwnerId: string;
  meldIndex: number;
  wildcardPosition?: 'beginning' | 'end';
  wildcardToReplace?: string;
  wildcardNewPosition?: 'beginning' | 'end';
}

export interface DiscardAction extends BaseAction {
  type: 'DISCARD';
  cardId: string;
}

export interface RequestBuyAction extends BaseAction {
  type: 'REQUEST_BUY';
}

export interface CancelBuyAction extends BaseAction {
  type: 'CANCEL_BUY';
}

export interface PassBuyAction extends BaseAction {
  type: 'PASS_BUY';
}

export interface ContinueToNextRoundAction extends BaseAction {
  type: 'CONTINUE_TO_NEXT_ROUND';
}

export interface ReorderHandAction extends BaseAction {
  type: 'REORDER_HAND';
  cardIds: string[];
}

export type GameAction =
  | DrawCardAction
  | TakeDiscardAction
  | CreateMeldAction
  | CancelMeldsAction
  | LayoffCardAction
  | DiscardAction
  | RequestBuyAction
  | CancelBuyAction
  | PassBuyAction
  | ContinueToNextRoundAction
  | ReorderHandAction;

// ===== ACTION RESULT TYPES =====

export interface ActionResult {
  success: boolean;
  error?: string;
  newState: GameState;
  sideEffects?: ActionSideEffect[];
}

export type ActionSideEffect =
  | { type: 'ROUND_ENDED'; winnerId: string }
  | { type: 'GAME_ENDED'; winnerId: string }
  | { type: 'BUY_PROCESSED'; buyerId: string; cardId: string }
  | { type: 'REQUIREMENTS_MET'; playerId: string }
  | { type: 'NEEDS_WILDCARD_POSITION'; arrangements: WildcardArrangement[] }
  | { type: 'NEXT_TURN' };

export interface WildcardArrangement {
  sequence: string;
  description: string;
  startValue: number;
  endValue: number;
  aceHigh: boolean;
  values: number[];
}

// ===== VALIDATION RESULT TYPES =====

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ===== CLIENT GAME STATE (what gets sent to players) =====

export interface ClientPlayer {
  id: string;
  name: string;
  handSize: number;
  score: number;
  melds: Meld[];
  buyCount: number;
  roundsWon: number;
  wins: number; // Alias for roundsWon for backwards compatibility
  roundScores: number[];
  isMe: boolean;
  hasMetRequirements: boolean;
}

export interface ClientGameState {
  players: ClientPlayer[];
  myHand: Card[];
  myMelds: Meld[];
  discardPile: Card[];
  deckSize: number;
  currentPlayerIndex: number;
  currentRound: number;
  gamePhase: GamePhase;
  isMyTurn: boolean;
  hasMetRequirements: boolean;
  buyRequests: BuyRequest[];
  myBuyCount: number;
  maxBuys: number;
  canBuy: boolean;
  canDraw: boolean;
  canTakeDiscard: boolean;
  shouldShowPass: boolean;
  hasBuyRequest: boolean;
  hasPassed: boolean;
  nextPlayerToBuy: string | null;
  winner: { id: string; name: string; score: number } | null;
  isWinner: boolean;
  continueClicked: string[];
  hasContinued: boolean;
  buyWindowActive: boolean;
  buyWindowRemaining: number;
  buyJustProcessed: boolean;

  // Tutorial
  tutorialMode: boolean;
  tutorialStep: number;
}
