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
import { setupSocketHandlers } from './socket-handlers/index.js';
import { AIManager } from './ai/ai-manager.js';
import { AI_NAMES } from '../shared/game-engine/constants.js';

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ===== AI MANAGER =====
const aiManager = new AIManager(gameManager, io);

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

  for (let i = 0; i < aiNeeded && i < AI_NAMES.length; i++) {
    const aiName = AI_NAMES[i];
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
    spawnAIPlayers
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Hawaiian Rummy Server v${version}`);
  console.log(`Server running on http://localhost:${PORT}`);
});

export { io, gameManager, aiManager };
