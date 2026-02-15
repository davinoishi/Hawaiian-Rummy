/**
 * Hawaiian Rummy - Tournament Socket Handlers
 * Handles tournament creation, joining, starting, chat, and lifecycle
 */

import { Socket, Server } from 'socket.io';
import { GameManager } from '../game-manager';
import { TournamentManager } from '../tournament-manager';
import type { CreateTournamentConfig } from '../../shared/tournament-types';
import type { SocketData } from './room-handler';

export interface TournamentHandlerDeps {
  io: Server;
  gameManager: GameManager;
  tournamentManager: TournamentManager;
  getSocketData: () => { roomId?: string; playerName?: string; playerId: string; profileId?: string };
  setSocketData: (data: Partial<SocketData>) => void;
}

export function setupTournamentHandlers(socket: Socket, deps: TournamentHandlerDeps) {
  const { io, tournamentManager, getSocketData, setSocketData } = deps;

  // Register this socket's setSocketData with the tournament manager
  // so it can set game room data when starting a tournament game
  tournamentManager.registerSocketDataSetter(socket.id, setSocketData);

  socket.on('disconnect', () => {
    tournamentManager.unregisterSocketDataSetter(socket.id);
  });

  /**
   * Create a new tournament
   */
  socket.on('createTournament', (config: CreateTournamentConfig, callback?: (data: any) => void) => {
    try {
      const tournament = tournamentManager.createTournament(config);

      // Store profile ID in socket data for this handler
      setSocketData({ profileId: config.hostProfileId });
      // Register profile->socket mapping for game room creation
      tournamentManager.registerProfileSocket(config.hostProfileId, socket.id);

      // Join socket to tournament room
      socket.join(`tournament-${tournament.id}`);

      const state = tournamentManager.getClientTournamentState(tournament.id);
      if (callback) {
        callback({ success: true, tournament: state });
      }
    } catch (err) {
      console.error('[TournamentHandler] Error creating tournament:', err);
      if (callback) {
        callback({ success: false, error: 'Failed to create tournament' });
      }
    }
  });

  /**
   * Join a tournament via invite code
   */
  socket.on('joinTournament', (data: { inviteCode: string; profileId: string }, callback?: (data: any) => void) => {
    try {
      const tournament = tournamentManager.joinTournament(data.inviteCode, data.profileId);

      if (!tournament) {
        if (callback) {
          callback({ success: false, error: 'Invalid invite code or tournament is full' });
        }
        return;
      }

      // Store profile ID in socket data
      setSocketData({ profileId: data.profileId });
      // Register profile->socket mapping for game room creation
      tournamentManager.registerProfileSocket(data.profileId, socket.id);

      // Join socket to tournament room
      socket.join(`tournament-${tournament.id}`);

      const state = tournamentManager.getClientTournamentState(tournament.id);
      if (callback) {
        callback({ success: true, tournament: state });
      }
    } catch (err) {
      console.error('[TournamentHandler] Error joining tournament:', err);
      if (callback) {
        callback({ success: false, error: 'Failed to join tournament' });
      }
    }
  });

  /**
   * Rejoin a tournament (reconnection from profile page)
   */
  socket.on('rejoinTournament', (data: { tournamentId: string; profileId: string }, callback?: (data: any) => void) => {
    try {
      const tournament = tournamentManager.getTournament(data.tournamentId);
      if (!tournament) {
        if (callback) callback({ success: false, error: 'Tournament not found' });
        return;
      }

      // Verify this profile is a participant
      const participant = tournament.participants.find(p => p.profileId === data.profileId && !p.isAI);
      if (!participant) {
        if (callback) callback({ success: false, error: 'Not a participant in this tournament' });
        return;
      }

      // Set up socket data and mappings (same as join)
      setSocketData({ profileId: data.profileId });
      tournamentManager.registerProfileSocket(data.profileId, socket.id);

      // Join socket to tournament room
      socket.join(`tournament-${tournament.id}`);

      // Mark participant as connected
      tournamentManager.setParticipantConnected(tournament.id, data.profileId, true);

      // Try to restore an in-progress game from before server restart
      const restoredRoomId = tournamentManager.restoreGameIfNeeded(tournament.id, socket.id, data.profileId);
      if (restoredRoomId) {
        // Join socket to the restored game room
        socket.join(restoredRoomId);

        // Set socket data for the game room
        setSocketData({ roomId: restoredRoomId, playerName: participant.nickname, profileId: data.profileId });

        // Send tournament state first
        const tState = tournamentManager.getClientTournamentState(tournament.id);
        if (callback) {
          callback({ success: true, tournament: tState });
        }

        // Then notify about the restored game
        socket.emit('tournamentGameStarting', { roomId: restoredRoomId });

        // Send the restored game state to the human player
        const clientGameState = deps.gameManager.getClientGameState(restoredRoomId, socket.id);
        if (clientGameState) {
          socket.emit('gameState', clientGameState);
        }

        console.log(`[TournamentHandler] Restored game for ${data.profileId} in room ${restoredRoomId}`);
        return;
      }

      const state = tournamentManager.getClientTournamentState(tournament.id);
      if (callback) {
        callback({ success: true, tournament: state });
      }
    } catch (err) {
      console.error('[TournamentHandler] Error rejoining tournament:', err);
      if (callback) {
        callback({ success: false, error: 'Failed to rejoin tournament' });
      }
    }
  });

  /**
   * Leave a tournament
   */
  socket.on('leaveTournament', (tournamentId: string) => {
    const socketData = getSocketData();
    const profileId = socketData.profileId;
    if (!profileId) return;

    tournamentManager.leaveTournament(tournamentId, profileId);
    socket.leave(`tournament-${tournamentId}`);
  });

  /**
   * Start the tournament (host only)
   */
  socket.on('startTournament', (tournamentId: string, callback?: (data: any) => void) => {
    const socketData = getSocketData();
    const profileId = socketData.profileId;
    if (!profileId) {
      if (callback) callback({ success: false, error: 'Not authenticated' });
      return;
    }

    const tournament = tournamentManager.getTournament(tournamentId);
    if (!tournament) {
      if (callback) callback({ success: false, error: 'Tournament not found' });
      return;
    }

    // Verify host
    if (tournament.hostProfileId !== profileId) {
      if (callback) callback({ success: false, error: 'Only the host can start the tournament' });
      return;
    }

    const success = tournamentManager.startTournament(tournamentId, socket.id);
    if (callback) {
      callback({ success, error: success ? undefined : 'Failed to start tournament' });
    }
  });

  /**
   * Send a chat message in the tournament
   */
  socket.on('sendTournamentChat', (data: { tournamentId: string; message: string }) => {
    const socketData = getSocketData();
    const profileId = socketData.profileId;
    if (!profileId) return;

    const chatMessage = tournamentManager.addChatMessage(data.tournamentId, profileId, data.message);
    if (chatMessage) {
      io.to(`tournament-${data.tournamentId}`).emit('tournamentChat', chatMessage);
    }
  });

  /**
   * Reclaim an AI-held slot
   */
  socket.on('reclaimSlot', (data: { tournamentId: string; profileId: string }) => {
    tournamentManager.reclaimSlot(data.tournamentId, data.profileId, socket.id);
  });

  /**
   * Delete a tournament (host only)
   */
  socket.on('deleteTournament', (data: string | { tournamentId: string; profileId: string }) => {
    let tournamentId: string;
    let profileId: string | undefined;

    if (typeof data === 'string') {
      tournamentId = data;
      profileId = getSocketData().profileId;
    } else {
      tournamentId = data.tournamentId;
      profileId = data.profileId;
    }

    if (!profileId) return;

    const tournament = tournamentManager.getTournament(tournamentId);
    if (!tournament) return;

    if (tournament.hostProfileId !== profileId) return;

    tournamentManager.deleteTournament(tournamentId);
  });

  /**
   * Player is ready for the next game
   */
  socket.on('continueTournament', (tournamentId: string) => {
    const socketData = getSocketData();
    const profileId = socketData.profileId;
    if (!profileId) return;

    tournamentManager.handleContinueVote(tournamentId, profileId);
  });

  /**
   * Request current tournament state (for reconnection)
   */
  socket.on('getTournamentState', (tournamentId: string, callback?: (data: any) => void) => {
    const state = tournamentManager.getClientTournamentState(tournamentId);
    if (callback) {
      callback({ success: !!state, tournament: state });
    }
  });

  /**
   * Get all active tournaments for a profile
   */
  socket.on('getMyTournaments', (data: { profileId: string }, callback?: (data: any) => void) => {
    const tournaments = tournamentManager.findTournamentsByProfileId(data.profileId);
    const summaries = tournaments.map(t => {
      const marathon = t as any;
      return {
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        inviteCode: t.inviteCode,
        hostProfileId: t.hostProfileId,
        currentGameNumber: marathon.currentGameNumber || 0,
        totalGames: marathon.totalGames || 10,
        humanCount: t.participants.filter((p: any) => !p.isAI).length,
        totalCount: t.participants.length,
        createdAt: t.createdAt,
      };
    });
    if (callback) {
      callback({ success: true, tournaments: summaries });
    }
  });
}
