/**
 * MarathonTracker - Standings display between tournament games
 * Shows cumulative scores, per-game results, and continue button
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useSocketStore, useGameStore } from '../../store';
import { useTournamentStore } from '../../store/tournament-store';
import type { MarathonProgress, MarathonGameResult } from '@shared/tournament-types';

interface MarathonTrackerProps {
  onBack: () => void;
  onContinue: () => void;
}

export function MarathonTracker({ onBack, onContinue }: MarathonTrackerProps) {
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const emit = useSocketStore((state) => state.emit);
  const tournament = useTournamentStore((state) => state.tournament);
  const appPhase = useGameStore((state) => state.appPhase);
  const navigate = useNavigate();

  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [hasContinued, setHasContinued] = useState(false);

  // Auto-navigate to game when it starts after clicking Continue
  useEffect(() => {
    if (hasContinued && (appPhase === 'playing' || appPhase === 'turnOrder')) {
      navigate('/');
    }
  }, [hasContinued, appPhase, navigate]);

  const handleContinue = useCallback(() => {
    if (!tournament) return;
    setHasContinued(true);
    emit('continueTournament', tournament.id);
  }, [tournament, emit]);

  if (!tournament) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}>
        <p className={isLight ? 'text-emerald-800' : 'text-white'}>Loading...</p>
      </div>
    );
  }

  const progress = tournament.progress as MarathonProgress;
  const isCompleted = tournament.status === 'completed';
  const { standings } = tournament;

  // A game is in progress if currentGameNumber > completed games count
  const gameInProgress = progress.currentGameNumber > progress.completedGames.length;

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className={`panel p-6 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {tournament.name}
            </h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isCompleted
                ? (isLight ? 'bg-green-100 text-green-800' : 'bg-green-900/50 text-green-200')
                : (isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/50 text-blue-200')
            }`}>
              {isCompleted ? 'Tournament Complete' : `Game ${progress.currentGameNumber} of ${progress.totalGames}`}
            </span>
          </div>

          {isCompleted && standings[0] && (
            <div className={`mt-4 p-4 rounded-lg text-center ${isLight ? 'bg-amber-50' : 'bg-amber-900/30'}`}>
              <p className={`text-lg font-bold ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>
                Winner: {standings[0].nickname}
              </p>
              <p className={`text-sm ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                Total Score: {standings[0].cumulativeScore} pts
              </p>
            </div>
          )}
        </div>

        {/* Standings Table */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Standings
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={isLight ? 'text-emerald-600' : 'text-emerald-400'}>
                  <th className="text-left py-2 pr-2">#</th>
                  <th className="text-left py-2 pr-2">Player</th>
                  <th className="text-right py-2 pr-2">Score</th>
                  <th className="text-right py-2 pr-2">Won</th>
                  <th className="text-right py-2">Out</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing) => (
                  <tr
                    key={standing.profileId}
                    className={`border-t ${isLight ? 'border-emerald-100' : 'border-emerald-700'}`}
                  >
                    <td className={`py-2 pr-2 font-bold ${
                      standing.rank === 1
                        ? 'text-amber-500'
                        : standing.rank === 2
                          ? 'text-gray-400'
                          : standing.rank === 3
                            ? 'text-amber-700'
                            : (isLight ? 'text-emerald-700' : 'text-emerald-300')
                    }`}>
                      {standing.rank === 1 ? '1st' : standing.rank === 2 ? '2nd' : standing.rank === 3 ? '3rd' : `${standing.rank}th`}
                    </td>
                    <td className={`py-2 pr-2 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                      {standing.nickname}
                      {standing.isAI && (
                        <span className={`ml-1 text-xs ${isLight ? 'text-emerald-400' : 'text-emerald-500'}`}>(AI)</span>
                      )}
                    </td>
                    <td className={`py-2 pr-2 text-right font-mono ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                      {standing.cumulativeScore}
                    </td>
                    <td className={`py-2 pr-2 text-right ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                      {standing.gamesWon}
                    </td>
                    <td className={`py-2 text-right ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                      {standing.goingOutCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-Game Results */}
        {progress.completedGames.length > 0 && (
          <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <h2 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Game Results
            </h2>
            <div className="space-y-2">
              {progress.completedGames.map((game: MarathonGameResult) => (
                <div key={game.gameNumber}>
                  <button
                    onClick={() => setExpandedGame(expandedGame === game.gameNumber ? null : game.gameNumber)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                      isLight ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-emerald-900/50 hover:bg-emerald-900/70'
                    }`}
                  >
                    <span className={`font-medium ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                      Game {game.gameNumber}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                        Winner: {game.playerResults.find(r => r.won)?.nickname || '—'}
                      </span>
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedGame === game.gameNumber ? 'rotate-180' : ''} ${isLight ? 'text-emerald-500' : 'text-emerald-400'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {expandedGame === game.gameNumber && (
                    <div className={`mt-1 p-3 rounded-lg ${isLight ? 'bg-emerald-25' : 'bg-emerald-950/50'}`}>
                      {game.playerResults
                        .sort((a, b) => a.finalScore - b.finalScore)
                        .map((result) => (
                          <div
                            key={result.profileId}
                            className={`flex justify-between py-1 text-sm ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}
                          >
                            <span>
                              {result.placement === 1 ? '1st' : result.placement === 2 ? '2nd' : result.placement === 3 ? '3rd' : '4th'}{' '}
                              {result.nickname}
                            </span>
                            <span className="font-mono">{result.finalScore} pts</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onBack} className="btn-ghost flex-1">
            Back
          </button>
          {isCompleted ? (
            <div className={`flex-1 text-center py-3 rounded-lg font-medium ${isLight ? 'bg-green-100 text-green-800' : 'bg-green-900/50 text-green-200'}`}>
              Tournament Complete
            </div>
          ) : gameInProgress ? (
            <button
              onClick={() => navigate('/')}
              className="btn-primary flex-1"
            >
              Resume Game {progress.currentGameNumber}
            </button>
          ) : (
            <button
              onClick={handleContinue}
              disabled={hasContinued}
              className="btn-primary flex-1"
            >
              {hasContinued ? 'Waiting for others...' : 'Continue to Next Game'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
