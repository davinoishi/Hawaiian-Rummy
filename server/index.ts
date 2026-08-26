/**
 * Hawaiian Rummy Server
 * Main entry point for the TypeScript-based server
 */

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { gameManager } from './game-manager.js';
import { profileManager } from './profile-manager.js';
import { setupSocketHandlers } from './socket-handlers/index.js';
import { AIManager } from './ai/ai-manager.js';
import { TournamentManager } from './tournament-manager.js';
import { AI_NAMES } from '../shared/game-engine/constants.js';
import profileRoutes from './routes/profile-routes.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;

// ===== ANALYTICS LOGGING =====
const ANALYTICS_FILE = path.join(__dirname, '../analytics.log');

function logAnalytics(event: string, data: any = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...data
  };
  const logLine = JSON.stringify(logEntry) + '\n';

  fs.appendFile(ANALYTICS_FILE, logLine, (err) => {
    if (err) console.error('Error writing analytics:', err);
  });

  console.log(`[ANALYTICS] ${event}:`, data);
}

function getAnalyticsSummary() {
  try {
    const logData = fs.readFileSync(ANALYTICS_FILE, 'utf8');
    const lines = logData.trim().split('\n').filter(line => line);
    const events = lines.map(line => JSON.parse(line));

    return {
      totalEvents: events.length,
      pageViews: events.filter(e => e.event === 'page_view').length,
      uniqueVisitors: new Set(events.filter(e => e.ip).map(e => e.ip)).size,
      connections: events.filter(e => e.event === 'connection').length,
      gamesCreated: events.filter(e => e.event === 'game_created').length,
      gamesStarted: events.filter(e => e.event === 'game_started').length,
      playersJoined: events.filter(e => e.event === 'player_joined').length,
      gamesCompleted: events.filter(e => e.event === 'game_completed').length,
      tutorialStarts: events.filter(e => e.event === 'tutorial_started').length,
      firstEvent: events.length > 0 ? events[0].timestamp : null,
      lastEvent: events.length > 0 ? events[events.length - 1].timestamp : null
    };
  } catch (err) {
    return { error: 'No analytics data yet', totalEvents: 0 };
  }
}

// ===== SERVER SETUP =====
const app = express();
app.use(cors());
app.use(express.json());

// Profile API routes
app.use('/api', profileRoutes);

// Analytics middleware
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/') {
    logAnalytics('page_view', {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      referer: req.get('referer')
    });
  }
  next();
});

// Analytics endpoint
app.get('/api/analytics', (req, res) => {
  const summary = getAnalyticsSummary();
  res.json(summary);
});

// Serve static files
app.use(express.static('public'));

// Catch-all route for client-side routing (SPA)
// This must come after API routes and static files
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ===== AI MANAGER =====
const aiManager = new AIManager(gameManager, io);

// ===== TOURNAMENT MANAGER =====
const tournamentManager = new TournamentManager(gameManager, aiManager, io, profileManager);
tournamentManager.loadTournaments();
setTournamentManager(tournamentManager);
aiManager.setTournamentManager(tournamentManager);

// Fisher-Yates shuffle for random AI selection
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// AI spawning function
function spawnAIPlayers(roomId: string, maxAI?: number) {
  const state = gameManager.getGameState(roomId);
  if (!state) return;

  const currentPlayerCount = state.players.length;
  const targetCount = maxAI !== undefined ? maxAI : (4 - currentPlayerCount);
  const aiNeeded = Math.min(targetCount, 4 - currentPlayerCount);

  if (aiNeeded <= 0 || state.gameStarted) {
    return;
  }

  console.log(`[Room ${roomId}] Spawning ${aiNeeded} AI player(s)...`);

  // Shuffle AI names to randomly select which AIs play
  const shuffledNames = shuffleArray(AI_NAMES);

  for (let i = 0; i < aiNeeded && i < shuffledNames.length; i++) {
    const aiName = shuffledNames[i];
    const aiId = `ai-${roomId}-${i}`;

    if (gameManager.addAIPlayer(roomId, aiId, aiName)) {
      aiManager.registerAI(roomId, aiId, aiName);
      console.log(`[Room ${roomId}] ${aiName} spawned`);
    }
  }
}

