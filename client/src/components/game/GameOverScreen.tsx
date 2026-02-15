/**
 * GameOverScreen - Shows final game results
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, useUIStore, useSocketStore } from '../../store';
import { useTournamentStore } from '../../store/tournament-store';
import { useAudio } from '../../hooks';
import { ChatPanel } from './ChatPanel';
import type { MarathonProgress } from '@shared/tournament-types';

export function GameOverScreen() {
  const { players, winner, isWinner, rematchVotes, hasVotedForRematch, roomId } = useGameStore();
  const emit = useSocketStore((state) => state.emit);
  const { playClick } = useAudio();
  const navigate = useNavigate();

  const tournament = useTournamentStore((state) => state.tournament);
  const isInTournament = useTournamentStore((state) => state.isInTournament);

  const [hasContinued, setHasContinued] = useState(false);

  // Sort players by score (lowest first for rummy)
  const sortedPlayers = [...(players || [])].sort((a, b) => a.score - b.score);

  const handleRematch = () => {
    playClick();
    useGameStore.getState().setHasVotedForRematch(true);
    emit('requestRematch', { roomId });
  };

  const handleLeave = () => {
    playClick();
    // Reset and go back to join
    useGameStore.getState().reset();
    useUIStore.getState().resetUI();
  };

  const handleTournamentContinue = useCallback(() => {
    if (!tournament) return;
    playClick();
    setHasContinued(true);
    emit('continueTournament', tournament.id);
  }, [tournament, emit, playClick]);

  const handleViewStandings = useCallback(() => {
    if (!tournament) return;
    playClick();
    navigate(`/tournament/${tournament.id}/standings`);
  }, [tournament, playClick, navigate]);

  // Tournament progress info
  const progress = tournament?.progress as MarathonProgress | undefined;
  const isTournamentComplete = tournament?.status === 'completed';
  const gameNumber = progress?.currentGameNumber || 0;
  const totalGames = progress?.totalGames || 10;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel p-6 sm:p-8 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isWinner ? 'You Win!' : 'Game Over'}
          </h1>
          {winner && (
            <p className="text-emerald-200">
              {isWinner ? 'Congratulations!' : `${winner.name} wins!`}
            </p>
          )}
          {isInTournament && (
            <p className="text-emerald-300 text-sm mt-2">
              {isTournamentComplete
                ? `${tournament?.name} - Tournament Complete`
                : `${tournament?.name} - Game ${gameNumber} of ${totalGames}`}
            </p>
          )}
        </div>

        {/* Final standings */}
        <div className="mb-8">
          <h3 className="text-lg font-medium text-white mb-4">Final Standings</h3>
          <div className="space-y-2">
            {sortedPlayers.map((player, index) => {
              const isWinningPlayer = player.id === winner?.id;
              return (
                <div
                  key={player.id}
                  className={`
                    flex items-center justify-between p-4 rounded-lg
                    ${isWinningPlayer
                      ? 'bg-yellow-500/20 border border-yellow-500/50'
                      : 'bg-emerald-700/50'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-bold
                      ${index === 0 ? 'bg-yellow-500 text-yellow-900' : 'bg-emerald-600 text-white'}
                    `}>
                      {index + 1}
                    </span>
                    <div>
                      <span className="text-white font-medium">{player.name}</span>
                      {player.isMe && (
                        <span className="ml-2 text-xs text-emerald-300">(You)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${isWinningPlayer ? 'text-yellow-400' : 'text-white'}`}>
                      {player.score} pts
                    </div>
                    <div className="text-xs text-emerald-300">
                      {player.wins} win{player.wins !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 rounded-lg bg-emerald-700/30 text-center">
            <div className="text-2xl font-bold text-white">10</div>
            <div className="text-sm text-emerald-200">Rounds Played</div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-700/30 text-center">
            <div className="text-2xl font-bold text-white">
              {winner?.score || 0}
            </div>
            <div className="text-sm text-emerald-200">Winning Score</div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {isInTournament ? (
            // Tournament-specific actions
            <>
              {isTournamentComplete ? (
                <button
                  onClick={handleViewStandings}
                  className="btn-primary w-full py-3 text-lg"
                >
                  View Final Standings
                </button>
              ) : hasContinued ? (
                <div className="text-center p-4 bg-emerald-700/30 rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-emerald-200 mb-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    Waiting for others...
                  </div>
                  <div className="text-sm text-emerald-300">
                    Next game will start when all players are ready
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleTournamentContinue}
                  className="btn-primary w-full py-3 text-lg"
                >
                  Continue to Game {gameNumber + 1}
                </button>
              )}
              <button
                onClick={handleViewStandings}
                className="btn-ghost w-full py-2 text-emerald-200"
              >
                View Tournament Standings
              </button>
            </>
          ) : (
            // Normal game actions
            <>
              {hasVotedForRematch ? (
                <div className="text-center p-4 bg-emerald-700/30 rounded-lg">
                  <div className="flex items-center justify-center gap-2 text-emerald-200 mb-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    Waiting for others...
                  </div>
                  {rematchVotes && (
                    <div className="text-sm text-emerald-300">
                      {rematchVotes.votedCount}/{rematchVotes.total} voted for rematch
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleRematch}
                  className="btn-primary w-full py-3 text-lg"
                >
                  Rematch
                </button>
              )}

              <button
                onClick={handleLeave}
                className="btn-ghost w-full py-2 text-emerald-200"
              >
                Leave Game
              </button>
            </>
          )}
        </div>
      </div>

      {/* Chat panel */}
      <ChatPanel />
    </div>
  );
}
