/**
 * Hawaiian Rummy - Tournament Type Definitions
 *
 * Three tournament modes:
 *   Marathon        — 4 players, 10 full games, lowest cumulative score wins
 *   First to 5000   — 4 players, rounds cycle 1-10, first to 5000 loses, lowest score wins
 *   March Madness   — 64 players, 4 brackets × 16, single elimination, final four
 */

import type { SavedGameState, GamePlayerResult } from './profile-types';

// ===== CONSTANTS =====

/**
 * AI player names — the 64 largest cities/towns in Hawaii by population.
 * Used to name AI tournament participants.
 */
export const HAWAIIAN_CITY_NAMES: string[] = [
  'Honolulu', 'East Honolulu', 'Pearl City', 'Hilo', 'Waipahu',
  'Kailua', 'Kaneohe', 'Kahului', 'Mililani Town', 'Ewa Gentry',
  'Kihei', 'Kapolei', 'Mililani Mauka', 'Makakilo', 'Kailua-Kona',
  'Wahiawa', 'Wailuku', 'Ewa Beach', 'Halawa', 'Ocean Pointe',
  'Hawaiian Paradise Park', 'Schofield Barracks', 'Royal Kunia', 'Waimalu', 'Waianae',
  'Lahaina', 'Kaiminani', 'Nanakuli', 'Waipio', 'Kapaa',
  'Maili', 'Aiea', 'Makaha', 'Waimea', 'Kaneohe Station',
  'Waihee-Waiehu', 'Ahuimanu', 'Haiku-Pauwela', 'Pukalani', 'Lihue',
  'Ewa Villages', 'Hickam Housing', 'Waikele', 'Makawao', 'Waikoloa Village',
  'Napili-Honokowai', 'Kula', 'Waimanalo', 'Wailea', 'Laie',
  'Haleiwa', 'Kaanapali', 'Hana', 'Princeville', 'Koloa',
  'Kilauea', 'Poipu', 'Kapaau', 'Pahoa', 'Keaau',
  'Captain Cook', 'Volcano', 'Holualoa', 'Kurtistown'
];

export const BRACKET_NAMES = ['Oahu', 'Kauai', 'Maui', 'BigIsland'] as const;

// ===== ENUMS & LITERALS =====

export type TournamentType = 'marathon' | 'first-to-5000' | 'march-madness';
export type TournamentStatus = 'lobby' | 'in-progress' | 'completed' | 'abandoned';
export type BracketName = typeof BRACKET_NAMES[number];
export type MatchupStatus = 'pending' | 'in-progress' | 'completed';

// ===== PARTICIPANTS =====

export interface TournamentParticipant {
  profileId: string;          // Human profile ID or generated AI ID (e.g. "ai-tournament-Honolulu")
  nickname: string;
  isAI: boolean;
  isHost: boolean;
  isConnected: boolean;       // Currently online — used for lobby waiting and reconnection
  joinedAt: string;           // ISO date
  /** If an AI is standing in for a human, the original human's profile ID */
  substituteForProfileId?: string;
}

// ===== CHAT =====

export interface TournamentChatMessage {
  id: string;
  profileId: string;
  nickname: string;
  message: string;
  timestamp: string;          // ISO date
}

// ===== STANDINGS (shared across modes) =====

export interface TournamentStanding {
  profileId: string;
  nickname: string;
  isAI: boolean;
  rank: number;               // 1-based
  cumulativeScore: number;
  gamesPlayed: number;
  gamesWon: number;
  goingOutCount: number;
}

// ===== BASE TOURNAMENT =====

export interface BaseTournament {
  id: string;                 // Unique tournament ID (nanoid)
  name: string;               // Custom name set by host
  type: TournamentType;
  status: TournamentStatus;
  hostProfileId: string;
  inviteCode: string;         // Short shareable code for joining

  // Timestamps
  createdAt: string;          // ISO date
  startedAt?: string;
  completedAt?: string;
  lastActivityAt: string;     // Updated on any state change (for staleness detection)

  // Participants (always 4 for marathon/first-to-5000, always 64 for march madness)
  participants: TournamentParticipant[];

  // Chat history
  chatMessages: TournamentChatMessage[];

  // Active game tracking — the room ID of the game currently being played
  activeRoomId?: string;
}

// ===== MARATHON TOURNAMENT =====

export interface MarathonGameResult {
  gameNumber: number;         // 1–10
  completedAt: string;
  playerResults: GamePlayerResult[];
}

export interface MarathonTournament extends BaseTournament {
  type: 'marathon';

  /** Total games to play */
  totalGames: number;         // 10

  /** Results of each completed game */
  completedGames: MarathonGameResult[];

  /** Which game is currently being played (1-based, up to totalGames) */
  currentGameNumber: number;

  /** Running cumulative scores: profileId → total score across all games */
  cumulativeScores: Record<string, number>;

  /** Current rankings sorted by cumulative score (ascending — lower is better) */
  standings: TournamentStanding[];

  /** Profile ID of the winner (lowest cumulative score after all 10 games) */
  winnerId?: string;
}

// ===== FIRST TO 5000 TOURNAMENT =====

export interface FirstTo5000RoundResult {
  /** Game-engine round index (0–9), cycling */
  roundIndex: number;
  /** Which pass through the 10 rounds (0-based: first pass = 0) */
  cycle: number;
  /** Points scored this round per player: profileId → round score */
  playerScores: Record<string, number>;
}

export interface FirstTo5000Tournament extends BaseTournament {
  type: 'first-to-5000';

  /** The score threshold — first player to reach or exceed this loses */
  threshold: number;          // 5000

  /** Per-round results in order played */
  roundResults: FirstTo5000RoundResult[];

