/**
 * Hawaiian Rummy - Tournament Manager
 * Manages tournament lifecycle, persistence, and game coordination
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GameManager } from './game-manager.js';
import { AIManager } from './ai/ai-manager.js';
import { profileManager } from './profile-manager.js';
import type {
  Tournament,
  MarathonTournament,
  MarathonGameResult,
  TournamentParticipant,
  TournamentStanding,
  TournamentChatMessage,
  ClientTournamentState,
  MarathonProgress,
  CreateTournamentConfig,
} from '../shared/tournament-types.js';
import { HAWAIIAN_CITY_NAMES } from '../shared/tournament-types.js';
import type { GamePlayerResult, SavedGameState } from '../shared/profile-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOURNAMENTS_FILE = path.join(__dirname, '../data/tournaments.json');
const NEXT_GAME_DELAY = 3000; // ms before starting next game

function ensureDataDir() {
  const dir = path.join(__dirname, '../data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type SocketDataSetter = (data: { roomId?: string; playerName?: string; profileId?: string }) => void;

export class TournamentManager {
  private tournaments: Map<string, Tournament> = new Map();
  private roomToTournament: Map<string, string> = new Map();
  private inviteCodeToTournament: Map<string, string> = new Map();
  private continueVotes: Map<string, Set<string>> = new Map(); // tournamentId -> set of profileIds who voted
  private socketDataSetters: Map<string, SocketDataSetter> = new Map(); // socketId -> setter
  private profileToSocket: Map<string, string> = new Map(); // profileId -> socketId
  private pendingGameRestores: Map<string, SavedGameState> = new Map(); // tournamentId -> saved game state

  constructor(
    private gameManager: GameManager,
    private aiManager: AIManager,
    private io: Server,
    private _profileManager: typeof profileManager
  ) {}

  registerSocketDataSetter(socketId: string, setter: SocketDataSetter): void {
    this.socketDataSetters.set(socketId, setter);
  }

  unregisterSocketDataSetter(socketId: string): void {
    this.socketDataSetters.delete(socketId);
    // Clean up profile mapping
    for (const [profileId, sid] of this.profileToSocket) {
      if (sid === socketId) {
        this.profileToSocket.delete(profileId);
        break;
      }
    }
  }

  registerProfileSocket(profileId: string, socketId: string): void {
    this.profileToSocket.set(profileId, socketId);
  }

  // ===== PERSISTENCE =====

  loadTournaments(): void {
    try {
      if (fs.existsSync(TOURNAMENTS_FILE)) {
        const data = fs.readFileSync(TOURNAMENTS_FILE, 'utf8');
        const tournamentsArray: any[] = JSON.parse(data);
        for (const raw of tournamentsArray) {
          const t = raw as Tournament;
          // Only load non-completed tournaments
          if (t.status !== 'completed' && t.status !== 'abandoned') {
            // Reset connection status — nobody is connected after a server restart
            for (const p of t.participants) {
              if (!p.isAI) p.isConnected = false;
            }

            const marathon = t as MarathonTournament;
            if (marathon.completedGames) {
              if (raw.activeGameState) {
                // Game was in progress when server stopped — count it
                marathon.currentGameNumber = marathon.completedGames.length + 1;
                this.pendingGameRestores.set(t.id, raw.activeGameState as SavedGameState);
                console.log(`[TournamentManager] Pending game restore for tournament ${t.id} (game ${marathon.currentGameNumber}, round ${raw.activeGameState.currentRound + 1})`);
              } else {
                // No in-progress game — sync with completed count
                marathon.currentGameNumber = marathon.completedGames.length;
              }
            }

            // Remove activeGameState from the in-memory tournament object
            delete (t as any).activeGameState;
            // Clear stale activeRoomId — the room no longer exists after restart
            t.activeRoomId = undefined;

            this.tournaments.set(t.id, t);
            this.inviteCodeToTournament.set(t.inviteCode, t.id);
          }
        }
        console.log(`[TournamentManager] Loaded ${this.tournaments.size} active tournaments`);
      }
    } catch (err) {
      console.error('[TournamentManager] Error loading tournaments:', err);
    }
  }

  private saveTournaments(): void {
    try {
      ensureDataDir();
      const tournamentsArray = Array.from(this.tournaments.values()).map(t => {
        // Snapshot active game state for in-progress tournaments
        if (t.status === 'in-progress' && t.activeRoomId) {
          const gameState = this.gameManager.getSaveableGameState(t.activeRoomId);
          if (gameState && gameState.gamePhase !== 'gameOver') {
            return { ...t, activeGameState: gameState };
          }
        }
        return t;
      });
      fs.writeFileSync(TOURNAMENTS_FILE, JSON.stringify(tournamentsArray, null, 2));
    } catch (err) {
      console.error('[TournamentManager] Error saving tournaments:', err);
    }
  }

  // ===== PUBLIC METHODS =====

  createTournament(config: CreateTournamentConfig): Tournament {
    const id = generateId();
    let inviteCode = generateInviteCode();
    // Ensure unique invite code
    while (this.inviteCodeToTournament.has(inviteCode)) {
      inviteCode = generateInviteCode();
    }

    const hostProfile = this._profileManager.getProfile(config.hostProfileId);
    const hostNickname = hostProfile?.nickname || 'Host';

    const tournament: MarathonTournament = {
      id,
      name: config.name,
      type: 'marathon',
      status: 'lobby',
      hostProfileId: config.hostProfileId,
      inviteCode,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      participants: [
        {
          profileId: config.hostProfileId,
          nickname: hostNickname,
          isAI: false,
          isHost: true,
          isConnected: true,
          joinedAt: new Date().toISOString(),
        },
      ],
      chatMessages: [],
      totalGames: 10,
      completedGames: [],
      currentGameNumber: 0,
      cumulativeScores: { [config.hostProfileId]: 0 },
      standings: [],
    };

    this.tournaments.set(id, tournament);
    this.inviteCodeToTournament.set(inviteCode, id);
    this.saveTournaments();

    console.log(`[TournamentManager] Created tournament "${config.name}" (${id}) with invite code ${inviteCode}`);
    return tournament;
  }

  joinTournament(inviteCode: string, profileId: string): Tournament | null {
    const tournamentId = this.inviteCodeToTournament.get(inviteCode.toUpperCase());
    if (!tournamentId) return null;

    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return null;

    if (tournament.status !== 'lobby') return null;

    // Check if already joined
    if (tournament.participants.some(p => p.profileId === profileId)) {
      return tournament;
    }

    // Max 4 human participants for marathon
    const humanCount = tournament.participants.filter(p => !p.isAI).length;
    if (humanCount >= 4) return null;

    const profile = this._profileManager.getProfile(profileId);
    const nickname = profile?.nickname || 'Player';

    tournament.participants.push({
      profileId,
      nickname,
      isAI: false,
      isHost: false,
      isConnected: true,
      joinedAt: new Date().toISOString(),
    });

    if (tournament.type === 'marathon') {
      (tournament as MarathonTournament).cumulativeScores[profileId] = 0;
    }

    tournament.lastActivityAt = new Date().toISOString();
    this.saveTournaments();
    this.broadcastTournamentState(tournamentId);

    console.log(`[TournamentManager] ${nickname} joined tournament ${tournamentId}`);
    return tournament;
  }

  leaveTournament(tournamentId: string, profileId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;

    // Can only leave during lobby
    if (tournament.status !== 'lobby') return;

    // Host leaving deletes the tournament
    if (tournament.hostProfileId === profileId) {
      this.deleteTournament(tournamentId);
      return;
    }

    tournament.participants = tournament.participants.filter(p => p.profileId !== profileId);

    if (tournament.type === 'marathon') {
      delete (tournament as MarathonTournament).cumulativeScores[profileId];
    }

    tournament.lastActivityAt = new Date().toISOString();
    this.saveTournaments();
    this.broadcastTournamentState(tournamentId);
  }

  startTournament(tournamentId: string, hostSocketId: string): boolean {
    const tournament = this.tournaments.get(tournamentId) as MarathonTournament | undefined;
    if (!tournament) return false;
    if (tournament.status !== 'lobby') return false;

    tournament.status = 'in-progress';
    tournament.startedAt = new Date().toISOString();
    tournament.currentGameNumber = 1;
    tournament.lastActivityAt = new Date().toISOString();

    // Fill with AI to reach 4 players
    this.fillWithAI(tournamentId);

    // Create game room
    const roomId = this.createTournamentGameRoom(tournament, hostSocketId);
    if (!roomId) {
      tournament.status = 'lobby';
      return false;
    }

    tournament.activeRoomId = roomId;
    this.roomToTournament.set(roomId, tournamentId);
    this.saveTournaments();

    // Start the game
    this.gameManager.startGame(roomId);
    this.broadcastTournamentState(tournamentId);

    // Emit game starting event to tournament socket room
    this.io.to(`tournament-${tournamentId}`).emit('tournamentGameStarting', { roomId });

    console.log(`[TournamentManager] Tournament ${tournamentId} started, game 1 in room ${roomId}`);
    return true;
  }

  isGameInTournament(roomId: string): boolean {
    return this.roomToTournament.has(roomId);
  }

  handleGameCompleted(roomId: string): void {
    const tournamentId = this.roomToTournament.get(roomId);
    if (!tournamentId) return;

    const tournament = this.tournaments.get(tournamentId) as MarathonTournament;
    if (!tournament || tournament.type !== 'marathon') return;

    const state = this.gameManager.getGameState(roomId);
    if (!state) return;

    // Build game result
    const playerResults: GamePlayerResult[] = [];
    const playerScores: { playerId: string; score: number; roundsWon: number }[] = [];

    for (const playerId of state.players) {
      const ps = state.playerStates[playerId];
      playerScores.push({ playerId, score: ps.score, roundsWon: ps.roundsWon });
    }

    playerScores.sort((a, b) => a.score - b.score);

    for (const result of playerScores) {
      const playerName = state.playerNames[result.playerId] || 'Unknown';
      const placement = playerScores.indexOf(result) + 1;
      const participant = this.findParticipantBySocketId(tournament, result.playerId);
      const profileId = participant?.profileId || result.playerId;

      playerResults.push({
        profileId,
        nickname: playerName,
        isAI: participant?.isAI ?? true,
        finalScore: result.score,
        placement,
        won: placement === 1,
        goingOutCount: result.roundsWon,
        roundsPlayed: state.currentRound + 1,
      });
    }

    const gameResult: MarathonGameResult = {
      gameNumber: tournament.currentGameNumber,
      completedAt: new Date().toISOString(),
      playerResults,
    };

    tournament.completedGames.push(gameResult);

    // Update cumulative scores
    for (const result of playerResults) {
      if (tournament.cumulativeScores[result.profileId] !== undefined) {
        tournament.cumulativeScores[result.profileId] += result.finalScore;
      } else {
        tournament.cumulativeScores[result.profileId] = result.finalScore;
      }
    }

    // Update standings
    tournament.standings = this.computeStandings(tournament);
    tournament.lastActivityAt = new Date().toISOString();

    // Emit game completed
    this.io.to(`tournament-${tournamentId}`).emit('tournamentGameCompleted', {
      standings: tournament.standings,
    });

    if (tournament.currentGameNumber >= tournament.totalGames) {
      // Tournament complete
      tournament.status = 'completed';
      tournament.completedAt = new Date().toISOString();
      tournament.winnerId = tournament.standings[0]?.profileId;

      // Record games to profiles
      this.recordTournamentToProfiles(tournament);

      this.io.to(`tournament-${tournamentId}`).emit('tournamentCompleted', {
        winnerId: tournament.winnerId || '',
        standings: tournament.standings,
      });

      console.log(`[TournamentManager] Tournament ${tournamentId} completed. Winner: ${tournament.winnerId}`);
    }

    this.saveTournaments();
    this.broadcastTournamentState(tournamentId);
  }

  handleContinueVote(tournamentId: string, profileId: string): void {
    const tournament = this.tournaments.get(tournamentId) as MarathonTournament;
    if (!tournament || tournament.type !== 'marathon') return;
    if (tournament.status === 'completed') return;
    // Use completedGames count as source of truth (not currentGameNumber which can drift)
    if (tournament.completedGames.length >= tournament.totalGames) return;

    // Verify the voter is actually a human participant
    const isParticipant = tournament.participants.some(p => p.profileId === profileId && !p.isAI);
    if (!isParticipant) return;

    if (!this.continueVotes.has(tournamentId)) {
      this.continueVotes.set(tournamentId, new Set());
    }
    const votes = this.continueVotes.get(tournamentId)!;
    votes.add(profileId);

    // Check if all humans have voted (use all human participants, not just connected ones)
    const humanParticipants = tournament.participants.filter(p => !p.isAI);
    const allVoted = humanParticipants.every(p => votes.has(p.profileId));

    console.log(`[TournamentManager] Continue vote: ${profileId} for tournament ${tournamentId} (${votes.size}/${humanParticipants.length} voted)`);

    if (allVoted) {
      votes.clear();
      this.startNextGame(tournamentId);
    }
  }

  getTournamentForRoom(roomId: string): Tournament | null {
    const tournamentId = this.roomToTournament.get(roomId);
    if (!tournamentId) return null;
    return this.tournaments.get(tournamentId) || null;
  }

  getTournament(tournamentId: string): Tournament | null {
    return this.tournaments.get(tournamentId) || null;
  }

  getClientTournamentState(tournamentId: string): ClientTournamentState | null {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return null;

    const marathon = tournament as MarathonTournament;

    const progress: MarathonProgress = {
      type: 'marathon',
      currentGameNumber: marathon.currentGameNumber,
      totalGames: marathon.totalGames,
      completedGames: marathon.completedGames,
      cumulativeScores: marathon.cumulativeScores,
    };

    return {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      hostProfileId: tournament.hostProfileId,
      inviteCode: tournament.inviteCode,
      createdAt: tournament.createdAt,
      startedAt: tournament.startedAt,
      participants: tournament.participants,
      standings: marathon.standings,
      progress,
      recentChat: tournament.chatMessages.slice(-50),
    };
  }

  addChatMessage(tournamentId: string, profileId: string, message: string): TournamentChatMessage | null {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return null;

    const participant = tournament.participants.find(p => p.profileId === profileId);
    if (!participant) return null;

    const chatMessage: TournamentChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      profileId,
      nickname: participant.nickname,
      message: message.slice(0, 500), // Limit message length
      timestamp: new Date().toISOString(),
    };

    tournament.chatMessages.push(chatMessage);

    // Keep last 200 messages
    if (tournament.chatMessages.length > 200) {
      tournament.chatMessages = tournament.chatMessages.slice(-200);
    }

    tournament.lastActivityAt = new Date().toISOString();
    this.saveTournaments();

    return chatMessage;
  }

  reclaimSlot(tournamentId: string, profileId: string, socketId: string): boolean {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return false;

    const participant = tournament.participants.find(
      p => p.isAI && p.substituteForProfileId === profileId
    );
    if (!participant) return false;

    // Remove AI substitute
    participant.isAI = false;
    participant.isConnected = true;
    participant.profileId = profileId;
    delete participant.substituteForProfileId;

    // If there's an active game, swap the AI player with the human
    if (tournament.activeRoomId) {
      const aiSocketId = `ai-tournament-${participant.nickname}`;
      // Unregister AI
      this.aiManager.unregisterAI(aiSocketId);
      // Update socket ID in game
      this.gameManager.updatePlayerSocketId(tournament.activeRoomId, aiSocketId, socketId);
    }

    tournament.lastActivityAt = new Date().toISOString();
    this.saveTournaments();
    this.broadcastTournamentState(tournamentId);

    return true;
  }

  deleteTournament(tournamentId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;

    // Clean up room mapping
    if (tournament.activeRoomId) {
      this.roomToTournament.delete(tournament.activeRoomId);
    }

    this.inviteCodeToTournament.delete(tournament.inviteCode);
    this.tournaments.delete(tournamentId);
    this.continueVotes.delete(tournamentId);

    // Notify clients
    this.io.to(`tournament-${tournamentId}`).emit('tournamentState', null);
    this.saveTournaments();

    console.log(`[TournamentManager] Deleted tournament ${tournamentId}`);
  }

  setParticipantConnected(tournamentId: string, profileId: string, connected: boolean): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;

    const participant = tournament.participants.find(p => p.profileId === profileId);
    if (participant) {
      participant.isConnected = connected;
      this.broadcastTournamentState(tournamentId);
    }
  }

  findTournamentByProfileId(profileId: string): Tournament | null {
    for (const tournament of this.tournaments.values()) {
      if (tournament.participants.some(p => p.profileId === profileId && !p.isAI)) {
        return tournament;
      }
    }
    return null;
  }

  findTournamentsByProfileId(profileId: string): Tournament[] {
    const results: Tournament[] = [];
    for (const tournament of this.tournaments.values()) {
      if (tournament.participants.some(p => p.profileId === profileId && !p.isAI)) {
        results.push(tournament);
      }
    }
    return results;
  }

  saveIfTournamentGame(roomId: string): void {
    if (this.roomToTournament.has(roomId)) {
      this.saveTournaments();
    }
  }

  saveAllState(): void {
    this.saveTournaments();
  }

  restoreGameIfNeeded(tournamentId: string, humanSocketId: string, profileId: string): string | null {
    const savedState = this.pendingGameRestores.get(tournamentId);
    if (!savedState) return null;

    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return null;

    // Create a fresh room and restore the saved game state into it
    const room = this.gameManager.createRoom();
    const roomId = room.id;

    const success = this.gameManager.restoreGameFromSave(roomId, humanSocketId, savedState, undefined, { preserveAIIds: true });
    if (!success) {
      this.gameManager.deleteRoom(roomId);
      console.error(`[TournamentManager] Failed to restore game for tournament ${tournamentId}`);
      return null;
    }

    // Register AI players with aiManager
    for (const savedPlayerId of savedState.players) {
      if (savedPlayerId.startsWith('ai-')) {
        const aiName = savedState.playerNames[savedPlayerId];
        this.aiManager.registerAI(roomId, savedPlayerId, aiName);
      }
    }

    // Store the human player's profile ID in the game room
    const gameRoom = this.gameManager.getRoom(roomId);
    if (gameRoom) {
      gameRoom.playerProfileIds.set(humanSocketId, profileId);
    }

    // Update tournament mappings
    tournament.activeRoomId = roomId;
    this.roomToTournament.set(roomId, tournamentId);
    this.pendingGameRestores.delete(tournamentId);

    this.saveTournaments();

    console.log(`[TournamentManager] Restored game for tournament ${tournamentId} in room ${roomId}`);
    return roomId;
  }

  // ===== PRIVATE METHODS =====

  private startNextGame(tournamentId: string): void {
    const tournament = this.tournaments.get(tournamentId) as MarathonTournament;
    if (!tournament) return;

    // Derive game number from completed games (source of truth) instead of incrementing
    tournament.currentGameNumber = tournament.completedGames.length + 1;
    tournament.lastActivityAt = new Date().toISOString();

    let roomId = tournament.activeRoomId;
    const existingRoom = roomId ? this.gameManager.getGameState(roomId) : null;

    if (existingRoom && roomId) {
      // Room still exists — update socket IDs and reset for next game
      this.refreshHumanSockets(tournament, roomId);
      this.gameManager.resetGameForRematch(roomId);
      this.gameManager.startGame(roomId);
    } else {
      // Room was lost (e.g. server restart) — create a fresh one
      console.log(`[TournamentManager] Room ${roomId || 'none'} not found, creating fresh room for game ${tournament.currentGameNumber}`);

      // Clean up old room mapping
      if (roomId) {
        this.roomToTournament.delete(roomId);
      }

      // Find a connected human socket to use as host reference
      const hostSocketId = this.profileToSocket.get(tournament.hostProfileId)
        || this.profileToSocket.values().next().value;

      if (!hostSocketId) {
        console.error(`[TournamentManager] No connected sockets for tournament ${tournamentId}`);
        return;
      }

      roomId = this.createTournamentGameRoom(tournament, hostSocketId);
      if (!roomId) {
        console.error(`[TournamentManager] Failed to create room for tournament ${tournamentId}`);
        return;
      }

      tournament.activeRoomId = roomId;
      this.roomToTournament.set(roomId, tournamentId);
      this.gameManager.startGame(roomId);
    }

    this.saveTournaments();
    this.broadcastTournamentState(tournamentId);

    // Notify clients
    this.io.to(`tournament-${tournamentId}`).emit('tournamentGameStarting', { roomId });

    // Broadcast game state to all players in the room
    this.broadcastRoomGameState(roomId);

    console.log(`[TournamentManager] Game ${tournament.currentGameNumber} started in tournament ${tournamentId}`);
  }

  /**
   * Update game room socket IDs for human players who may have reconnected
   * with a new socket since the last game.
   */
  private refreshHumanSockets(tournament: Tournament, roomId: string): void {
    const state = this.gameManager.getGameState(roomId);
    if (!state) return;

    for (const participant of tournament.participants) {
      if (participant.isAI) continue;

      const currentSocketId = this.profileToSocket.get(participant.profileId);
      if (!currentSocketId) continue;

      // Find which socket ID this participant currently has in the game room
      const oldSocketId = state.players.find(pid => {
        const profileId = this.gameManager.getPlayerProfileId(roomId, pid);
        return profileId === participant.profileId;
      });

      if (!oldSocketId) continue;
      if (oldSocketId === currentSocketId) continue; // Already up to date

      // Swap the old socket ID for the new one in the game room
      console.log(`[TournamentManager] Updating socket for ${participant.nickname}: ${oldSocketId} -> ${currentSocketId}`);
      this.gameManager.updatePlayerSocketId(roomId, oldSocketId, currentSocketId);

      // Join the new socket to the game room
      const sock = this.io.sockets.sockets.get(currentSocketId);
      if (sock) {
        sock.join(roomId);

        // Set closure-based socket data
        const setter = this.socketDataSetters.get(currentSocketId);
        if (setter) {
          setter({ roomId, playerName: participant.nickname, profileId: participant.profileId });
        }
      }
    }
  }

  private broadcastRoomGameState(roomId: string): void {
    const state = this.gameManager.getGameState(roomId);
    if (!state) return;

    state.players.forEach(playerId => {
      const socket = this.io.sockets.sockets.get(playerId);
      if (socket) {
        const clientState = this.gameManager.getClientGameState(roomId, playerId);
        if (clientState) {
          socket.emit('gameState', clientState);
        }
      }
    });
  }

  broadcastTournamentState(tournamentId: string): void {
    const state = this.getClientTournamentState(tournamentId);
    if (state) {
      this.io.to(`tournament-${tournamentId}`).emit('tournamentState', state);
    }
  }

  private fillWithAI(tournamentId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;

    const humanCount = tournament.participants.filter(p => !p.isAI).length;
    const aiNeeded = 4 - humanCount;

    if (aiNeeded <= 0) return;

    // Pick random Hawaiian city names not already used
    const usedNames = new Set(tournament.participants.map(p => p.nickname));
    const availableNames = HAWAIIAN_CITY_NAMES.filter(n => !usedNames.has(n));

    // Shuffle available names
    for (let i = availableNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableNames[i], availableNames[j]] = [availableNames[j], availableNames[i]];
    }

    for (let i = 0; i < aiNeeded && i < availableNames.length; i++) {
      const aiName = availableNames[i];
      const aiProfileId = `ai-tournament-${aiName}`;

      tournament.participants.push({
        profileId: aiProfileId,
        nickname: aiName,
        isAI: true,
        isHost: false,
        isConnected: true,
        joinedAt: new Date().toISOString(),
      });

      if (tournament.type === 'marathon') {
        (tournament as MarathonTournament).cumulativeScores[aiProfileId] = 0;
      }
    }
  }

  private createTournamentGameRoom(tournament: Tournament, hostSocketId: string): string | null {
    // Create room using gameManager
    const room = this.gameManager.createRoom();
    if (!room) return null;
    const roomId = room.id;

    // Set the host as the first player in the room
    room.state.hostPlayerId = hostSocketId;

    // Add all participants to the room
    for (const participant of tournament.participants) {
      if (participant.isAI) {
        const aiSocketId = `ai-tournament-${participant.nickname}`;
        this.gameManager.addAIPlayer(roomId, aiSocketId, participant.nickname);
        this.aiManager.registerAI(roomId, aiSocketId, participant.nickname);
      } else {
        // For human participants, find their socket via the profile mapping
        const playerSocketId = this.profileToSocket.get(participant.profileId);
        if (!playerSocketId) {
          console.error(`[TournamentManager] No socket found for profile ${participant.profileId}`);
          continue;
        }

        const sock = this.io.sockets.sockets.get(playerSocketId);
        if (!sock) {
          console.error(`[TournamentManager] Socket ${playerSocketId} not found for profile ${participant.profileId}`);
          continue;
        }

        // Join the socket to the game room
        sock.join(roomId);

        // Set closure-based socket data via the registered setter
        const setter = this.socketDataSetters.get(playerSocketId);
        if (setter) {
          setter({ roomId, playerName: participant.nickname, profileId: participant.profileId });
        }

        this.gameManager.addPlayerToRoom(roomId, playerSocketId, participant.nickname, participant.profileId);
      }
    }

    return roomId;
  }

  private computeStandings(tournament: MarathonTournament): TournamentStanding[] {
    const standings: TournamentStanding[] = [];

    for (const participant of tournament.participants) {
      let gamesWon = 0;
      let goingOutCount = 0;

      for (const game of tournament.completedGames) {
        const result = game.playerResults.find(r => r.profileId === participant.profileId);
        if (result) {
          if (result.won) gamesWon++;
          goingOutCount += result.goingOutCount;
        }
      }

      standings.push({
        profileId: participant.profileId,
        nickname: participant.nickname,
        isAI: participant.isAI,
        rank: 0,
        cumulativeScore: tournament.cumulativeScores[participant.profileId] || 0,
        gamesPlayed: tournament.completedGames.length,
        gamesWon,
        goingOutCount,
      });
    }

    // Sort by cumulative score ascending (lower is better)
    standings.sort((a, b) => a.cumulativeScore - b.cumulativeScore);
    standings.forEach((s, i) => { s.rank = i + 1; });

    return standings;
  }

  private findParticipantBySocketId(tournament: Tournament, socketId: string): TournamentParticipant | null {
    // Check if it's an AI socket ID
    const aiPrefix = 'ai-tournament-';
    if (socketId.startsWith(aiPrefix)) {
      const aiName = socketId.slice(aiPrefix.length);
      return tournament.participants.find(p => p.nickname === aiName && p.isAI) || null;
    }

    // For human players, look up by socket
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket?.data?.profileId) {
      return tournament.participants.find(p => p.profileId === socket.data.profileId) || null;
    }

    // Try matching by profile ID stored in game manager
    const roomId = tournament.activeRoomId;
    if (roomId) {
      const profileId = this.gameManager.getPlayerProfileId(roomId, socketId);
      if (profileId) {
        return tournament.participants.find(p => p.profileId === profileId) || null;
      }
    }

    return null;
  }

  private recordTournamentToProfiles(tournament: MarathonTournament): void {
    // Record each completed game to player profiles
    for (const game of tournament.completedGames) {
      const gameId = `tournament-${tournament.id}-game-${game.gameNumber}`;
      const totalRounds = 10;
      const durationMinutes = 0;

      this._profileManager.recordCompletedGame(gameId, game.playerResults, totalRounds, durationMinutes);
    }

    // Record tournament participation and winner
    this._profileManager.recordTournamentResult(
      tournament.participants.map(p => ({ profileId: p.profileId, isAI: p.isAI })),
      tournament.winnerId
    );
  }
}
