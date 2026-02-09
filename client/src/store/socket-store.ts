/**
 * Socket Store - Manages WebSocket connection state
 */

import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SocketState {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;

  // Actions
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
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
  }
}));
