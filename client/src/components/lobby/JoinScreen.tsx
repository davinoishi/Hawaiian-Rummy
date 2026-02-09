/**
 * JoinScreen - Initial screen for joining/creating games
 */

import { useState } from 'react';
import { useSocketStore, useGameStore } from '../../store';
import { useAudio } from '../../hooks';

export function JoinScreen() {
  const emit = useSocketStore((state) => state.emit);
  const setPlayerName = useGameStore((state) => state.setPlayerName);
  const { playClick } = useAudio();

  const [name, setName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateRoom = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    playClick();
    setIsJoining(true);
    setPlayerName(name.trim());
    // Server expects: (playerName, tutorialMode, callback)
    emit('createRoom', name.trim(), false);
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
    emit('joinGame', { roomId: joinRoomId.trim().toUpperCase(), playerName: name.trim() });
  };

  const handleStartTutorial = () => {
    playClick();
    setPlayerName('Tutorial Player');
    // Server expects: (playerName, tutorialMode, callback)
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

        {/* Create Room */}
        <button
          onClick={handleCreateRoom}
          disabled={isJoining}
          className="btn-primary w-full mb-4 py-3 text-lg"
        >
          {isJoining ? 'Creating...' : 'Create New Game'}
        </button>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-white/20" />
          <span className="px-3 text-sm text-white/50">or</span>
          <div className="flex-1 border-t border-white/20" />
        </div>

        {/* Join Room */}
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
          />
        </div>

        <button
          onClick={handleJoinRoom}
          disabled={isJoining || !joinRoomId.trim()}
          className="btn-secondary w-full mb-6 py-3"
        >
          Join Game
        </button>

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
      </div>
    </div>
  );
}
