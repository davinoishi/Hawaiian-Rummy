/**
 * JoinScreen - Initial screen for joining/creating games
 */

import { useState, useEffect } from 'react';
import { useSocketStore, useGameStore, useSettingsStore } from '../../store';
import { useAudio } from '../../hooks';

interface JoinScreenProps {
  onViewProfile?: () => void;
  onViewLeaderboard?: () => void;
  onCreateProfile?: () => void;
  onViewAbout?: () => void;
}

export function JoinScreen({ onViewProfile, onViewLeaderboard, onCreateProfile, onViewAbout }: JoinScreenProps) {
  const emit = useSocketStore((state) => state.emit);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const { playClick } = useAudio();

  const [name, setName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const passwordParam = params.get('p');

    if (roomParam) {
      setJoinRoomId(roomParam.toUpperCase());
      setShowJoinInput(true);

      if (passwordParam) {
        try {
          const decodedPassword = atob(passwordParam);
          setJoinPassword(decodedPassword);
          setShowPasswordField(true);
        } catch {
          // Invalid base64, ignore
        }
      }

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    playClick();
    setIsJoining(true);
    setPlayerName(name.trim());
    emit('createRoom', name.trim(), false);
  };

  const handleShowJoinInput = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    playClick();
    setShowJoinInput(true);
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!joinRoomId.trim()) {
      setError('Please enter a room code');
      return;
    }

    playClick();
    setIsJoining(true);
    setPlayerName(name.trim());
    emit('joinGame', {
      roomId: joinRoomId.trim().toUpperCase(),
      playerName: name.trim(),
      password: joinPassword.trim() || undefined
    });
  };

  const handleStartTutorial = () => {
    playClick();
    setPlayerName('Tutorial Player');
    emit('createRoom', 'Tutorial Player', true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel p-6 sm:p-8 w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <img
            src="/hawaiian-rummy-logo.png"
            alt="Hawaiian Rummy"
            className="w-32 h-32 mx-auto mb-4 drop-shadow-lg"
          />
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Hawaiian Rummy
          </h1>
          <p className="text-emerald-200 text-sm">
            A classic card game for up to 4 players
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Name input */}
        <div className="mb-6">
          <label className="block text-sm text-emerald-200 mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="Enter your name"
            className="input"
            maxLength={20}
            disabled={isJoining}
          />
        </div>

        {/* Game buttons */}
        {!showJoinInput && (
          <>
            <button
              onClick={handleCreateRoom}
              disabled={isJoining}
              className="btn-primary w-full mb-3 py-3 text-lg"
            >
              {isJoining ? 'Creating...' : 'Create New Game'}
            </button>

            <button
              onClick={handleShowJoinInput}
              disabled={isJoining}
              className="btn-secondary w-full mb-6 py-3"
            >
              Join Existing Game
            </button>
          </>
        )}

        {/* Join room form */}
        {showJoinInput && (
          <>
            {/* Room code input */}
            <div className="mb-4">
              <label className="block text-sm text-emerald-200 mb-2">
                Room Code
              </label>
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => {
                  setJoinRoomId(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="Enter room code"
                className="input uppercase"
                maxLength={6}
                disabled={isJoining}
                autoFocus
              />
            </div>

            {/* Password input for joining */}
            <div className="mb-4">
              <label className="block text-sm text-emerald-200 mb-2">
                Password {!showPasswordField && <span className="text-emerald-200/50">(if required)</span>}
              </label>
              <input
                type="password"
                value={joinPassword}
                onChange={(e) => {
                  setJoinPassword(e.target.value);
                  setError('');
                }}
                placeholder="Enter password if room is private"
                className="input"
                maxLength={20}
                disabled={isJoining}
              />
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={() => {
                  setShowJoinInput(false);
                  setJoinRoomId('');
                  setJoinPassword('');
                  setShowPasswordField(false);
                }}
                disabled={isJoining}
                className="btn-ghost flex-1 py-3"
              >
                Back
              </button>
              <button
                onClick={handleJoinRoom}
                disabled={isJoining || !joinRoomId.trim()}
                className="btn-primary flex-1 py-3"
              >
                {isJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </>
        )}

        {/* Tutorial */}
        <div className="pt-6 border-t border-white/20">
          <button
            onClick={handleStartTutorial}
            disabled={isJoining}
            className="btn-ghost w-full py-3 text-emerald-200"
          >
            Learn How to Play (Tutorial)
          </button>
        </div>

        {/* Profile & Leaderboard Links */}
        <div className="pt-4 border-t border-white/20 flex justify-center gap-4 text-sm">
          {onViewProfile ? (
            <button
              onClick={onViewProfile}
              className="text-emerald-300 hover:text-emerald-100 underline"
            >
              My Profile
            </button>
          ) : onCreateProfile && (
            <button
              onClick={onCreateProfile}
              className="text-emerald-300 hover:text-emerald-100 underline"
            >
              Create Profile
            </button>
          )}
          {onViewLeaderboard && (
            <button
              onClick={onViewLeaderboard}
              className="text-emerald-300 hover:text-emerald-100 underline"
            >
              Leaderboard
            </button>
          )}
          {onViewAbout && (
            <button
              onClick={onViewAbout}
              className="text-emerald-300 hover:text-emerald-100 underline"
            >
              About
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
