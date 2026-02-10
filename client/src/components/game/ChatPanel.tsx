/**
 * ChatPanel - In-game chat component
 */

import { useState, useRef, useEffect } from 'react';
import { useGameStore, useSocketStore, useSettingsStore } from '../../store';

export function ChatPanel() {
  const { chatMessages, unreadChatCount, chatOpen, roomId } = useGameStore();
  const setChatOpen = useGameStore((state) => state.setChatOpen);
  const emit = useSocketStore((state) => state.emit);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to newest messages
  useEffect(() => {
    if (chatOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  // Focus input when opening
  useEffect(() => {
    if (chatOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [chatOpen]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || !roomId) return;

    emit('sendChatMessage', { roomId, message: trimmed });
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Collapsed chat button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-full ${isLight ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-emerald-700 hover:bg-emerald-600'} text-white shadow-lg transition-colors`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Chat
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-xs rounded-full">
              {unreadChatCount > 9 ? '9+' : unreadChatCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded chat panel */}
      {chatOpen && (
        <div className={`w-80 h-96 flex flex-col ${isLight ? 'bg-emerald-50/95 border-emerald-300' : 'bg-emerald-900/95 border-emerald-700/50'} rounded-lg shadow-xl border backdrop-blur-sm`}>
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-2 border-b ${isLight ? 'border-emerald-300' : 'border-emerald-700/50'}`}>
            <span className={`${isLight ? 'text-emerald-900' : 'text-white'} font-medium`}>Chat</span>
            <button
              onClick={() => setChatOpen(false)}
              className={`${isLight ? 'text-emerald-700 hover:text-emerald-900' : 'text-emerald-300 hover:text-white'} transition-colors`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 ? (
              <div className={`text-center ${isLight ? 'text-emerald-500' : 'text-emerald-400/50'} text-sm py-8`}>
                No messages yet. Say hi!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className={`font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{msg.playerName}</span>
                    <span className={`${isLight ? 'text-emerald-500' : 'text-emerald-500/50'} text-xs`}>{formatTime(msg.timestamp)}</span>
                  </div>
                  <p className={`${isLight ? 'text-emerald-900' : 'text-white/90'} break-words`}>{msg.message}</p>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={`p-2 border-t ${isLight ? 'border-emerald-300' : 'border-emerald-700/50'}`}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className={`flex-1 px-3 py-2 ${isLight ? 'bg-white border-emerald-300 text-emerald-900 placeholder-emerald-400' : 'bg-emerald-800/50 border-emerald-700/50 text-white placeholder-emerald-400/50'} border rounded-lg text-sm focus:outline-none focus:border-emerald-500`}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <div className={`text-right text-xs ${isLight ? 'text-emerald-500' : 'text-emerald-500/50'} mt-1`}>
              {message.length}/200
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