  /** Current round index in the game engine (0–9) */
  currentRoundIndex: number;

  /** How many full 10-round cycles have completed */
  currentCycle: number;

  /** Running cumulative scores: profileId → total score */
  cumulativeScores: Record<string, number>;

  /** Current rankings */
  standings: TournamentStanding[];

  /** Profile ID of the loser (first to hit threshold) */
  loserProfileId?: string;

  /** Profile ID of the winner (lowest score when loser is determined) */
  winnerId?: string;
}

// ===== MARCH MADNESS TOURNAMENT =====

export interface MarchMadnessMatchup {
  id: string;                         // Unique matchup ID
  bracketName: BracketName | 'FinalFour';
  round: number;                      // 1 = bracket quarterfinals (4 games), 2 = bracket final (1 game)
  matchNumber: number;                // Position within the round (0-based)
  playerIds: string[];                // 4 participant profile IDs
  status: MatchupStatus;
  roomId?: string;                    // Active game room ID
  winnerId?: string;
  results?: GamePlayerResult[];
  completedAt?: string;
}

export interface MarchMadnessBracket {
  name: BracketName;
  /** Round 1: 4 games of 4 players each (16 players total) */
  round1Matchups: MarchMadnessMatchup[];
  /** Round 2: 1 game of the 4 round-1 winners */
  round2Matchup: MarchMadnessMatchup | null;
  /** Bracket champion profile ID */
  winnerId?: string;
}

export interface MarchMadnessTournament extends BaseTournament {
  type: 'march-madness';

  /** The four island brackets */
  brackets: Record<BracketName, MarchMadnessBracket>;

  /** The Final Four championship game (4 bracket winners) */
  finalFour: MarchMadnessMatchup | null;

  /** Overall tournament champion */
  championId?: string;

  /**
   * Seeding map: profileId → seed number (1–64).
   * Humans are seeded to be spread across brackets and placed to meet late.
   */
  seeds: Record<string, number>;
}

// ===== UNION TYPE =====

export type Tournament = MarathonTournament | FirstTo5000Tournament | MarchMadnessTournament;

// ===== PERSISTENCE =====

/**
 * Saved tournament state — written to tournaments.json for persistence across server restarts.
 * Analogous to SavedGame for regular games.
 */
export interface SavedTournament {
  id: string;                         // Same as tournament.id
  tournament: Tournament;
  savedAt: string;                    // ISO date
  /** If a game is actively in progress within the tournament, snapshot its state */
  activeGameState?: SavedGameState;
}

// ===== DASHBOARD / LISTING =====

/**
 * Summary shown on the /dashboard page alongside saved games.
 * Lightweight — no full tournament state, just what's needed for the list.
 */
export interface TournamentListEntry {
  id: string;
  name: string;
  type: TournamentType;
  status: TournamentStatus;
  hostProfileId: string;
  hostNickname: string;
  createdAt: string;
  lastActivityAt: string;
  /** How many human participants vs total */
  humanCount: number;
  totalCount: number;
  /** Brief progress summary, e.g. "Game 3/10", "Round 47", "Bracket Round 1" */
  progressSummary: string;
}

// ===== CLIENT STATE (sent to participants via socket) =====

/**
 * Tournament state sent to connected clients.
 * Omits internal fields (full chat history is paginated separately).
 */
export interface ClientTournamentState {
  id: string;
  name: string;
  type: TournamentType;
  status: TournamentStatus;
  hostProfileId: string;
  inviteCode: string;
  createdAt: string;
  startedAt?: string;

  participants: TournamentParticipant[];
  standings: TournamentStanding[];

  /** Mode-specific progress */
  progress: MarathonProgress | FirstTo5000Progress | MarchMadnessProgress;

  /** Recent chat (last 50 messages) */
  recentChat: TournamentChatMessage[];
}

export interface MarathonProgress {
  type: 'marathon';
  currentGameNumber: number;
  totalGames: number;
  completedGames: MarathonGameResult[];
  cumulativeScores: Record<string, number>;
}

export interface FirstTo5000Progress {
  type: 'first-to-5000';
  threshold: number;
  currentRoundIndex: number;
  currentCycle: number;
  totalRoundsPlayed: number;
  cumulativeScores: Record<string, number>;
  loserProfileId?: string;
}

export interface MarchMadnessProgress {
  type: 'march-madness';
  brackets: Record<BracketName, MarchMadnessBracket>;
  finalFour: MarchMadnessMatchup | null;
  championId?: string;
  seeds: Record<string, number>;
}

// ===== SOCKET EVENTS =====

/**
 * Events emitted between client and server for tournament operations.
 * These define the contract; implementation follows.
 */
export interface TournamentSocketEvents {
  // Client → Server
  createTournament: (config: CreateTournamentConfig) => void;
  joinTournament: (inviteCode: string, profileId: string) => void;
  leaveTournament: (tournamentId: string) => void;
  startTournament: (tournamentId: string) => void;               // Host only
  sendTournamentChat: (tournamentId: string, message: string) => void;
  reclaimSlot: (tournamentId: string, profileId: string) => void; // Human takes back AI slot
  deleteTournament: (tournamentId: string) => void;               // Host or admin

  // Server → Client
  tournamentState: (state: ClientTournamentState) => void;
  tournamentError: (error: string) => void;
  tournamentChat: (message: TournamentChatMessage) => void;
  tournamentGameStarting: (data: { roomId: string; matchupId?: string }) => void;
  tournamentGameCompleted: (data: { standings: TournamentStanding[] }) => void;
  tournamentCompleted: (data: { winnerId: string; standings: TournamentStanding[] }) => void;
}

export interface CreateTournamentConfig {
  name: string;
  type: TournamentType;
  hostProfileId: string;
}