// ===== SOCKET.IO CONNECTION HANDLING =====
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  logAnalytics('connection', { socketId: socket.id });

  setupSocketHandlers(socket, {
    io,
    gameManager,
    logAnalytics,
    spawnAIPlayers,
    aiManager,
    tournamentManager
  });
});

// ===== ROOM TICK =====
// One periodic pass per room that keeps time-based state honest:
//   1. skip the turn of a disconnected player
//   2. broadcast when a buy window expires (nothing else re-broadcasts on a timer)
//   3. auto-play the turn of a connected-but-idle player
import { broadcastGameState, setTournamentManager } from './socket-handlers/game-handler.js';
import { BUY_WINDOW_DURATION } from '../shared/game-engine/constants.js';

setInterval(() => {
  for (const room of gameManager.getAllRooms()) {
    const state = room.state;
    if (!state.gameStarted) continue;
    if (state.gamePhase === 'roundSummary' || state.gamePhase === 'gameOver') continue;

    // Restart the idle clock if the turn moved since the last tick.
    gameManager.syncTurnClock(room.id);

    // --- 1. Disconnected player: skip their turn ---
    const currentPlayerId = state.players[state.currentPlayerIndex];
    if (room.disconnectedPlayers.has(currentPlayerId)) {
      console.log(`[Room ${room.id}] Current player ${currentPlayerId} is disconnected, skipping turn`);

      // Cancel any staged melds
      if (state.gamePhase === 'meld') {
        gameManager.processAction(room.id, { type: 'CANCEL_MELDS', playerId: currentPlayerId });
      }

      if (gameManager.advanceToNextActivePlayer(room.id)) {
        broadcastGameState(io, gameManager, room.id);
      }
      continue;
    }

    // --- 2. Buy window expiry ---
    // isBuyWindowActive() is computed on read, so without this nobody learns the
    // window closed until the next action. Fire exactly once per discard.
    const discardTs = state.lastDiscardTimestamp;
    if (
      discardTs !== null &&
      Date.now() - discardTs >= BUY_WINDOW_DURATION &&
      room.buyWindowExpiryNotifiedFor !== discardTs
    ) {
      room.buyWindowExpiryNotifiedFor = discardTs;
      broadcastGameState(io, gameManager, room.id);
    }

    // --- 3. Idle player: auto-play their turn ---
    if (gameManager.isTurnIdleExpired(room.id)) {
      const played = gameManager.autoPlayIdleTurn(room.id);

      if (played) {
        console.log(`[Room ${room.id}] Auto-played idle turn for ${played.playerName} (discarded ${played.cardDisplay})`);
        io.to(room.id).emit('gameNotification', {
          type: 'info',
          message: `⏱ ${played.playerName} ran out of time - auto-discarded ${played.cardDisplay}`
        });
        broadcastGameState(io, gameManager, room.id);
      } else if (gameManager.advanceToNextActivePlayer(room.id)) {
        // Nothing legal to play (e.g. empty deck) - skip rather than stall.
        console.log(`[Room ${room.id}] Could not auto-play idle turn, skipping to next player`);
        io.to(room.id).emit('gameNotification', {
          type: 'info',
          message: `⏱ ${state.playerNames[currentPlayerId] || 'A player'} ran out of time - turn skipped`
        });
        broadcastGameState(io, gameManager, room.id);
      }
    }
  }
}, 1000); // Check every second

// ===== START SERVER =====
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Hawaiian Rummy Server v${version}`);
  console.log(`Server running on http://localhost:${PORT}`);
});

// ===== GRACEFUL SHUTDOWN =====
function gracefulShutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}, saving state before exit...`);
  tournamentManager.saveAllState();
  console.log('[Server] State saved. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { io, gameManager, aiManager, tournamentManager };
