/**
 * LobbyScreen - Waiting room before game starts
 */

import { useState } from 'react';
import { useSocketStore, useGameStore } from '../../store';
import { useAudio } from '../../hooks';

export function LobbyScreen() {
  const emit = useSocketStore((state) => state.emit);
  const { roomId, lobbyPlayers, playerName, roomPassword, setRoomPassword } = useGameStore();
  const { playClick } = useAudio();

  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(!!roomPassword);

  const isHost = lobbyPlayers[0]?.name === playerName;

  const handleCopyCode = async () => {
    if (!roomId) return;

    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      playClick();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateInviteLink = () => {
    const origin = window.location.origin;
    const currentPassword = roomPassword || password;
    let url = `${origin}?room=${roomId}`;
    if (currentPassword) {
      url += `&p=${btoa(currentPassword)}`;
    }
    return url;
  };

  const handleCopyInviteLink = async () => {
    const link = generateInviteLink();

    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      playClick();
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleSetPassword = () => {
    if (password.trim() && roomId) {
      emit('setRoomPassword', { roomId, password: password.trim() });
      setRoomPassword(password.trim());
      setPasswordSet(true);
      playClick();
    }
  };

  const handleStartGame = () => {
    playClick();
    emit('startGame', {});
  };

  const handleLeave = () => {
    playClick();
    emit('leaveRoom');
    useGameStore.getState().reset();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel p-6 sm:p-8 w-full max-w-md">
        {/* Room Code */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="text-emerald-200 text-sm">Room Code</p>
            {(roomPassword || passwordSet) && (
              <span className="text-yellow-400" title="Password protected">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
          <button
            onClick={handleCopyCode}
            className="group relative inline-flex items-center gap-2"
          >
            <span className="text-4xl font-mono font-bold text-white tracking-wider">
              {roomId}
            </span>
            <span className="text-white/50 group-hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </span>
            {copied && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                Copied!
              </span>
            )}
          </button>

          {/* Copy Invite Link button */}
          <div className="mt-3">
            <button
              onClick={handleCopyInviteLink}
              className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600/50 hover:bg-emerald-600/70 text-sm text-emerald-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Copy Invite Link
              {linkCopied && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Link Copied!
                </span>
              )}
            </button>
          </div>

          <p className="text-emerald-200/60 text-xs mt-2">
            Share the code or invite link with friends to join
          </p>
        </div>

        {/* Password setting - host only, if not already set */}
        {isHost && !roomPassword && !passwordSet && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-700/30">
            <label className="block text-sm text-emerald-200 mb-2">
              Room Password (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set a password"
                className="input flex-1"
                maxLength={20}
              />
              <button
                onClick={handleSetPassword}
                disabled={!password.trim()}
                className="btn-secondary px-4"
              >
                Set
              </button>
            </div>
            <p className="text-emerald-200/50 text-xs mt-1">
              Make your room private with a password
            </p>
          </div>
        )}

        {/* Players list */}
        <div className="mb-6">
          <h3 className="text-white font-medium mb-3">
            Players ({lobbyPlayers.length}/4)
          </h3>
          <div className="space-y-2">
            {lobbyPlayers.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-emerald-700/50"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-medium">
                  {player.name[0].toUpperCase()}
                </div>
                <span className="text-white flex-1">{player.name}</span>
                {index === 0 && (
                  <span className="text-xs text-yellow-400 bg-yellow-400/20 px-2 py-1 rounded">
                    Host
                  </span>
                )}
                {player.name === playerName && (
                  <span className="text-xs text-emerald-300">(You)</span>
                )}
              </div>
            ))}

            {/* Empty slots with AI fill message */}
            {Array.from({ length: 4 - lobbyPlayers.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-emerald-800/30 border border-dashed border-emerald-700/50"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-800/50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-emerald-600">AI will fill empty spots</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {isHost ? (
            <button
              onClick={handleStartGame}
              className="btn-primary w-full py-3 text-lg"
            >
              Start Game
            </button>
          ) : (
            <div className="text-center p-4 bg-emerald-700/30 rounded-lg">
              <div className="flex items-center justify-center gap-2 text-emerald-200">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Waiting for host to start...
              </div>
            </div>
          )}

          <button
            onClick={handleLeave}
            className="btn-ghost w-full py-2 text-red-300"
          >
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}
