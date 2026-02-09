/**
 * Socket Store - Manages WebSocket connection state
 */

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from './game-store';
import { useUIStore } from './ui-store';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

// Keys for localStorage
const STORAGE_ROOM_ID = 'hawaiian_rummy_roomId';
const STORAGE_PLAYER_NAME = 'hawaiian_rummy_playerName';

interface SocketState {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;

  // Actions
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  saveGameSession: (roomId: string, playerName: string) => void;
  clearGameSession: () => void;
  attemptReconnection: () => void;
}

// Create socket singleton outside of React's lifecycle
let socketInstance: Socket | null = null;

function getOrCreateSocket(): Socket {
  if (!socketInstance) {
    console.log('[socket-store] Creating socket singleton to:', window.location.origin);
    socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      path: '/socket.io/'
    });
  }
  return socketInstance;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connectionStatus: 'disconnected',

  connect: () => {
    const { socket, connectionStatus } = get();

    // Already connecting or connected
    if (connectionStatus === 'connecting' || connectionStatus === 'connected') {
      console.log('[socket-store] Already connecting/connected, skipping');
      return;
    }

    set({ connectionStatus: 'connecting' });

    const newSocket = getOrCreateSocket();

    // Only set up listeners if not already done
    if (!socket) {
      newSocket.on('connect', () => {
        console.log('[socket-store] Connected to server, socket id:', newSocket.id);
        set({ connectionStatus: 'connected' });

        // Attempt reconnection to game if we have saved session
        setTimeout(() => {
          get().attemptReconnection();
        }, 100);
      });

      newSocket.on('disconnect', () => {
        console.log('[socket-store] Disconnected from server');
        set({ connectionStatus: 'disconnected' });
      });

      newSocket.on('connect_error', (error) => {
        console.error('[socket-store] Connection error:', error);
        set({ connectionStatus: 'disconnected' });
      });

      console.log('[socket-store] Setting socket in store');
      set({ socket: newSocket });
    }

    // If already connected, update status
    if (newSocket.connected) {
      console.log('[socket-store] Socket already connected');
      set({ connectionStatus: 'connected' });
    }
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      socketInstance = null;
      set({ socket: null, connectionStatus: 'disconnected' });
    }
  },

  emit: (event, ...args) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit(event, ...args);
    } else {
      console.warn('[socket-store] Socket not connected, cannot emit:', event);
    }
  },

  saveGameSession: (roomId, playerName) => {
    try {
      localStorage.setItem(STORAGE_ROOM_ID, roomId);
      localStorage.setItem(STORAGE_PLAYER_NAME, playerName);
      console.log('[socket-store] Saved game session:', { roomId, playerName });
    } catch (e) {
      console.warn('[socket-store] Failed to save game session:', e);
    }
  },

  clearGameSession: () => {
    try {
      localStorage.removeItem(STORAGE_ROOM_ID);
      localStorage.removeItem(STORAGE_PLAYER_NAME);
      console.log('[socket-store] Cleared game session');
    } catch (e) {
      console.warn('[socket-store] Failed to clear game session:', e);
    }
  },

  attemptReconnection: () => {
    const { socket, connectionStatus } = get();

    if (connectionStatus !== 'connected' || !socket?.connected) {
      console.log('[socket-store] Cannot attempt reconnection - not connected');
      return;
    }

    // Only attempt reconnection if we're on the join screen
    // If we're already in a game, don't try to reconnect
    const currentAppPhase = useGameStore.getState().appPhase;
    if (currentAppPhase !== 'join') {
      console.log('[socket-store] Already in a game, skipping reconnection attempt');
      return;
    }

    try {
      const roomId = localStorage.getItem(STORAGE_ROOM_ID);
      const playerName = localStorage.getItem(STORAGE_PLAYER_NAME);

      if (!roomId || !playerName) {
        console.log('[socket-store] No saved game session to reconnect to');
        return;
      }

      console.log('[socket-store] Attempting reconnection to room:', roomId, 'as:', playerName);

      socket.emit('reconnectToGame', { roomId, playerName }, (response: { success: boolean; error?: string; roomId?: string }) => {
        if (response.success) {
          console.log('[socket-store] Reconnection successful!');
          // Update game store with room info
          useGameStore.getState().setRoomId(roomId);
          useGameStore.getState().setPlayerName(playerName);
        } else {
          console.log('[socket-store] Reconnection failed:', response.error);
          // Clear the session if reconnection failed
          get().clearGameSession();

          // Only show error if we're still on join screen (user hasn't started a new game)
          if (useGameStore.getState().appPhase === 'join') {
            useUIStore.getState().setErrorMessage(response.error || 'Failed to reconnect to game');

            // Auto-clear error after 5 seconds
            setTimeout(() => {
              useUIStore.getState().setErrorMessage(null);
            }, 5000);
          }
        }
      });
    } catch (e) {
      console.warn('[socket-store] Error during reconnection attempt:', e);
    }
  }
}));
