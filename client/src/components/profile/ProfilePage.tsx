/**
 * ProfilePage - User profile view
 * Displays stats, game history, and profile management options
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileStore, useSettingsStore, useSocketStore, useGameStore } from '../../store';
import { useTournamentStore } from '../../store/tournament-store';

interface SavedGameInfo {
  id: string;
  savedAt: string;
  currentRound: number;
  playerScore: number;
  aiOpponents: string[];
}

interface ProfilePageProps {
  profileId: string;
  onViewLeaderboard: () => void;
}

export function ProfilePage({ profileId, onViewLeaderboard }: ProfilePageProps) {
  const { profile, isLoading, error, loadProfile, updateNickname, deleteProfile } = useProfileStore();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const emit = useSocketStore((state) => state.emit);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Join game state
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Tournament state
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [tournamentName, setTournamentName] = useState('');
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [showJoinTournament, setShowJoinTournament] = useState(false);
  const [tournamentInviteCode, setTournamentInviteCode] = useState('');

  // Active tournaments
  interface TournamentSummary {
    id: string;
    name: string;
    type: string;
    status: string;
    inviteCode: string;
    hostProfileId: string;
    currentGameNumber: number;
    totalGames: number;
    humanCount: number;
    totalCount: number;
    createdAt: string;
  }
  const [activeTournaments, setActiveTournaments] = useState<TournamentSummary[]>([]);
  const [checkingTournaments, setCheckingTournaments] = useState(true);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);

  // Saved game state
  const [savedGame, setSavedGame] = useState<SavedGameInfo | null>(null);
  const [checkingSavedGame, setCheckingSavedGame] = useState(true);
  const [isResumingGame, setIsResumingGame] = useState(false);
  const [showDeleteSaveConfirm, setShowDeleteSaveConfirm] = useState(false);

  useEffect(() => {
    loadProfile(profileId);
  }, [profileId, loadProfile]);

  // Check for saved game when profile loads
  useEffect(() => {
    if (!profileId) return;

    setCheckingSavedGame(true);
    emit('checkSavedGame', { profileId }, (response: { hasSavedGame: boolean; savedGame?: SavedGameInfo }) => {
      setCheckingSavedGame(false);
      if (response.hasSavedGame && response.savedGame) {
        setSavedGame(response.savedGame);
      } else {
        setSavedGame(null);
      }
    });
  }, [profileId, emit]);

  // Check for active tournaments when profile loads
  useEffect(() => {
    if (!profileId) return;

    setCheckingTournaments(true);
    emit('getMyTournaments', { profileId }, (response: { success: boolean; tournaments?: TournamentSummary[] }) => {
      setCheckingTournaments(false);
      if (response.success && response.tournaments) {
        setActiveTournaments(response.tournaments);
      } else {
        setActiveTournaments([]);
      }
    });
  }, [profileId, emit]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/p/${profileId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [profileId]);

  const handleSaveNickname = useCallback(async () => {
    if (newNickname.trim()) {
      const success = await updateNickname(newNickname.trim());
      if (success) {
        setIsEditing(false);
      }
    }
  }, [newNickname, updateNickname]);

  const handleDelete = useCallback(async () => {
    const success = await deleteProfile();
    if (success) {
      window.location.href = '/';
    }
  }, [deleteProfile]);

  const handleResumeGame = useCallback(() => {
    if (!profile) return;
    setIsResumingGame(true);
    setPlayerName(profile.nickname);
    emit('loadSavedGame', { profileId: profile.id, playerName: profile.nickname }, (response: { success?: boolean; error?: string; roomId?: string }) => {
      if (response.success && response.roomId) {
        // Set room ID and save session for reconnection
        useGameStore.getState().setRoomId(response.roomId);
        useSocketStore.getState().saveGameSession(response.roomId, profile.nickname);
        // The game state will be sent via gameState event and handled by socket handlers
      } else {
        setIsResumingGame(false);
        setJoinError(response.error || 'Failed to resume game');
      }
    });
  }, [profile, emit, setPlayerName]);

  const handleDeleteSavedGame = useCallback(() => {
    if (!profileId) return;
    emit('deleteSavedGame', { profileId }, (response: { success?: boolean }) => {
      if (response.success) {
        setSavedGame(null);
        setShowDeleteSaveConfirm(false);
      }
    });
  }, [profileId, emit]);

  const handleCreateRoom = useCallback(() => {
    if (!profile) return;
    setIsJoining(true);
    setPlayerName(profile.nickname);
    // Pass profile ID to server so stats can be tracked
    emit('createRoom', profile.nickname, false, { profileId: profile.id });
  }, [profile, emit, setPlayerName]);

  const handleJoinRoom = useCallback(() => {
    if (!profile) return;
    if (!joinRoomId.trim()) {
      setJoinError('Please enter a room code');
      return;
    }
    setIsJoining(true);
    setJoinError('');
    setPlayerName(profile.nickname);
    emit('joinGame', {
      roomId: joinRoomId.trim().toUpperCase(),
      playerName: profile.nickname,
      password: joinPassword.trim() || undefined,
      profileId: profile.id  // Pass profile ID so stats can be tracked
    });
  }, [profile, joinRoomId, joinPassword, emit, setPlayerName]);

  const handleCreateTournament = useCallback(() => {
    if (!profile || !tournamentName.trim()) return;
    setIsCreatingTournament(true);
    setJoinError('');

    emit('createTournament', {
      name: tournamentName.trim(),
      type: 'marathon' as const,
      hostProfileId: profile.id,
    }, (response: { success: boolean; tournament?: any; error?: string }) => {
      setIsCreatingTournament(false);
      if (response.success && response.tournament) {
        useTournamentStore.getState().setTournament(response.tournament);
        navigate(`/tournament/${response.tournament.id}`);
      } else {
        setJoinError(response.error || 'Failed to create tournament');
      }
    });
  }, [profile, tournamentName, emit, navigate]);

  const handleJoinTournament = useCallback(() => {
    if (!profile || !tournamentInviteCode.trim()) return;
    setIsJoining(true);
    setJoinError('');

    emit('joinTournament', {
      inviteCode: tournamentInviteCode.trim().toUpperCase(),
      profileId: profile.id,
    }, (response: { success: boolean; tournament?: any; error?: string }) => {
      setIsJoining(false);
      if (response.success && response.tournament) {
        useTournamentStore.getState().setTournament(response.tournament);
        navigate(`/tournament/${response.tournament.id}`);
      } else {
        setJoinError(response.error || 'Invalid invite code');
      }
    });
  }, [profile, tournamentInviteCode, emit, navigate]);

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}>
        <div className="text-center">
          <div className={`animate-spin w-12 h-12 border-4 ${isLight ? 'border-emerald-600 border-t-transparent' : 'border-white border-t-transparent'} rounded-full mx-auto mb-4`} />
          <p className={isLight ? 'text-emerald-800' : 'text-white'}>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}>
        <div className={`text-center p-8 rounded-xl ${isLight ? 'bg-white' : 'bg-emerald-800'} shadow-xl`}>
          <h2 className={`text-xl font-bold mb-4 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Profile Not Found
          </h2>
          <p className={`mb-6 ${isLight ? 'text-emerald-700' : 'text-emerald-200'}`}>
            {error || 'This profile does not exist.'}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="btn-primary"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const winRate = profile.stats.gamesPlayed > 0
    ? Math.round((profile.stats.gamesWon / profile.stats.gamesPlayed) * 100)
    : 0;

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className={`panel p-6 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between mb-4">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  placeholder={profile.nickname}
                  className={`px-3 py-2 rounded-lg border ${isLight ? 'bg-white border-emerald-300' : 'bg-emerald-700 border-emerald-600'} ${isLight ? 'text-emerald-900' : 'text-white'}`}
                  maxLength={30}
                />
                <button onClick={handleSaveNickname} className="btn-primary text-sm">Save</button>
                <button onClick={() => setIsEditing(false)} className="btn-ghost text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                  {profile.nickname}
                </h1>
                <button
                  onClick={() => {
                    setNewNickname(profile.nickname);
                    setIsEditing(true);
                  }}
                  className={`p-1 rounded ${isLight ? 'hover:bg-emerald-100' : 'hover:bg-emerald-700'}`}
                  title="Edit nickname"
                >
                  <svg className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <p className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
            Member since {new Date(profile.createdAt).toLocaleDateString()}
          </p>

          {/* Action buttons */}
          <div className="mt-4 space-y-3">
            {joinError && (
              <div className={`p-3 rounded-lg text-sm ${isLight ? 'bg-red-100 text-red-700' : 'bg-red-900/30 text-red-300'}`}>
                {joinError}
              </div>
            )}

            {/* Saved Game Section */}
            {!checkingSavedGame && savedGame && (
              <div className={`p-4 rounded-lg mb-3 ${isLight ? 'bg-blue-50 border border-blue-200' : 'bg-blue-900/30 border border-blue-700/50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-semibold ${isLight ? 'text-blue-800' : 'text-blue-200'}`}>
                    Saved Game
                  </h3>
                  {!showDeleteSaveConfirm && (
                    <button
                      onClick={() => setShowDeleteSaveConfirm(true)}
                      className={`text-xs ${isLight ? 'text-red-600 hover:text-red-800' : 'text-red-400 hover:text-red-300'}`}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {showDeleteSaveConfirm ? (
                  <div className="space-y-2">
                    <p className={`text-sm ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                      Delete this saved game?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteSavedGame}
                        className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteSaveConfirm(false)}
                        className="btn-ghost text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`text-sm space-y-1 mb-3 ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                      <p>Round {savedGame.currentRound + 1} - Score: {savedGame.playerScore} pts</p>
                      <p className={isLight ? 'text-blue-500' : 'text-blue-400'}>
                        Saved {new Date(savedGame.savedAt).toLocaleString()}
                      </p>
                      <p className={isLight ? 'text-blue-500' : 'text-blue-400'}>
                        vs {savedGame.aiOpponents.join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={handleResumeGame}
                      disabled={isResumingGame || isJoining}
                      className="btn-primary w-full"
                    >
                      {isResumingGame ? 'Resuming...' : 'Resume Game'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Active Tournaments Section */}
            {!checkingTournaments && activeTournaments.length > 0 && (
              <div className={`p-4 rounded-lg mb-3 ${isLight ? 'bg-purple-50 border border-purple-200' : 'bg-purple-900/30 border border-purple-700/50'}`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-purple-800' : 'text-purple-200'}`}>
                  Active Tournaments
                </h3>
                <div className="space-y-2">
                  {activeTournaments.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg ${isLight ? 'bg-white/80' : 'bg-purple-800/30'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium truncate ${isLight ? 'text-purple-900' : 'text-purple-100'}`}>
                              {t.name}
                            </span>
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              t.type === 'marathon'
                                ? (isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-800/50 text-blue-300')
                                : t.type === 'first-to-5000'
                                ? (isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-800/50 text-amber-300')
                                : (isLight ? 'bg-green-100 text-green-700' : 'bg-green-800/50 text-green-300')
                            }`}>
                              {t.type === 'marathon' ? 'Marathon' : t.type === 'first-to-5000' ? '5000' : 'March Madness'}
                            </span>
                          </div>
                          <div className={`text-xs mt-1 ${isLight ? 'text-purple-500' : 'text-purple-400'}`}>
                            {t.status === 'completed'
                              ? 'Completed'
                              : `Game ${t.currentGameNumber} of ${t.totalGames}`}
                            {' · '}{t.humanCount} player{t.humanCount !== 1 ? 's' : ''}
                            {' · '}<span className="font-mono">{t.inviteCode}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            onClick={() => {
                              emit('rejoinTournament', { tournamentId: t.id, profileId }, (response: { success: boolean; tournament?: any }) => {
                                if (response.success && response.tournament) {
                                  useTournamentStore.getState().setTournament(response.tournament);
                                }
                              });
                              navigate(`/tournament/${t.id}/standings`);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-lg ${isLight ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                          >
                            {t.status === 'completed' ? 'View Results' : 'Resume'}
                          </button>
                          {t.hostProfileId === profileId && (
                            deletingTournamentId === t.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    emit('deleteTournament', { tournamentId: t.id, profileId });
                                    setActiveTournaments(prev => prev.filter(at => at.id !== t.id));
                                    setDeletingTournamentId(null);
                                  }}
                                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setDeletingTournamentId(null)}
                                  className="px-2 py-1 text-xs btn-ghost"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletingTournamentId(t.id)}
                                className={`p-1.5 rounded ${isLight ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-900/30 text-red-400'}`}
                                title="Delete tournament"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!showJoinInput ? (
              <div className="flex gap-3">
                <button
                  onClick={handleCreateRoom}
                  disabled={isJoining || isResumingGame}
                  className="btn-primary flex-1"
                >
                  {isJoining ? 'Creating...' : 'Create New Game'}
                </button>
                <button
                  onClick={() => setShowJoinInput(true)}
                  disabled={isJoining || isResumingGame}
                  className="btn-secondary flex-1"
                >
                  Join Existing Game
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm mb-1 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(e) => {
                      setJoinRoomId(e.target.value.toUpperCase());
                      setJoinError('');
                    }}
                    placeholder="Enter room code"
                    className={`w-full px-4 py-2 rounded-lg border uppercase ${isLight ? 'bg-white border-emerald-300 text-emerald-900' : 'bg-emerald-700 border-emerald-600 text-white'}`}
                    maxLength={6}
                    disabled={isJoining}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={`block text-sm mb-1 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                    Password <span className={isLight ? 'text-emerald-400' : 'text-emerald-500'}>(if required)</span>
                  </label>
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder="Enter password if room is private"
                    className={`w-full px-4 py-2 rounded-lg border ${isLight ? 'bg-white border-emerald-300 text-emerald-900' : 'bg-emerald-700 border-emerald-600 text-white'}`}
                    maxLength={20}
                    disabled={isJoining}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowJoinInput(false);
                      setJoinRoomId('');
                      setJoinPassword('');
                      setJoinError('');
                    }}
                    disabled={isJoining}
                    className="btn-ghost flex-1"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleJoinRoom}
                    disabled={isJoining || !joinRoomId.trim()}
                    className="btn-primary flex-1"
                  >
                    {isJoining ? 'Joining...' : 'Join Game'}
                  </button>
                </div>
              </div>
            )}

            <button onClick={onViewLeaderboard} className="btn-ghost w-full">
              View Leaderboard
            </button>

            {/* Tournament Section */}
            <div className={`border-t pt-3 ${isLight ? 'border-emerald-200' : 'border-emerald-700'}`}>
              {!showTournamentForm && !showJoinTournament ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowTournamentForm(true)}
                    disabled={isJoining || isResumingGame}
                    className="btn-secondary flex-1"
                  >
                    Host Tournament
                  </button>
                  <button
                    onClick={() => setShowJoinTournament(true)}
                    disabled={isJoining || isResumingGame}
                    className="btn-ghost flex-1"
                  >
                    Join Tournament
                  </button>
                </div>
              ) : showTournamentForm ? (
                <div className="space-y-3">
                  <div>
                    <label className={`block text-sm mb-1 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                      Tournament Name
                    </label>
                    <input
                      type="text"
                      value={tournamentName}
                      onChange={(e) => setTournamentName(e.target.value)}
                      placeholder="Enter tournament name"
                      className={`w-full px-4 py-2 rounded-lg border ${isLight ? 'bg-white border-emerald-300 text-emerald-900' : 'bg-emerald-700 border-emerald-600 text-white'}`}
                      maxLength={40}
                      disabled={isCreatingTournament}
                      autoFocus
                    />
                  </div>
                  <div className={`text-xs ${isLight ? 'text-emerald-500' : 'text-emerald-400'}`}>
                    Marathon: 4 players, 10 full games, lowest cumulative score wins
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowTournamentForm(false);
                        setTournamentName('');
                        setJoinError('');
                      }}
                      disabled={isCreatingTournament}
                      className="btn-ghost flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTournament}
                      disabled={isCreatingTournament || !tournamentName.trim()}
                      className="btn-primary flex-1"
                    >
                      {isCreatingTournament ? 'Creating...' : 'Create Tournament'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={`block text-sm mb-1 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                      Invite Code
                    </label>
                    <input
                      type="text"
                      value={tournamentInviteCode}
                      onChange={(e) => {
                        setTournamentInviteCode(e.target.value.toUpperCase());
                        setJoinError('');
                      }}
                      placeholder="Enter invite code"
                      className={`w-full px-4 py-2 rounded-lg border uppercase ${isLight ? 'bg-white border-emerald-300 text-emerald-900' : 'bg-emerald-700 border-emerald-600 text-white'}`}
                      maxLength={6}
                      disabled={isJoining}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowJoinTournament(false);
                        setTournamentInviteCode('');
                        setJoinError('');
                      }}
                      disabled={isJoining}
                      className="btn-ghost flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleJoinTournament}
                      disabled={isJoining || !tournamentInviteCode.trim()}
                      className="btn-primary flex-1"
                    >
                      {isJoining ? 'Joining...' : 'Join Tournament'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.gamesPlayed}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Games Played
            </div>
          </div>
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.gamesWon}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Games Won
            </div>
          </div>
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {winRate}%
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Win Rate
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.goingOutCount}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Going Out
            </div>
          </div>
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.currentWinStreak}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Current Streak
            </div>
          </div>
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.longestWinStreak}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Best Streak
            </div>
          </div>
        </div>

        {/* Tournament Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.tournamentsEntered || 0}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Tournaments Entered
            </div>
          </div>
          <div className={`panel p-4 text-center ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <div className={`text-3xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {profile.stats.tournamentsWon || 0}
            </div>
            <div className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
              Tournaments Won
            </div>
          </div>
        </div>

        {/* Score Records */}
        <div className="grid grid-cols-2 gap-4">
          {/* Best Scores */}
          <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <h3 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Best Games (Lowest)
            </h3>
            {profile.bestGameScores.length === 0 ? (
              <p className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>No games yet</p>
            ) : (
              <ul className="space-y-1">
                {profile.bestGameScores.slice(0, 5).map((score, i) => (
                  <li key={i} className={`text-sm flex justify-between ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                    <span>{i + 1}. {score.score} pts</span>
                    <span className={isLight ? 'text-emerald-500' : 'text-emerald-400'}>
                      {new Date(score.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Worst Scores */}
          <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <h3 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Worst Games (Highest)
            </h3>
            {profile.worstGameScores.length === 0 ? (
              <p className={`text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>No games yet</p>
            ) : (
              <ul className="space-y-1">
                {profile.worstGameScores.slice(0, 5).map((score, i) => (
                  <li key={i} className={`text-sm flex justify-between ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                    <span>{i + 1}. {score.score} pts</span>
                    <span className={isLight ? 'text-emerald-500' : 'text-emerald-400'}>
                      {new Date(score.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recent Games */}
        {profile.recentGames.length > 0 && (
          <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
            <h3 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              Recent Games
            </h3>
            <div className="space-y-2">
              {profile.recentGames.slice(0, 10).map((game, i) => (
                <div key={i} className={`flex justify-between items-center text-sm py-2 border-b ${isLight ? 'border-emerald-200' : 'border-emerald-700'} last:border-0`}>
                  <div className="flex items-center gap-3">
                    <span className={game.won ? 'text-green-500 font-bold' : (isLight ? 'text-emerald-700' : 'text-emerald-300')}>
                      {game.placement === 1 ? '🥇' : game.placement === 2 ? '🥈' : game.placement === 3 ? '🥉' : `${game.placement}th`}
                    </span>
                    <span className={isLight ? 'text-emerald-800' : 'text-emerald-200'}>
                      {game.myScore} pts
                    </span>
                  </div>
                  <span className={isLight ? 'text-emerald-500' : 'text-emerald-400'}>
                    {new Date(game.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile URL Warning */}
        <div className={`panel p-4 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/30 border-amber-700/50'} border`}>
          <div className="flex items-start gap-3">
            <svg className={`w-5 h-5 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className={`font-medium ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>
                Your profile URL is your only login
              </p>
              <p className={`text-sm mt-1 ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                Save this link! There is no recovery if you lose it.
              </p>
              <button
                onClick={handleCopyLink}
                className={`mt-2 text-sm px-3 py-1 rounded ${isLight ? 'bg-amber-200 hover:bg-amber-300 text-amber-800' : 'bg-amber-700 hover:bg-amber-600 text-white'}`}
              >
                {copied ? 'Copied!' : 'Copy Profile Link'}
              </button>
            </div>
          </div>
        </div>

        {/* Delete Profile */}
        <div className={`panel p-4 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border`}>
          {showDeleteConfirm ? (
            <div className="text-center">
              <p className={`font-medium mb-3 ${isLight ? 'text-red-800' : 'text-red-200'}`}>
                Are you sure? This cannot be undone.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className={`w-full text-sm ${isLight ? 'text-red-600 hover:text-red-800' : 'text-red-400 hover:text-red-300'}`}
            >
              Delete Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
