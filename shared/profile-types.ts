/**
 * Hawaiian Rummy - Profile & Leaderboard Types
 * Shared types for player profiles and stats tracking
 */

// ===== PROFILE TYPES =====

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;

  roundsPlayed: number;
  goingOutCount: number;          // Rounds won (times gone out)

  totalScore: number;             // Cumulative across all games (lower is better)

  currentWinStreak: number;
  longestWinStreak: number;
}

export interface GameScoreRecord {
  gameId: string;
  date: string;                   // ISO date string
  score: number;
  playerCount: number;
  placement: number;              // 1st, 2nd, etc.
}

export interface GameHistoryEntry {
  gameId: string;
  date: string;                   // ISO date string
  playerCount: number;
  myScore: number;
  placement: number;
  won: boolean;
  goingOutCount: number;          // How many rounds player went out
  roundsPlayed: number;
}

export interface PlayerProfile {
  id: string;                     // NanoID - the secret URL identifier
  nickname: string;
  isAI: boolean;

  // Timestamps
  createdAt: string;              // ISO date string
  lastActiveAt: string;           // ISO date string

  // Aggregate Stats
  stats: PlayerStats;

  // Personal Records (for profile page)
  bestGameScores: GameScoreRecord[];     // Top 10 lowest scores
  worstGameScores: GameScoreRecord[];    // Top 10 highest scores

  // Recent History (last 50 games)
  recentGames: GameHistoryEntry[];
}

// ===== COMPLETED GAME TYPES =====

export interface GamePlayerResult {
  profileId: string;
  nickname: string;
  isAI: boolean;

  finalScore: number;
  placement: number;              // 1st, 2nd, 3rd, 4th
  won: boolean;

  goingOutCount: number;          // Rounds won
  roundsPlayed: number;
}

export interface CompletedGame {
  id: string;
  completedAt: string;            // ISO date string

  // Participants
  players: GamePlayerResult[];

  // Game summary
  totalRounds: number;
  durationMinutes: number;
}

// ===== LEADERBOARD TYPES =====

export interface LeaderboardEntry {
  rank: number;
  profileId: string;              // Hidden from public display
  nickname: string;
  isAI: boolean;
  value: number;                  // The stat value

  // Context (optional)
  gamesPlayed?: number;           // For win rate context
  date?: string;                  // For score records
}

export interface Leaderboard {
  // Each category holds top 10
  mostGamesPlayed: LeaderboardEntry[];
  mostGamesWon: LeaderboardEntry[];
  highestWinRate: LeaderboardEntry[];       // Min 10 games
  mostGoingOut: LeaderboardEntry[];         // Rounds won
  lowestGameScore: LeaderboardEntry[];      // Single game best
  highestGameScore: LeaderboardEntry[];     // Single game worst (shame board)
  longestWinStreak: LeaderboardEntry[];

  lastUpdated: string;            // ISO date string
}

// ===== SERVER DASHBOARD TYPES =====

export interface ServerDashboard {
  // Health
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;                 // Seconds
  startedAt: string;              // ISO date string

  // Player Stats
  totalProfiles: number;
  totalAIProfiles: number;
  activePlayersToday: number;
  activePlayersNow: number;

  // Game Stats
  totalGamesCompleted: number;
  totalRoundsPlayed: number;
  gamesInProgress: number;

  // Today's activity
  gamesCompletedToday: number;
  newProfilesToday: number;
}

// ===== API TYPES =====

export interface CreateProfileRequest {
  nickname: string;
}

export interface CreateProfileResponse {
  success: boolean;
  profile?: PlayerProfile;
  profileUrl?: string;
  error?: string;
}

export interface UpdateProfileRequest {
  nickname: string;
}

export interface ProfileResponse {
  success: boolean;
  profile?: PlayerProfile;
  error?: string;
}

// ===== SAVED GAME TYPES =====

export interface SavedGame {
  id: string;                     // Unique save ID
  profileId: string;              // Owner's profile ID
  savedAt: string;                // ISO date string

  // Game state snapshot
  gameState: SavedGameState;

  // Metadata for display
  currentRound: number;
  playerScore: number;
  aiOpponents: string[];          // Names of AI opponents
}

export interface SavedGameState {
  // Core game state (serialized from GameState)
  players: string[];
  playerNames: Record<string, string>;
  playerStates: Record<string, SavedPlayerState>;

  currentRound: number;
  currentPlayerIndex: number;
  gamePhase: string;

  deck: SavedCard[];
  discardPile: SavedCard[];

  // We don't save buy state since saving happens between turns
}

export interface SavedPlayerState {
  hand: SavedCard[];
  melds: SavedMeld[];
  score: number;
  roundScores: number[];
  roundsWon: number;
  buyCount: number;
  hasMetRequirements: boolean;
}

export interface SavedCard {
  id: string;
  suit: string;
  rank: string;
  isWild: boolean;
}

export interface SavedMeld {
  type: 'set' | 'run';
  cards: SavedCard[];
}

// ===== AI STATS TRACKING =====

/**
 * Stats for a single round (aggregated across all AI players)
 */
export interface AIRoundStats {
  roundsPlayed: number;           // Total AI player-rounds played
  metRequirements: number;        // Times AI met meld requirements (put down)
  wentOut: number;                // Times AI went out (won the round)
}

/**
 * AI performance tracking by round number
 */
export interface AIPerformanceStats {
  // Stats indexed by round number (0-9)
  byRound: Record<number, AIRoundStats>;

  // Totals
  totalRoundsPlayed: number;
  totalMetRequirements: number;
  totalWentOut: number;

  lastUpdated: string;            // ISO date string
}

/**
 * Create empty AI stats
 */
export function createEmptyAIStats(): AIPerformanceStats {
  const byRound: Record<number, AIRoundStats> = {};
  for (let i = 0; i < 10; i++) {
    byRound[i] = { roundsPlayed: 0, metRequirements: 0, wentOut: 0 };
  }

  return {
    byRound,
    totalRoundsPlayed: 0,
    totalMetRequirements: 0,
    totalWentOut: 0,
    lastUpdated: new Date().toISOString()
  };
}
