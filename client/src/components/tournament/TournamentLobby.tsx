/**
 * TournamentLobby - Pre-game waiting room for tournaments
 * Shows participants, chat, invite code, and start button
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore, useSocketStore } from '../../store';
import { useTournamentStore } from '../../store/tournament-store';

interface TournamentLobbyProps {
  onBack: () => void;
}

export function TournamentLobby({ onBack }: TournamentLobbyProps) {
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';
  const emit = useSocketStore((state) => state.emit);
  const tournament = useTournamentStore((state) => state.tournament);

  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tournament?.recentChat]);

  const handleCopyCode = useCallback(() => {
    if (!tournament) return;
    navigator.clipboard.writeText(tournament.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [tournament]);

  const handleSendChat = useCallback(() => {
    if (!tournament || !chatInput.trim()) return;
    emit('sendTournamentChat', { tournamentId: tournament.id, message: chatInput.trim() });
    setChatInput('');
  }, [tournament, chatInput, emit]);

  const handleStart = useCallback(() => {
    if (!tournament) return;
    emit('startTournament', tournament.id, (response: { success: boolean; error?: string }) => {
      if (!response.success) {
        console.error('Failed to start tournament:', response.error);
      }
    });
  }, [tournament, emit]);

  const handleLeave = useCallback(() => {
    if (!tournament) return;
    emit('leaveTournament', tournament.id);
    useTournamentStore.getState().clearTournament();
    onBack();
  }, [tournament, emit, onBack]);

  if (!tournament) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLight ? 'bg-emerald-100' : 'bg-emerald-900'}`}>
        <p className={isLight ? 'text-emerald-800' : 'text-white'}>Loading tournament...</p>
      </div>
    );
  }

  const isHost = tournament.hostProfileId === localStorage.getItem('hawaiian-rummy-profile-id');
  const humanCount = tournament.participants.filter(p => !p.isAI).length;

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className={`panel p-6 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between mb-2">
            <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              {tournament.name}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-900/50 text-amber-200'}`}>
              Marathon - 10 Games
            </span>
          </div>

          {/* Invite Code */}
          <div className={`flex items-center gap-3 mt-4 p-3 rounded-lg ${isLight ? 'bg-emerald-50' : 'bg-emerald-900/50'}`}>
            <div className="flex-1">
              <p className={`text-xs ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>Invite Code</p>
              <p className={`text-2xl font-mono font-bold tracking-widest ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                {tournament.inviteCode}
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                copied
                  ? (isLight ? 'bg-green-200 text-green-800' : 'bg-green-700 text-white')
                  : (isLight ? 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800' : 'bg-emerald-700 hover:bg-emerald-600 text-white')
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Participants */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Players ({humanCount}/4)
          </h2>
          <div className="space-y-2">
            {tournament.participants.filter(p => !p.isAI).map((participant) => (
              <div
                key={participant.profileId}
                className={`flex items-center justify-between p-3 rounded-lg ${isLight ? 'bg-emerald-50' : 'bg-emerald-900/50'}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${participant.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className={`font-medium ${isLight ? 'text-emerald-900' : 'text-white'}`}>
                    {participant.nickname}
                  </span>
                </div>
                {participant.isHost && (
                  <span className={`text-xs px-2 py-0.5 rounded ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/50 text-amber-300'}`}>
                    Host
                  </span>
                )}
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: 4 - humanCount }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className={`flex items-center p-3 rounded-lg border-2 border-dashed ${isLight ? 'border-emerald-200' : 'border-emerald-700'}`}
              >
                <span className={`text-sm ${isLight ? 'text-emerald-400' : 'text-emerald-500'}`}>
                  AI will fill this slot
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Chat
          </h2>
          <div className={`h-48 overflow-y-auto mb-3 p-3 rounded-lg ${isLight ? 'bg-emerald-50' : 'bg-emerald-900/50'}`}>
            {tournament.recentChat.length === 0 ? (
              <p className={`text-sm ${isLight ? 'text-emerald-400' : 'text-emerald-500'}`}>
                No messages yet
              </p>
            ) : (
              tournament.recentChat.map((msg) => (
                <div key={msg.id} className="mb-2">
                  <span className={`text-sm font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                    {msg.nickname}:
                  </span>{' '}
                  <span className={`text-sm ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                    {msg.message}
                  </span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              placeholder="Type a message..."
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${isLight ? 'bg-white border-emerald-300 text-emerald-900' : 'bg-emerald-700 border-emerald-600 text-white'}`}
              maxLength={500}
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              className="btn-primary text-sm px-4"
            >
              Send
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handleLeave} className="btn-ghost flex-1">
            Leave Tournament
          </button>
          {isHost ? (
            <button onClick={handleStart} className="btn-primary flex-1">
              Start Tournament
            </button>
          ) : (
            <div className={`flex-1 text-center py-3 rounded-lg ${isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-900/50 text-emerald-400'}`}>
              Waiting for host to start...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
