/**
 * AI Stats Tracking Service
 * Tracks AI player performance across local games using localStorage
 */

import { AIPerformanceStats, createEmptyAIStats } from '@shared/profile-types';

const AI_STATS_KEY = 'hawaiian-rummy-ai-stats';

/**
 * Load AI stats from localStorage
 */
export function loadAIStats(): AIPerformanceStats {
  try {
    const stored = localStorage.getItem(AI_STATS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure all rounds exist (in case of old data)
      for (let i = 0; i < 10; i++) {
        if (!parsed.byRound[i]) {
          parsed.byRound[i] = { roundsPlayed: 0, metRequirements: 0, wentOut: 0 };
        }
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load AI stats:', e);
  }
  return createEmptyAIStats();
}

/**
 * Save AI stats to localStorage
 */
export function saveAIStats(stats: AIPerformanceStats): void {
  try {
    stats.lastUpdated = new Date().toISOString();
    localStorage.setItem(AI_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save AI stats:', e);
  }
}

/**
 * Record AI performance for a completed round
 *
 * @param roundNumber - The round number (0-9)
 * @param aiResults - Array of AI player results for the round
 */
export function recordAIRoundStats(
  roundNumber: number,
  aiResults: Array<{
    metRequirements: boolean;
    wentOut: boolean;
  }>
): void {
  console.log('recordAIRoundStats called with round:', roundNumber, 'results:', aiResults);

  const stats = loadAIStats();
  console.log('Loaded existing stats:', stats);

  // Ensure round exists
  if (!stats.byRound[roundNumber]) {
    stats.byRound[roundNumber] = { roundsPlayed: 0, metRequirements: 0, wentOut: 0 };
  }

  // Update stats for each AI player
  for (const result of aiResults) {
    stats.byRound[roundNumber].roundsPlayed++;
    stats.totalRoundsPlayed++;

    if (result.metRequirements) {
      stats.byRound[roundNumber].metRequirements++;
      stats.totalMetRequirements++;
    }

    if (result.wentOut) {
      stats.byRound[roundNumber].wentOut++;
      stats.totalWentOut++;
    }
  }

  console.log('Saving updated stats:', stats);
  saveAIStats(stats);
}

/**
 * Get AI stats for display
 */
export function getAIStats(): AIPerformanceStats {
  return loadAIStats();
}

/**
 * Reset AI stats (for testing)
 */
export function resetAIStats(): void {
  saveAIStats(createEmptyAIStats());
}

/**
 * Calculate success rates for display
 */
export function calculateAISuccessRates(stats: AIPerformanceStats): {
  byRound: Record<number, {
    roundsPlayed: number;
    metRequirementsRate: number;
    wentOutRate: number;
  }>;
  overall: {
    metRequirementsRate: number;
    wentOutRate: number;
  };
} {
  const byRound: Record<number, { roundsPlayed: number; metRequirementsRate: number; wentOutRate: number }> = {};

  for (let i = 0; i < 10; i++) {
    const roundStats = stats.byRound[i];
    const played = roundStats?.roundsPlayed || 0;
    byRound[i] = {
      roundsPlayed: played,
      metRequirementsRate: played > 0 ? (roundStats.metRequirements / played) * 100 : 0,
      wentOutRate: played > 0 ? (roundStats.wentOut / played) * 100 : 0
    };
  }

  const totalPlayed = stats.totalRoundsPlayed || 0;

  return {
    byRound,
    overall: {
      metRequirementsRate: totalPlayed > 0 ? (stats.totalMetRequirements / totalPlayed) * 100 : 0,
      wentOutRate: totalPlayed > 0 ? (stats.totalWentOut / totalPlayed) * 100 : 0
    }
  };
}
