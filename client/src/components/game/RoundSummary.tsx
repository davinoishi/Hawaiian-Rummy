/**
 * RoundSummary - Shows round results and scores
 */

import { useGameStore } from '../../store';
import { usePlayerActions } from '../../hooks';

export function RoundSummary() {
  const {
    players,
    currentRound,
    hasContinued
  } = useGameStore();

  const { continueGame } = usePlayerActions();

  // Sort players by score (lowest is best in rummy)
  const sortedPlayers = [...(players || [])].sort((a, b) => a.score - b.score);

  // Find the round winner (player with 0 points this round)
  const roundWinner = players?.find(p => {
    const lastScore = p.roundScores?.[p.roundScores.length - 1];
    return lastScore === 0;
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel p-6 sm:p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          Round {(currentRound || 0) + 1} Complete!
        </h2>

        {roundWinner && (
          <p className="text-center text-yellow-400 mb-6">
            {roundWinner.isMe ? 'You went out!' : `${roundWinner.name} went out!`}
          </p>
        )}

        {/* Scores table */}
        <div className="mb-6">
          <h3 className="text-sm text-emerald-300 mb-3">Scores</h3>
          <div className="space-y-2">
            {sortedPlayers.map((player, index) => {
              const lastRoundScore = player.roundScores?.[player.roundScores.length - 1] ?? 0;
              return (
                <div
                  key={player.id}
                  className={`
                    flex items-center justify-between p-3 rounded-lg
                    ${player.isMe ? 'bg-blue-600/30 ring-1 ring-blue-400' : 'bg-emerald-700/50'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </span>
                    <span className="text-white">
                      {player.name}
                      {player.isMe && ' (You)'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">{player.score} pts</div>
                    <div className="text-xs text-emerald-300">
                      +{lastRoundScore} this round
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continue button */}
        <div className="text-center">
          {hasContinued ? (
            <div className="text-emerald-200">
              Waiting for other players...
            </div>
          ) : (
            <button
              onClick={continueGame}
              className="btn-primary px-8 py-3 text-lg"
            >
              Continue to Round {(currentRound || 0) + 2}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
