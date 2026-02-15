/**
 * LeaderboardPage - Displays top 10 players in each category
 */

import { useEffect, useState, useCallback } from 'react';
import { useProfileStore, useSettingsStore } from '../../store';
import type { LeaderboardEntry } from '@shared/profile-types';

interface LeaderboardPageProps {
  onBack: () => void;
  currentProfileId?: string | null;
}

type LeaderboardCategory = 'gamesPlayed' | 'gamesWon' | 'goingOutCount' | 'lowestScore' | 'highestScore';

const CATEGORY_LABELS: Record<LeaderboardCategory, string> = {
  gamesPlayed: 'Games Played',
  gamesWon: 'Games Won',
  goingOutCount: 'Going Out Count',
  lowestScore: 'Best Score (Lowest)',
  highestScore: 'Highest Score'
};

export function LeaderboardPage({ onBack, currentProfileId }: LeaderboardPageProps) {
  const { leaderboard, leaderboardLoading, loadLeaderboard } = useProfileStore();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>('gamesWon');

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const getEntries = useCallback((): LeaderboardEntry[] => {
    if (!leaderboard) return [];

    switch (activeCategory) {
      case 'gamesPlayed':
        return leaderboard.mostGamesPlayed;
      case 'gamesWon':
        return leaderboard.mostGamesWon;
      case 'goingOutCount':
        return leaderboard.mostGoingOut;
      case 'lowestScore':
        return leaderboard.lowestGameScore;
      case 'highestScore':
        return leaderboard.highestGameScore;
      default:
        return [];
    }
  }, [leaderboard, activeCategory]);

  const formatValue = (entry: LeaderboardEntry): string => {
    if (activeCategory === 'lowestScore' || activeCategory === 'highestScore') {
      return `${entry.value} pts`;
    }
    return entry.value.toString();
  };

  const categories: LeaderboardCategory[] = ['gamesWon', 'gamesPlayed', 'goingOutCount', 'lowestScore', 'highestScore'];

  if (leaderboardLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}>
        <div className="text-center">
          <div className={`animate-spin w-12 h-12 border-4 ${isLight ? 'border-emerald-600 border-t-transparent' : 'border-white border-t-transparent'} rounded-full mx-auto mb-4`} />
          <p className={isLight ? 'text-emerald-800' : 'text-white'}>Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Leaderboard
            </h1>
            <button
              onClick={onBack}
              className={`p-2 rounded-lg ${isLight ? 'hover:bg-emerald-100' : 'hover:bg-emerald-700'}`}
            >
              <svg className={`w-5 h-5 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className={`panel p-2 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? (isLight ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white')
                    : (isLight ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-emerald-700 text-emerald-200 hover:bg-emerald-600')
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard List */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-4 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Top 10 - {CATEGORY_LABELS[activeCategory]}
          </h2>

          {!leaderboard ? (
            <p className={`text-center py-8 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Unable to load leaderboard
            </p>
          ) : getEntries().length === 0 ? (
            <p className={`text-center py-8 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              No entries yet. Be the first!
            </p>
          ) : (
            <div className="space-y-2">
              {getEntries().map((entry, index) => {
                const isCurrentUser = currentProfileId && entry.profileId === currentProfileId;
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                const showDate = (activeCategory === 'lowestScore' || activeCategory === 'highestScore') && entry.date;

                return (
                  <div
                    key={`${activeCategory}-${index}`}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isCurrentUser
                        ? (isLight ? 'bg-emerald-200 border-2 border-emerald-400' : 'bg-emerald-600 border-2 border-emerald-400')
                        : (isLight ? 'bg-emerald-50' : 'bg-emerald-700/50')
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 text-center font-bold ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                        {medal || `${rank}.`}
                      </span>
                      <div>
                        <span className={`font-medium ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                          {entry.nickname}
                          {isCurrentUser && <span className="ml-2 text-xs opacity-60">(You)</span>}
                        </span>
                        {showDate && (
                          <div className={`text-xs ${isLight ? 'text-emerald-500' : 'text-emerald-400'}`}>
                            {new Date(entry.date!).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                      {formatValue(entry)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Back to Game Button */}
        <div className="text-center">
          <button onClick={onBack} className="btn-primary">
            Back to Game
          </button>
        </div>
      </div>
    </div>
  );
}
