/**
 * DashboardPage - Server dashboard showing health and stats
 */

import { useEffect, useState, useCallback } from 'react';
import { useSettingsStore } from '../../store';
import { getDashboard } from '../../services/profile-api';
import type { ServerDashboard } from '@shared/profile-types';

interface DashboardPageProps {
  onBack: () => void;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

  return parts.join(' ');
}

export function DashboardPage({ onBack }: DashboardPageProps) {
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const [dashboard, setDashboard] = useState<ServerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getDashboard();
      if (response.success && response.dashboard) {
        setDashboard(response.dashboard);
      } else {
        setError(response.error || 'Failed to load dashboard');
      }
    } catch {
      setError('Failed to load dashboard');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'down':
        return 'text-red-500';
      default:
        return isLight ? 'text-emerald-700' : 'text-emerald-300';
    }
  };

  if (loading && !dashboard) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}>
        <div className="text-center">
          <div className={`animate-spin w-12 h-12 border-4 ${isLight ? 'border-emerald-600 border-t-transparent' : 'border-white border-t-transparent'} rounded-full mx-auto mb-4`} />
          <p className={isLight ? 'text-emerald-800' : 'text-white'}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Server Dashboard
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={loadDashboard}
                className={`p-2 rounded-lg ${isLight ? 'hover:bg-emerald-100' : 'hover:bg-emerald-700'}`}
                title="Refresh"
              >
                <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''} ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
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
        </div>

        {error && (
          <div className={`panel p-4 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border`}>
            <p className={isLight ? 'text-red-700' : 'text-red-300'}>{error}</p>
          </div>
        )}

        {dashboard && (
          <>
            {/* Server Health */}
            <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
              <h2 className={`text-lg font-bold mb-4 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                Server Health
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className={`text-2xl font-bold capitalize ${getStatusColor(dashboard.status)}`}>
                    {dashboard.status}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Status
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {formatUptime(dashboard.uptime)}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Uptime
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.gamesInProgress}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Active Games
                  </div>
                </div>
              </div>
            </div>

            {/* Player Stats */}
            <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
              <h2 className={`text-lg font-bold mb-4 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                Players
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.totalProfiles}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Total Profiles
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.totalAIProfiles}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    AI Players
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.activePlayersNow}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Online Now
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.activePlayersToday}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Active Today
                  </div>
                </div>
              </div>
            </div>

            {/* Game Stats */}
            <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
              <h2 className={`text-lg font-bold mb-4 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                Games
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.totalGamesCompleted}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Total Games
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.totalRoundsPlayed}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Total Rounds
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.gamesCompletedToday}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    Games Today
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {dashboard.newProfilesToday}
                  </div>
                  <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
                    New Players Today
                  </div>
                </div>
              </div>
            </div>

            {/* Server Info */}
            <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
              <p className={`text-sm text-center ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                Server started: {new Date(dashboard.startedAt).toLocaleString()}
              </p>
            </div>
          </>
        )}

        {/* Back button */}
        <div className="text-center">
          <button onClick={onBack} className="btn-primary">
            Back to Game
          </button>
        </div>
      </div>
    </div>
  );
}
