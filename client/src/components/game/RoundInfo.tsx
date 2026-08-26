/**
 * RoundInfo - Displays current round and requirements
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, useSettingsStore, useGameStore } from '../../store';
import { useProfileStore } from '../../store/profile-store';
import { useSocketStore } from '../../store/socket-store';
import { useTournamentStore } from '../../store/tournament-store';
import { SettingsPanel } from '../ui/SettingsPanel';
import { useNavigate } from 'react-router-dom';
import { TURN_IDLE_WARNING } from '@shared/game-engine/constants';
import { getMeldsNeeded } from '@shared/game-engine/validation/requirements';
import type { RoundRequirement } from '@shared/game-engine/types';

const TURN_WARNING_SEC = TURN_IDLE_WARNING / 1000;

interface RoundInfoProps {
  round: number;
  requirement: RoundRequirement;
  isMyTurn: boolean;
  hasMetRequirements: boolean;
}

function RoundInfoComponent({ round, requirement, isMyTurn, hasMetRequirements }: RoundInfoProps) {
  const setShowHowToPlay = useUIStore((state) => state.setShowHowToPlay);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [tournamentExitModalOpen, setTournamentExitModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const { players, roomId, tutorialMode, unreadChatCount } = useGameStore();
  const myMelds = useGameStore((state) => state.myMelds);
  const currentRound = useGameStore((state) => state.currentRound) ?? 0;
  const setChatOpen = useGameStore((state) => state.setChatOpen);
  const turnTimeRemaining = useGameStore((state) => state.turnTimeRemaining) ?? 0;

  // The server only sends turnTimeRemaining on a broadcast, and an idle turn
  // produces no broadcasts - so count down locally from the last value we saw.
  const [localTurnTime, setLocalTurnTime] = useState(turnTimeRemaining);

  useEffect(() => {
    setLocalTurnTime(turnTimeRemaining);
    if (turnTimeRemaining <= 0) return;

    const interval = setInterval(() => {
      setLocalTurnTime((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [turnTimeRemaining]);

  const showTurnWarning = isMyTurn && localTurnTime > 0 && localTurnTime <= TURN_WARNING_SEC;

  // Progress toward the round goal. The goal line was binary until met, which
  // gave no sense of how far along you were in a 4-meld round.
  const needed = getMeldsNeeded(myMelds ?? [], currentRound);
  const setsDone = (requirement?.sets ?? 0) - needed.setsNeeded;
  const runsDone = (requirement?.runs ?? 0) - needed.runsNeeded;
  const progressParts = [
    (requirement?.sets ?? 0) > 0 ? `${setsDone}/${requirement.sets} sets` : null,
    (requirement?.runs ?? 0) > 0 ? `${runsDone}/${requirement.runs} runs` : null
  ].filter(Boolean);
  const { profileId } = useProfileStore();
  const { emit, clearGameSession } = useSocketStore();
  const reset = useGameStore((state) => state.reset);
  const navigate = useNavigate();

  const isInTournament = useTournamentStore((state) => state.isInTournament);
  const tournament = useTournamentStore((state) => state.tournament);

  // Check if this is a single-player game (only 1 non-AI player)
  const humanPlayers = players?.filter(p => !p.isAI) || [];
  const isSinglePlayer = humanPlayers.length === 1;
  const canSave = isSinglePlayer && profileId && !tutorialMode && !isInTournament;

  const handleSaveAndExit = useCallback(() => {
    console.log('[SAVE] handleSaveAndExit called', { roomId, profileId, isSaving });
    if (!roomId || !profileId) {
      console.log('[SAVE] Missing roomId or profileId');
      setSaveError('Missing room or profile information');
      return;
    }
    if (isSaving) {
      console.log('[SAVE] Already saving, ignoring');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    console.log('[SAVE] Emitting saveGame event');
    emit('saveGame', { roomId, profileId }, (response: { success?: boolean; error?: string }) => {
      console.log('[SAVE] Got response:', response);
      setIsSaving(false);
      if (response?.success) {
        console.log('[SAVE] Save successful, navigating to profile');
        // Clear the game session and return to profile page
        clearGameSession();
        reset();
        setSaveModalOpen(false);
        navigate(`/p/${profileId}`);
      } else {
        console.log('[SAVE] Save failed:', response?.error);
        setSaveError(response?.error || 'Failed to save game');
      }
    });
  }, [roomId, profileId, isSaving, emit, clearGameSession, reset, navigate]);

  const handleExitWithoutSaving = useCallback(() => {
    clearGameSession();
    reset();
    if (profileId) {
      navigate(`/p/${profileId}`);
    } else {
      navigate('/');
    }
  }, [clearGameSession, reset, profileId, navigate]);

  const handleTournamentExit = useCallback(() => {
    // Simply navigate to standings — game state stays intact in the store
    // and AppPhaseWatcher allows staying on tournament pages
    if (tournament) {
      navigate(`/tournament/${tournament.id}/standings`);
    } else if (profileId) {
      navigate(`/p/${profileId}`);
    } else {
      navigate('/');
    }
  }, [tournament, profileId, navigate]);

  return (
    <div className="panel p-3 mb-4">
      <div className="flex items-center justify-between gap-4">
        {/* Round number (and tournament info) */}
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            {isInTournament && tournament
              ? `${tournament.name}: Game ${(tournament.progress as any).currentGameNumber} - Round ${round}`
              : `Round ${round}`}
          </span>
          {isMyTurn && (
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                showTurnWarning
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-yellow-500 text-yellow-900'
              }`}
              title={showTurnWarning ? 'Your turn will be auto-played when this runs out' : undefined}
            >
              {showTurnWarning ? `Your Turn - ${localTurnTime}s` : 'Your Turn'}
            </span>
          )}
        </div>

        {/* Requirement */}
        <div className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
          ${hasMetRequirements
            ? (isLight ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-green-500/20 text-green-300 border border-green-500/50')
            : (isLight ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-700/50 text-emerald-200')}
        `}>
          {hasMetRequirements && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span>
            {hasMetRequirements
              ? 'Requirements Met!'
              : (
                <>
                  Goal: {requirement?.description || ''}
                  {progressParts.length > 0 && (
                    <span className={`ml-2 font-medium ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                      ({progressParts.join(' · ')})
                    </span>
                  )}
                </>
              )}
          </span>
        </div>

        {/* Help, Save, and Settings buttons */}
        <div className="flex items-center gap-1">
          {/* Chat toggle - phones only. The floating chat button overlaps the
              hand on a small screen, so it is docked here instead. */}
          <button
            onClick={() => setChatOpen(true)}
            className="btn-ghost p-2 relative sm:hidden"
            title="Chat"
          >
            <svg className={`w-5 h-5 ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {(unreadChatCount ?? 0) > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[10px] rounded-full">
                {(unreadChatCount ?? 0) > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowHowToPlay(true)}
            className="btn-ghost p-2"
            title="How to Play (?)"
          >
            <svg className={`w-5 h-5 ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {canSave && (
            <button
              onClick={() => setSaveModalOpen(true)}
              className="btn-ghost p-2"
              title="Save & Exit"
            >
              <svg className={`w-5 h-5 ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
          {isInTournament && (
            <button
              onClick={() => setTournamentExitModalOpen(true)}
              className="btn-ghost p-2"
              title="Exit Tournament Game"
            >
              <svg className={`w-5 h-5 ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="btn-ghost p-2"
            title="Settings (,)"
          >
            <svg className={`w-5 h-5 ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Settings panel */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Save & Exit Modal - rendered via portal to escape stacking context */}
      {saveModalOpen && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            // Close on backdrop click
            if (e.target === e.currentTarget && !isSaving) {
              setSaveModalOpen(false);
            }
          }}
        >
          <div
            className={`${isLight ? 'bg-white' : 'bg-gray-800'} rounded-lg p-6 max-w-md w-full shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={`text-xl font-bold mb-4 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Save & Exit
            </h2>
            <p className={`mb-6 ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
              Would you like to save your game? You can resume from your profile page later.
            </p>

            {saveError && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-300'}`}>
                {saveError}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSaveAndExit}
                disabled={isSaving}
                className="btn-primary w-full"
              >
                {isSaving ? 'Saving...' : 'Save & Exit'}
              </button>
              <button
                onClick={handleExitWithoutSaving}
                disabled={isSaving}
                className={`btn-ghost w-full ${isLight ? 'text-red-600' : 'text-red-400'}`}
              >
                Exit Without Saving
              </button>
              <button
                onClick={() => setSaveModalOpen(false)}
                disabled={isSaving}
                className="btn-ghost w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Tournament Exit Modal */}
      {tournamentExitModalOpen && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setTournamentExitModalOpen(false);
            }
          }}
        >
          <div
            className={`${isLight ? 'bg-white' : 'bg-gray-800'} rounded-lg p-6 max-w-md w-full shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={`text-xl font-bold mb-4 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Exit Tournament Game
            </h2>
            <p className={`mb-2 ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
              Your tournament progress is automatically saved. You can rejoin later using the invite code.
            </p>
            {tournament && (
              <p className={`mb-6 text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                Invite code: <span className="font-mono font-bold">{tournament.inviteCode}</span>
              </p>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleTournamentExit}
                className="btn-primary w-full"
              >
                Exit to Standings
              </button>
              <button
                onClick={() => setTournamentExitModalOpen(false)}
                className="btn-ghost w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export const RoundInfo = memo(RoundInfoComponent);
