/**
 * Hawaiian Rummy - Profile Manager
 * Manages player profiles and stats
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import {
  PlayerProfile,
  PlayerStats,
  GameScoreRecord,
  GameHistoryEntry,
  CompletedGame,
  GamePlayerResult,
  Leaderboard,
  LeaderboardEntry,
  ServerDashboard,
  SavedGame
} from '../shared/profile-types.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data file paths
const DATA_DIR = path.join(__dirname, '../data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const GAMES_FILE = path.join(DATA_DIR, 'completed-games.json');
const STATS_FILE = path.join(DATA_DIR, 'server-stats.json');
const SAVED_GAMES_FILE = path.join(DATA_DIR, 'saved-games.json');

// Constants
const MAX_RECENT_GAMES = 50;
const MAX_SCORE_RECORDS = 10;
const LEADERBOARD_SIZE = 10;
const MIN_GAMES_FOR_WIN_RATE = 10;

// Server start time for uptime calculation
const SERVER_START_TIME = new Date();

// ===== AI PLAYER PROFILES =====
const AI_PROFILES: Partial<PlayerProfile>[] = [
  { id: 'ai-mango', nickname: '🤖 Mango', isAI: true },
  { id: 'ai-pineapple', nickname: '🤖 Pineapple', isAI: true },
  { id: 'ai-coconut', nickname: '🤖 Coconut', isAI: true },
  { id: 'ai-papaya', nickname: '🤖 Papaya', isAI: true },
];

// ===== HELPER FUNCTIONS =====

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createEmptyStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    roundsPlayed: 0,
    goingOutCount: 0,
    totalScore: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    tournamentsEntered: 0,
    tournamentsWon: 0
  };
}

function createProfile(id: string, nickname: string, isAI: boolean = false): PlayerProfile {
  const now = new Date().toISOString();
  return {
    id,
    nickname,
    isAI,
    createdAt: now,
    lastActiveAt: now,
    stats: createEmptyStats(),
    bestGameScores: [],
    worstGameScores: [],
    recentGames: []
  };
}

// ===== SERVER STATS =====

interface ServerStats {
  totalGamesCompleted: number;
  totalRoundsPlayed: number;
  gamesCompletedToday: number;
  newProfilesToday: number;
  lastResetDate: string;
}

function loadServerStats(): ServerStats {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      const stats = JSON.parse(data);

      // Reset daily stats if new day
      const today = new Date().toISOString().split('T')[0];
      if (stats.lastResetDate !== today) {
        stats.gamesCompletedToday = 0;
        stats.newProfilesToday = 0;
        stats.lastResetDate = today;
      }

      return stats;
    }
  } catch (err) {
    console.error('Error loading server stats:', err);
  }

  return {
    totalGamesCompleted: 0,
    totalRoundsPlayed: 0,
    gamesCompletedToday: 0,
    newProfilesToday: 0,
    lastResetDate: new Date().toISOString().split('T')[0]
  };
}

function saveServerStats(stats: ServerStats): void {
  ensureDataDir();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// ===== PROFILE MANAGER CLASS =====

export class ProfileManager {
  private profiles: Map<string, PlayerProfile> = new Map();
  private completedGames: CompletedGame[] = [];
  private savedGames: Map<string, SavedGame> = new Map(); // profileId -> saved game (one per profile)
  private serverStats: ServerStats;
  private activeProfiles: Set<string> = new Set(); // Profiles active in current session

  constructor() {
    this.serverStats = loadServerStats();
    this.loadProfiles();
    this.loadCompletedGames();
    this.loadSavedGames();
    this.initializeAIProfiles();
  }

  // ===== DATA PERSISTENCE =====

  private loadProfiles(): void {
    try {
      if (fs.existsSync(PROFILES_FILE)) {
        const data = fs.readFileSync(PROFILES_FILE, 'utf8');
        const profilesArray: PlayerProfile[] = JSON.parse(data);
        this.profiles = new Map(profilesArray.map(p => [p.id, p]));
        console.log(`Loaded ${this.profiles.size} profiles`);
      }
    } catch (err) {
      console.error('Error loading profiles:', err);
    }
  }

  private saveProfiles(): void {
    ensureDataDir();
    const profilesArray = Array.from(this.profiles.values());
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profilesArray, null, 2));
  }

  private loadCompletedGames(): void {
    try {
      if (fs.existsSync(GAMES_FILE)) {
        const data = fs.readFileSync(GAMES_FILE, 'utf8');
        this.completedGames = JSON.parse(data);
        console.log(`Loaded ${this.completedGames.length} completed games`);
      }
    } catch (err) {
      console.error('Error loading completed games:', err);
    }
  }

  private saveCompletedGames(): void {
    ensureDataDir();
    // Keep only last 1000 games to prevent file from growing too large
    const gamesToSave = this.completedGames.slice(-1000);
    fs.writeFileSync(GAMES_FILE, JSON.stringify(gamesToSave, null, 2));
  }

  private loadSavedGames(): void {
    try {
      if (fs.existsSync(SAVED_GAMES_FILE)) {
        const data = fs.readFileSync(SAVED_GAMES_FILE, 'utf8');
        const savedGamesArray: SavedGame[] = JSON.parse(data);
        this.savedGames = new Map(savedGamesArray.map(g => [g.profileId, g]));
        console.log(`Loaded ${this.savedGames.size} saved games`);
      }
    } catch (err) {
      console.error('Error loading saved games:', err);
    }
  }

  private saveSavedGamesToFile(): void {
    ensureDataDir();
    const savedGamesArray = Array.from(this.savedGames.values());
    fs.writeFileSync(SAVED_GAMES_FILE, JSON.stringify(savedGamesArray, null, 2));
  }

  // ===== AI PROFILES =====

  private initializeAIProfiles(): void {
    for (const aiProfile of AI_PROFILES) {
      if (!this.profiles.has(aiProfile.id!)) {
        const profile = createProfile(aiProfile.id!, aiProfile.nickname!, true);
        this.profiles.set(profile.id, profile);
        console.log(`Initialized AI profile: ${profile.nickname}`);
      }
    }
    this.saveProfiles();
  }

  getAIProfileId(aiName: string): string | undefined {
    // Map AI names to profile IDs
    const nameToId: Record<string, string> = {
      'Mango': 'ai-mango',
      'Pineapple': 'ai-pineapple',
      'Coconut': 'ai-coconut',
      'Papaya': 'ai-papaya'
    };
    return nameToId[aiName];
  }

  // ===== PROFILE CRUD =====

  createProfile(nickname: string): PlayerProfile {
    const id = nanoid(21); // 21 char NanoID
    const profile = createProfile(id, nickname, false);
    this.profiles.set(id, profile);

    // Update server stats
    this.serverStats.newProfilesToday++;
    saveServerStats(this.serverStats);

    this.saveProfiles();
    console.log(`Created profile: ${nickname} (${id})`);
    return profile;
  }

  getProfile(id: string): PlayerProfile | undefined {
    const profile = this.profiles.get(id);
    if (profile) {
      // Update last active
      profile.lastActiveAt = new Date().toISOString();
      this.activeProfiles.add(id);
    }
    return profile;
  }

  updateProfile(id: string, updates: { nickname?: string }): PlayerProfile | undefined {
    const profile = this.profiles.get(id);
    if (!profile || profile.isAI) return undefined;

    if (updates.nickname) {
      profile.nickname = updates.nickname;
    }
    profile.lastActiveAt = new Date().toISOString();

    this.saveProfiles();
    return profile;
  }

  deleteProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile || profile.isAI) return false;

    this.profiles.delete(id);
    this.activeProfiles.delete(id);
    this.saveProfiles();
    console.log(`Deleted profile: ${profile.nickname} (${id})`);
    return true;
  }

  profileExists(id: string): boolean {
    return this.profiles.has(id);
  }

  // ===== GAME COMPLETION TRACKING =====

  recordCompletedGame(
    gameId: string,
    results: GamePlayerResult[],
    totalRounds: number,
    durationMinutes: number
  ): void {
    const now = new Date().toISOString();

    // Create completed game record
    const completedGame: CompletedGame = {
      id: gameId,
      completedAt: now,
      players: results,
      totalRounds,
      durationMinutes
    };
    this.completedGames.push(completedGame);

    // Update each player's profile
    for (const result of results) {
      this.updateProfileStats(result, totalRounds, gameId, now);
    }

    // Update server stats
    this.serverStats.totalGamesCompleted++;
    this.serverStats.totalRoundsPlayed += totalRounds;
    this.serverStats.gamesCompletedToday++;
    saveServerStats(this.serverStats);

    this.saveProfiles();
    this.saveCompletedGames();

    console.log(`Recorded completed game: ${gameId} with ${results.length} players`);
  }

  recordTournamentResult(participants: { profileId: string; isAI: boolean }[], winnerId?: string): void {
    for (const p of participants) {
      if (p.isAI) continue;
      const profile = this.profiles.get(p.profileId);
      if (!profile) continue;

      // Initialize fields for older profiles that don't have them
      if (profile.stats.tournamentsEntered === undefined) profile.stats.tournamentsEntered = 0;
      if (profile.stats.tournamentsWon === undefined) profile.stats.tournamentsWon = 0;

      profile.stats.tournamentsEntered++;
      if (p.profileId === winnerId) {
        profile.stats.tournamentsWon++;
      }
    }
    this.saveProfiles();
  }

  private updateProfileStats(
    result: GamePlayerResult,
    totalRounds: number,
    gameId: string,
    date: string
  ): void {
    const profile = this.profiles.get(result.profileId);
    if (!profile) return;

    const stats = profile.stats;

    // Update basic counts
    stats.gamesPlayed++;
    stats.roundsPlayed += totalRounds;
    stats.goingOutCount += result.goingOutCount;
    stats.totalScore += result.finalScore;

    // Update win stats
    if (result.won) {
      stats.gamesWon++;
      stats.currentWinStreak++;
      if (stats.currentWinStreak > stats.longestWinStreak) {
        stats.longestWinStreak = stats.currentWinStreak;
      }
    } else {
      stats.currentWinStreak = 0;
    }

    // Update score records
    const scoreRecord: GameScoreRecord = {
      gameId,
      date,
      score: result.finalScore,
      playerCount: 0, // Will be set by caller context
      placement: result.placement
    };

    // Best scores (lowest)
    profile.bestGameScores.push(scoreRecord);
    profile.bestGameScores.sort((a, b) => a.score - b.score);
    profile.bestGameScores = profile.bestGameScores.slice(0, MAX_SCORE_RECORDS);

    // Worst scores (highest)
    profile.worstGameScores.push(scoreRecord);
    profile.worstGameScores.sort((a, b) => b.score - a.score);
    profile.worstGameScores = profile.worstGameScores.slice(0, MAX_SCORE_RECORDS);

    // Recent games
    const historyEntry: GameHistoryEntry = {
      gameId,
      date,
      playerCount: 0, // Will be set by caller context
      myScore: result.finalScore,
      placement: result.placement,
      won: result.won,
      goingOutCount: result.goingOutCount,
      roundsPlayed: totalRounds
    };
    profile.recentGames.unshift(historyEntry);
    profile.recentGames = profile.recentGames.slice(0, MAX_RECENT_GAMES);

    profile.lastActiveAt = date;
  }

  // ===== LEADERBOARD =====

  getLeaderboard(): Leaderboard {
    const profiles = Array.from(this.profiles.values());

    const createEntries = (
      sorted: PlayerProfile[],
      getValue: (p: PlayerProfile) => number,
      getContext?: (p: PlayerProfile) => Partial<LeaderboardEntry>
    ): LeaderboardEntry[] => {
      return sorted.slice(0, LEADERBOARD_SIZE).map((p, i) => ({
        rank: i + 1,
        profileId: p.id,
        nickname: p.nickname,
        isAI: p.isAI,
        value: getValue(p),
        ...getContext?.(p)
      }));
    };

    // Most games played
    const byGamesPlayed = [...profiles].sort((a, b) => b.stats.gamesPlayed - a.stats.gamesPlayed);
    const mostGamesPlayed = createEntries(byGamesPlayed, p => p.stats.gamesPlayed);

    // Most games won
    const byGamesWon = [...profiles].sort((a, b) => b.stats.gamesWon - a.stats.gamesWon);
    const mostGamesWon = createEntries(byGamesWon, p => p.stats.gamesWon, p => ({
      gamesPlayed: p.stats.gamesPlayed
    }));

    // Highest win rate (min games required)
    const withEnoughGames = profiles.filter(p => p.stats.gamesPlayed >= MIN_GAMES_FOR_WIN_RATE);
    const byWinRate = [...withEnoughGames].sort((a, b) => {
      const rateA = a.stats.gamesWon / a.stats.gamesPlayed;
      const rateB = b.stats.gamesWon / b.stats.gamesPlayed;
      return rateB - rateA;
    });
    const highestWinRate = createEntries(
      byWinRate,
      p => Math.round((p.stats.gamesWon / p.stats.gamesPlayed) * 1000) / 10, // Percentage with 1 decimal
      p => ({ gamesPlayed: p.stats.gamesPlayed })
    );

    // Most going out (rounds won)
    const byGoingOut = [...profiles].sort((a, b) => b.stats.goingOutCount - a.stats.goingOutCount);
    const mostGoingOut = createEntries(byGoingOut, p => p.stats.goingOutCount);

    // Lowest single game score (top 10 best games across all players)
    const allBestScores: (GameScoreRecord & { profile: PlayerProfile })[] = [];
    for (const profile of profiles) {
      for (const score of profile.bestGameScores) {
        allBestScores.push({ ...score, profile });
      }
    }
    allBestScores.sort((a, b) => a.score - b.score);
    const lowestGameScore: LeaderboardEntry[] = allBestScores.slice(0, LEADERBOARD_SIZE).map((s, i) => ({
      rank: i + 1,
      profileId: s.profile.id,
      nickname: s.profile.nickname,
      isAI: s.profile.isAI,
      value: s.score,
      date: s.date
    }));

    // Highest single game score (top 10 worst games across all players)
    const allWorstScores: (GameScoreRecord & { profile: PlayerProfile })[] = [];
    for (const profile of profiles) {
      for (const score of profile.worstGameScores) {
        allWorstScores.push({ ...score, profile });
      }
    }
    allWorstScores.sort((a, b) => b.score - a.score);
    const highestGameScore: LeaderboardEntry[] = allWorstScores.slice(0, LEADERBOARD_SIZE).map((s, i) => ({
      rank: i + 1,
      profileId: s.profile.id,
      nickname: s.profile.nickname,
      isAI: s.profile.isAI,
      value: s.score,
      date: s.date
    }));

    // Longest win streak
    const byStreak = [...profiles].sort((a, b) => b.stats.longestWinStreak - a.stats.longestWinStreak);
    const longestWinStreak = createEntries(byStreak, p => p.stats.longestWinStreak);

    return {
      mostGamesPlayed,
      mostGamesWon,
      highestWinRate,
      mostGoingOut,
      lowestGameScore,
      highestGameScore,
      longestWinStreak,
      lastUpdated: new Date().toISOString()
    };
  }

  // ===== SERVER DASHBOARD =====

  getDashboard(gamesInProgress: number): ServerDashboard {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Reset daily stats if new day
    if (this.serverStats.lastResetDate !== today) {
      this.serverStats.gamesCompletedToday = 0;
      this.serverStats.newProfilesToday = 0;
      this.serverStats.lastResetDate = today;
      saveServerStats(this.serverStats);
    }

    const profiles = Array.from(this.profiles.values());
    const humanProfiles = profiles.filter(p => !p.isAI);
    const aiProfiles = profiles.filter(p => p.isAI);

    // Count active today (profiles with lastActiveAt today)
    const todayStart = new Date(today).getTime();
    const activeToday = humanProfiles.filter(p => {
      const lastActive = new Date(p.lastActiveAt).getTime();
      return lastActive >= todayStart;
    }).length;

    const uptimeSeconds = Math.floor((now.getTime() - SERVER_START_TIME.getTime()) / 1000);

    return {
      status: 'healthy',
      uptime: uptimeSeconds,
      startedAt: SERVER_START_TIME.toISOString(),

      totalProfiles: humanProfiles.length,
      totalAIProfiles: aiProfiles.length,
      activePlayersToday: activeToday,
      activePlayersNow: this.activeProfiles.size,

      totalGamesCompleted: this.serverStats.totalGamesCompleted,
      totalRoundsPlayed: this.serverStats.totalRoundsPlayed,
      gamesInProgress,

      gamesCompletedToday: this.serverStats.gamesCompletedToday,
      newProfilesToday: this.serverStats.newProfilesToday
    };
  }

  // ===== PLAYER RANK =====

  getPlayerRank(profileId: string, category: keyof Leaderboard): number | null {
    const leaderboard = this.getLeaderboard();
    const entries = leaderboard[category];

    if (!Array.isArray(entries)) return null;

    const entry = entries.find(e => e.profileId === profileId);
    if (entry) return entry.rank;

    // If not in top 10, calculate actual rank
    const profile = this.profiles.get(profileId);
    if (!profile) return null;

    const profiles = Array.from(this.profiles.values());
    let rank = 1;

    switch (category) {
      case 'mostGamesPlayed':
        rank = profiles.filter(p => p.stats.gamesPlayed > profile.stats.gamesPlayed).length + 1;
        break;
      case 'mostGamesWon':
        rank = profiles.filter(p => p.stats.gamesWon > profile.stats.gamesWon).length + 1;
        break;
      case 'mostGoingOut':
        rank = profiles.filter(p => p.stats.goingOutCount > profile.stats.goingOutCount).length + 1;
        break;
      case 'longestWinStreak':
        rank = profiles.filter(p => p.stats.longestWinStreak > profile.stats.longestWinStreak).length + 1;
        break;
      default:
        return null;
    }

    return rank;
  }

  // ===== SAVED GAMES =====

  saveGame(profileId: string, savedGame: SavedGame): boolean {
    // Verify profile exists
    if (!this.profiles.has(profileId)) {
      console.error(`Cannot save game: profile ${profileId} not found`);
      return false;
    }

    // Only allow one saved game per profile (overwrite existing)
    this.savedGames.set(profileId, savedGame);
    this.saveSavedGamesToFile();

    console.log(`Saved game for profile ${profileId} (round ${savedGame.currentRound + 1})`);
    return true;
  }

  getSavedGame(profileId: string): SavedGame | undefined {
    return this.savedGames.get(profileId);
  }

  hasSavedGame(profileId: string): boolean {
    return this.savedGames.has(profileId);
  }

  deleteSavedGame(profileId: string): boolean {
    if (!this.savedGames.has(profileId)) {
      return false;
    }

    this.savedGames.delete(profileId);
    this.saveSavedGamesToFile();

    console.log(`Deleted saved game for profile ${profileId}`);
    return true;
  }
}

// Export singleton instance
export const profileManager = new ProfileManager();
