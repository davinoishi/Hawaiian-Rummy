const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const AIPlayer = require('./aiPlayer');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game rooms - Map of roomId -> gameState
const games = new Map();

// AI Players tracking per room - Map of roomId -> array of AI players
const aiPlayers = new Map();

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const AI_NAMES = ['Alex-AI', 'Jordan-AI', 'Taylor-AI'];

// Helper function to create a new game state
function createGameState() {
  return {
    players: [],
    gameStarted: false,
    currentPlayerIndex: 0,
    currentRound: 0,
    deck: [],
    discardPile: [],
    playerHands: {},
    playerMelds: {},
    playerScores: {},
    roundScores: {},
    gamePhase: 'lobby',
    turnOrderDraws: [],
    hasMetRequirements: {},
    buyRequests: [],
    maxBuysPerRound: {},
    buyCount: {},
    lastDiscarder: null,
    roundsWon: {},
    passedBuy: [],
    buyJustProcessed: false,
    continueClicked: []
  };
}

// Helper function to generate unique room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to get or create a room
function getOrCreateRoom(roomId) {
  if (!games.has(roomId)) {
    games.set(roomId, createGameState());
    aiPlayers.set(roomId, []);
  }
  return games.get(roomId);
}

const roundRequirements = [
  { sets: 2, setSizes: [3, 3], runs: 0, runSizes: [], totalCards: 6, maxBuys: 3, description: "2 sets of 3" },
  { sets: 1, setSizes: [3], runs: 1, runSizes: [4], totalCards: 7, maxBuys: 3, description: "1 set of 3 and a run of 4" },
  { sets: 0, setSizes: [], runs: 2, runSizes: [4, 4], totalCards: 8, maxBuys: 3, description: "2 runs of 4" },
  { sets: 3, setSizes: [3, 3, 3], runs: 0, runSizes: [], totalCards: 9, maxBuys: 3, description: "3 sets of 3" },
  { sets: 1, setSizes: [3], runs: 1, runSizes: [7], totalCards: 10, maxBuys: 3, description: "1 set of 3 and a run of 7" },
  { sets: 2, setSizes: [3, 3], runs: 1, runSizes: [5], totalCards: 11, maxBuys: 3, description: "2 sets of 3 and a run of 5" },
  { sets: 3, setSizes: [4, 4, 4], runs: 0, runSizes: [], totalCards: 12, maxBuys: 3, description: "3 sets of 4" },
  { sets: 1, setSizes: [3], runs: 1, runSizes: [10], totalCards: 13, maxBuys: 3, description: "1 set of 3 and a run of 10" },
  { sets: 3, setSizes: [3, 3, 3], runs: 1, runSizes: [5], totalCards: 14, maxBuys: 3, description: "3 sets of 3 and a run of 5" },
  { sets: 0, setSizes: [], runs: 3, runSizes: [5, 5, 5], totalCards: 15, maxBuys: 4, description: "3 runs of 5" }
];

function createDeck() {
  const deck = [];
  for (let deckNum = 0; deckNum < 3; deckNum++) {
    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push({ suit, rank, id: `${rank}${suit}${deckNum}`, isWild: rank === '2' });
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    deck.push({ suit: '', rank: 'JOKER', id: `JOKER${i}`, isWild: true });
  }
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  let shuffled = [...deck];

  // Perform Fisher-Yates shuffle multiple times for better randomization
  for (let pass = 0; pass < 3; pass++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  return shuffled;
}

// AI Player Management
function spawnAIPlayers(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  const currentPlayerCount = gameState.players.length;
  const aiNeeded = 4 - currentPlayerCount;

  if (aiNeeded <= 0 || gameState.gameStarted) {
    return;
  }

  console.log(`[Room ${roomId}] Spawning ${aiNeeded} AI player(s) to fill lobby...`);

  const roomAIPlayers = aiPlayers.get(roomId) || [];

  for (let i = 0; i < aiNeeded && i < AI_NAMES.length; i++) {
    const aiName = AI_NAMES[i];
    const ai = new AIPlayer('http://localhost:3001', aiName, roomId);
    ai.connect();
    roomAIPlayers.push(ai);
    console.log(`[Room ${roomId}] ${aiName} spawned`);
  }

  aiPlayers.set(roomId, roomAIPlayers);
}

function removeAllAIPlayers(roomId) {
  console.log(`[Room ${roomId}] Removing all AI players...`);
  const roomAIPlayers = aiPlayers.get(roomId) || [];
  roomAIPlayers.forEach(ai => {
    try {
      ai.disconnect();
    } catch (error) {
      console.error('Error disconnecting AI:', error);
    }
  });
  aiPlayers.set(roomId, []);
}

function startNewRound(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  const deck = createDeck();
  gameState.deck = deck;
  gameState.discardPile = [];
  gameState.playerMelds = {};
  gameState.hasMetRequirements = {};
  gameState.buyRequests = [];
  gameState.buyCount = {};
  gameState.lastDiscarder = null;
  gameState.passedBuy = [];

  // Deal cards to each player
  gameState.players.forEach(playerId => {
    gameState.playerHands[playerId] = gameState.deck.splice(0, 9);
    gameState.playerMelds[playerId] = [];
    gameState.hasMetRequirements[playerId] = false;
    gameState.buyCount[playerId] = 0;
  });

  // First discard
  gameState.discardPile.push(gameState.deck.shift());
  gameState.gamePhase = 'draw';
}

// Determine starting player order by random selection
async function determineTurnOrder(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  console.log(`[Room ${roomId}] Starting turn order determination...`);
  gameState.gamePhase = 'turnOrder';

  // Start with all players in a pool
  const remainingPlayers = [...gameState.players];
  const selectedOrder = [];

  // Send initial state - all positions empty
  io.to(roomId).emit('turnOrderUpdate', {
    phase: 'selecting',
    position: 0,
    selectedOrder: [],
    remainingPlayers: remainingPlayers.map(id => ({
      playerId: id,
      name: io.sockets.sockets.get(id)?.playerName || 'Unknown'
    }))
  });

  await new Promise(resolve => setTimeout(resolve, 1500));

  // Select players one by one for positions 1-4
  for (let position = 1; position <= 4; position++) {
    // Randomly select from remaining players
    const randomIndex = Math.floor(Math.random() * remainingPlayers.length);
    const selectedPlayerId = remainingPlayers[randomIndex];
    const selectedName = io.sockets.sockets.get(selectedPlayerId)?.playerName || 'Unknown';

    // Remove from remaining and add to selected
    remainingPlayers.splice(randomIndex, 1);
    selectedOrder.push(selectedPlayerId);

    console.log(`[Room ${roomId}] Position ${position}: ${selectedName}`);

    // Send update showing this selection
    io.to(roomId).emit('turnOrderUpdate', {
      phase: 'selecting',
      position: position,
      justSelected: selectedPlayerId,
      selectedOrder: selectedOrder.map((id, idx) => ({
        playerId: id,
        name: io.sockets.sockets.get(id)?.playerName || 'Unknown',
        position: idx + 1
      })),
      remainingPlayers: remainingPlayers.map(id => ({
        playerId: id,
        name: io.sockets.sockets.get(id)?.playerName || 'Unknown'
      }))
    });

    // Wait between selections (shorter for last one)
    await new Promise(resolve => setTimeout(resolve, position < 4 ? 1500 : 1000));
  }

  // Update game state with new order
  gameState.players = selectedOrder;
  gameState.currentPlayerIndex = 0;

  // Send final result
  io.to(roomId).emit('turnOrderUpdate', {
    phase: 'final',
    selectedOrder: selectedOrder.map((id, idx) => ({
      playerId: id,
      name: io.sockets.sockets.get(id)?.playerName || 'Unknown',
      position: idx + 1
    }))
  });

  console.log(`[Room ${roomId}] Turn order determined:`, selectedOrder.map(id => {
    const sock = io.sockets.sockets.get(id);
    return sock ? sock.playerName : 'Unknown';
  }));

  // Wait to show final results
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Countdown and start game
  for (let i = 3; i > 0; i--) {
    io.to(roomId).emit('turnOrderCountdown', i);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Start the actual game
  startGame(roomId);
  broadcastGameState(roomId);
}

function startGame(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  gameState.gameStarted = true;
  gameState.currentRound = 0;
  gameState.currentPlayerIndex = 0;

  // Initialize scores, rounds won, and round scores
  gameState.players.forEach(playerId => {
    gameState.playerScores[playerId] = 0;
    gameState.roundsWon[playerId] = 0;
    gameState.roundScores[playerId] = [];
  });

  startNewRound(roomId);
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Create a new room
  socket.on('createRoom', (playerName, callback) => {
    const roomId = generateRoomId();
    getOrCreateRoom(roomId);

    socket.roomId = roomId;
    socket.playerName = playerName;
    socket.playerId = socket.id;
    socket.join(roomId);

    const gameState = games.get(roomId);
    gameState.players.push(socket.id);

    console.log(`[Room ${roomId}] ${playerName} created room. Room ID: ${roomId}`);

    if (callback) {
      callback({ roomId });
    }

    io.to(roomId).emit('lobbyUpdate', {
      roomId,
      players: gameState.players.map(id => {
        const sock = io.sockets.sockets.get(id);
        return { id, name: sock ? sock.playerName : 'Unknown' };
      }),
      gameStarted: gameState.gameStarted
    });
  });

  // Join an existing room
  socket.on('joinGame', ({ playerName, roomId }, callback) => {
    const gameState = getOrCreateRoom(roomId);

    if (gameState.gameStarted) {
      socket.emit('gameAlreadyStarted');
      if (callback) callback({ error: 'Game already started' });
      return;
    }

    if (gameState.players.length >= 4) {
      socket.emit('gameFull');
      if (callback) callback({ error: 'Game is full' });
      return;
    }

    socket.roomId = roomId;
    socket.playerName = playerName;
    socket.playerId = socket.id;
    socket.join(roomId);

    gameState.players.push(socket.id);

    console.log(`[Room ${roomId}] ${playerName} joined. Players: ${gameState.players.length}`);

    if (callback) {
      callback({ success: true, roomId });
    }

    io.to(roomId).emit('lobbyUpdate', {
      roomId,
      players: gameState.players.map(id => {
        const sock = io.sockets.sockets.get(id);
        return { id, name: sock ? sock.playerName : 'Unknown' };
      }),
      gameStarted: gameState.gameStarted
    });
  });

  socket.on('startGame', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (gameState.players.length < 1) {
      socket.emit('error', 'Need at least 1 player to start');
      return;
    }

    // Prevent multiple start attempts
    if (gameState.gameStarted || gameState.gamePhase === 'turnOrder') {
      console.log(`[Room ${roomId}] Game already started or starting, ignoring duplicate start request`);
      return;
    }

    // Mark as starting
    gameState.gamePhase = 'turnOrder';

    // Spawn AI players to fill up to 4 players
    spawnAIPlayers(roomId);

    // Give AI players time to join, then determine turn order
    setTimeout(() => {
      determineTurnOrder(roomId);
    }, 1000);
  });

  socket.on('drawCard', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (!isPlayerTurn(socket.id, roomId) || gameState.gamePhase !== 'draw') {
      return;
    }

    // IMPORTANT: If there are active buy requests, current player CANNOT draw from deck
    // They can only take the discard or pass to allow others to buy
    if (gameState.buyRequests && gameState.buyRequests.length > 0) {
      socket.emit('error', 'Cannot draw from deck while buy requests are pending. You must take the discard or pass.');
      return;
    }

    const card = gameState.deck.shift();
    gameState.playerHands[socket.id].push(card);
    gameState.gamePhase = 'meld';
    // DON'T reset buyJustProcessed here - wait until turn ends with discard
    gameState.passedBuy = []; // Clear passes since we're moving on

    broadcastGameState(roomId);
  });

  socket.on('requestBuy', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    // Can't buy if it's your turn
    if (isPlayerTurn(socket.id, roomId)) {
      return;
    }

    // Can't buy your own discarded card (null means initial card, which anyone can buy)
    if (gameState.lastDiscarder !== null && gameState.lastDiscarder === socket.id) {
      socket.emit('error', 'Cannot buy your own discarded card');
      return;
    }

    // Can't buy if already at max buys
    const maxBuys = roundRequirements[gameState.currentRound].maxBuys;
    if (gameState.buyCount[socket.id] >= maxBuys) {
      socket.emit('error', `Maximum ${maxBuys} buys per round`);
      return;
    }

    // Can't buy during meld phase
    if (gameState.gamePhase !== 'draw') {
      return;
    }

    // Add to buy requests if not already there
    if (!gameState.buyRequests.find(r => r.playerId === socket.id)) {
      gameState.buyRequests.push({
        playerId: socket.id,
        timestamp: Date.now()
      });

      // Calculate this player's priority (distance from current player)
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const thisPlayerIndex = gameState.players.indexOf(socket.id);
      const thisDistance = (thisPlayerIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;

      // Any player with lower priority (greater distance) who requested to buy
      // should have their request automatically converted to a pass
      if (!gameState.passedBuy) {
        gameState.passedBuy = [];
      }

      const requestsToRemove = [];
      gameState.buyRequests.forEach(req => {
        if (req.playerId !== socket.id) {
          const reqIndex = gameState.players.indexOf(req.playerId);
          const reqDistance = (reqIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;

          // If this other request has lower priority (greater distance), convert to pass
          if (reqDistance > thisDistance) {
            requestsToRemove.push(req.playerId);
            if (!gameState.passedBuy.includes(req.playerId)) {
              gameState.passedBuy.push(req.playerId);
              console.log(`[Room ${roomId}] Auto-passing ${io.sockets.sockets.get(req.playerId)?.playerName || 'Unknown'} - lower priority than ${socket.playerName}`);
            }
          }
        }
      });

      // Remove the converted requests
      gameState.buyRequests = gameState.buyRequests.filter(r => !requestsToRemove.includes(r.playerId));
    }

    broadcastGameState(roomId);
  });

  socket.on('cancelBuy', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    gameState.buyRequests = gameState.buyRequests.filter(r => r.playerId !== socket.id);
    broadcastGameState(roomId);
  });

  socket.on('passBuy', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    // Add this player to the list of players who have passed
    if (!gameState.passedBuy) {
      gameState.passedBuy = [];
    }

    if (!gameState.passedBuy.includes(socket.id)) {
      gameState.passedBuy.push(socket.id);
    }

    // Check if all players between current and first buyer have passed
    const currentPlayerIndex = gameState.currentPlayerIndex;

    // Find the first buyer (closest after current player)
    let firstBuyerDistance = Infinity;
    let firstBuyer = null;
    gameState.buyRequests.forEach(req => {
      const reqIndex = gameState.players.indexOf(req.playerId);
      const reqDistance = (reqIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;
      if (reqDistance > 0 && reqDistance < firstBuyerDistance) {
        firstBuyerDistance = reqDistance;
        firstBuyer = req.playerId;
      }
    });

    if (!firstBuyer) {
      gameState.passedBuy = [];
      broadcastGameState(roomId);
      return;
    }

    // Check if all players from current to buyer (including current) have passed
    let allPassed = true;
    for (let i = 0; i < firstBuyerDistance; i++) {
      const playerIndex = (currentPlayerIndex + i) % gameState.players.length;
      const playerId = gameState.players[playerIndex];
      if (!gameState.passedBuy.includes(playerId)) {
        allPassed = false;
        break;
      }
    }

    // If all have passed, process the buy
    if (allPassed) {
      processBuyRequests(roomId);
      gameState.passedBuy = [];
    }

    broadcastGameState(roomId);
  });

  socket.on('takeDiscard', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (!isPlayerTurn(socket.id, roomId) || gameState.gamePhase !== 'draw') {
      return;
    }

    // Prevent taking discard if a buy was just processed
    if (gameState.buyJustProcessed) {
      socket.emit('error', 'After a buy, you must draw from the deck');
      return;
    }

    const card = gameState.discardPile[gameState.discardPile.length - 1];
    gameState.playerHands[socket.id].push(card);
    gameState.gamePhase = 'meld';

    // Notify players who had buy requests that current player took the card
    if (gameState.buyRequests.length > 0) {
      gameState.players.forEach(playerId => {
        const sock = io.sockets.sockets.get(playerId);
        if (sock && gameState.buyRequests.some(r => r.playerId === playerId)) {
          sock.emit('buyNotification', {
            type: 'denied',
            message: `✗ ${socket.playerName} took the discard - buy cancelled`
          });
        }
      });
    }

    // Clear any pending buy requests since current player took the card
    gameState.buyRequests = [];
    gameState.passedBuy = [];

    broadcastGameState(roomId);
  });

  socket.on('createMeld', ({ type, cardIds, wildcardPlacement }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (!isPlayerTurn(socket.id, roomId) || gameState.gamePhase === 'draw') {
      return;
    }

    const hand = gameState.playerHands[socket.id];
    const cards = hand.filter(c => cardIds.includes(c.id));

    // Validate meld
    const isValid = type === 'set' ? validateSet(cards) : validateRun(cards);
    if (!isValid) {
      socket.emit('error', 'Invalid meld');
      return;
    }

    // Check if creating more melds than required
    const req = roundRequirements[gameState.currentRound];
    const currentSets = gameState.playerMelds[socket.id].filter(m => m.type === 'set').length;
    const currentRuns = gameState.playerMelds[socket.id].filter(m => m.type === 'run').length;

    if (type === 'set' && currentSets >= req.sets) {
      socket.emit('error', `Round ${gameState.currentRound + 1} only requires ${req.sets} set(s)`);
      return;
    }

    if (type === 'run' && currentRuns >= req.runs) {
      socket.emit('error', `Round ${gameState.currentRound + 1} only requires ${req.runs} run(s)`);
      return;
    }

    // Check if run needs wildcard position choice
    if (type === 'run' && !wildcardPlacement && needsWildcardPositionChoice(cards)) {
      socket.emit('needMeldWildcardPosition', {
        cardIds,
        type
      });
      return;
    }

    // Sort run cards with wildcard placement
    const sortedCards = type === 'run' ? sortRunCards(cards, wildcardPlacement) : cards;

    gameState.playerMelds[socket.id].push({ type, cards: sortedCards });
    gameState.playerHands[socket.id] = hand.filter(c => !cardIds.includes(c.id));

    // Check if requirements met
    if (checkMeldsMatchRequirements(socket.id, roomId)) {
      gameState.hasMetRequirements[socket.id] = true;
    }

    // Check if player won by melding all cards
    if (gameState.playerHands[socket.id].length === 0 && gameState.hasMetRequirements[socket.id]) {
      endRound(socket.id, roomId);
      return;
    }

    broadcastGameState(roomId);
  });

  socket.on('cancelMelds', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (!isPlayerTurn(socket.id, roomId) || gameState.gamePhase === 'draw') {
      return;
    }

    // Return all melded cards to hand
    const myMelds = gameState.playerMelds[socket.id] || [];
    const cardsToReturn = myMelds.flatMap(meld => meld.cards);

    gameState.playerHands[socket.id] = [...gameState.playerHands[socket.id], ...cardsToReturn];
    gameState.playerMelds[socket.id] = [];
    gameState.hasMetRequirements[socket.id] = false;

    broadcastGameState(roomId);
  });

  socket.on('layoffCard', ({ cardId, meldOwnerId, meldIndex, wildcardToReplace, wildcardNewPosition, wildcardPosition }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (!gameState.hasMetRequirements[socket.id]) {
      socket.emit('error', 'Must meet requirements first');
      return;
    }

    const hand = gameState.playerHands[socket.id];
    const card = hand.find(c => c.id === cardId);
    const meld = gameState.playerMelds[meldOwnerId][meldIndex];

    if (!card || !meld) {
      socket.emit('error', 'Invalid layoff');
      return;
    }

    // Handle wildcard replacement in runs
    if (wildcardToReplace && meld.type === 'run') {
      const wildcardCard = meld.cards.find(c => c.id === wildcardToReplace);
      if (!wildcardCard || !wildcardCard.isWild) {
        socket.emit('error', 'Invalid wildcard replacement');
        return;
      }

      // Remove wildcard from meld
      let newCards = meld.cards.filter(c => c.id !== wildcardToReplace);

      // Add the replacement card
      newCards.push(card);

      // Sort these cards first
      newCards = sortRunCards(newCards);

      // Validate the run is still valid
      if (!validateRun(newCards)) {
        socket.emit('error', 'Invalid run after replacement');
        return;
      }

      // Now add wildcard at chosen position (this extends the run)
      if (wildcardNewPosition === 'beginning') {
        newCards = [wildcardCard, ...newCards];
      } else {
        newCards = [...newCards, wildcardCard];
      }

      // Update the meld
      gameState.playerMelds[meldOwnerId][meldIndex].cards = newCards;
      gameState.playerHands[socket.id] = hand.filter(c => c.id !== cardId);

      // Check if player won by laying off all cards
      if (gameState.playerHands[socket.id].length === 0) {
        endRound(socket.id, roomId);
      }

      broadcastGameState(roomId);
      return;
    }

    // Regular layoff
    if (!canCardFitMeld(card, meld)) {
      socket.emit('error', 'Card does not fit meld');
      return;
    }

    // Special handling for wildcard layoff on runs
    if (card.isWild && meld.type === 'run') {
      const validPositions = getValidWildcardPositions(card, meld);

      if (validPositions.length === 0) {
        socket.emit('error', 'Wildcard cannot extend this run');
        return;
      }

      if (validPositions.length > 1 && !wildcardPosition) {
        // Need to ask player for position
        socket.emit('needWildcardPosition', {
          validPositions: validPositions,
          cardId: cardId,
          meldOwnerId: meldOwnerId,
          meldIndex: meldIndex
        });
        return;
      }

      // Validate the chosen position
      const chosenPosition = wildcardPosition || validPositions[0];
      if (!validPositions.includes(chosenPosition)) {
        socket.emit('error', 'Invalid wildcard position');
        return;
      }

      // Place wildcard at the chosen position
      let newCards;
      if (chosenPosition === 'beginning') {
        newCards = [card, ...meld.cards];
      } else {
        newCards = [...meld.cards, card];
      }

      gameState.playerMelds[meldOwnerId][meldIndex].cards = newCards;
      gameState.playerHands[socket.id] = hand.filter(c => c.id !== cardId);

      if (gameState.playerHands[socket.id].length === 0) {
        endRound(socket.id, roomId);
      }

      broadcastGameState(roomId);
      return;
    }

    // Non-wildcard or set layoff
    const newCards = [...meld.cards, card];
    gameState.playerMelds[meldOwnerId][meldIndex].cards =
      meld.type === 'run' ? sortRunCards(newCards) : newCards;

    gameState.playerHands[socket.id] = hand.filter(c => c.id !== cardId);

    // Check if player won by laying off all cards
    if (gameState.playerHands[socket.id].length === 0) {
      endRound(socket.id, roomId);
    }

    broadcastGameState(roomId);
  });

  socket.on('discard', (cardId) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (!isPlayerTurn(socket.id, roomId) || gameState.gamePhase === 'draw') {
      return;
    }

    const hand = gameState.playerHands[socket.id];
    const card = hand.find(c => c.id === cardId);

    if (!card) {
      socket.emit('error', 'Invalid card to discard');
      return;
    }

    // If player has melds but hasn't met requirements, don't allow discard
    if (gameState.playerMelds[socket.id] && gameState.playerMelds[socket.id].length > 0
        && !gameState.hasMetRequirements[socket.id]) {
      const meetsReqs = checkMeldsMatchRequirements(socket.id, roomId);
      if (!meetsReqs) {
        socket.emit('error', 'Meld requirements not met. Complete your melds or cancel them before discarding.');
        return;
      }
    }

    gameState.discardPile.push(card);
    gameState.playerHands[socket.id] = hand.filter(c => c.id !== cardId);
    gameState.lastDiscarder = socket.id;

    // Check if round is over (discarded last card)
    if (gameState.playerHands[socket.id].length === 0 &&
        checkMeldsMatchRequirements(socket.id, roomId)) {
      endRound(socket.id, roomId);
    } else {
      nextTurn(roomId);
    }

    broadcastGameState(roomId);
  });

  socket.on('reorderHand', (cardIds) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    const hand = gameState.playerHands[socket.id];
    const reordered = cardIds.map(id => hand.find(c => c.id === id)).filter(c => c);
    gameState.playerHands[socket.id] = reordered;
    broadcastGameState(roomId);
  });

  socket.on('newGame', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (gameState.gamePhase === 'gameOver') {
      startGame(roomId);
      broadcastGameState(roomId);
    }
  });

  socket.on('continueToNextRound', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    if (gameState.gamePhase !== 'roundSummary') {
      return;
    }

    // Add this player to the continue list if not already there
    if (!gameState.continueClicked.includes(socket.id)) {
      gameState.continueClicked.push(socket.id);
    }

    // Check if all players have clicked continue
    if (gameState.continueClicked.length === gameState.players.length) {
      // All players ready, start next round
      gameState.currentRound++;
      startNewRound(roomId);
    }

    broadcastGameState(roomId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const roomId = socket.roomId;
    if (!roomId) return;

    const gameState = games.get(roomId);
    if (!gameState) return;

    gameState.players = gameState.players.filter(id => id !== socket.id);

    if (gameState.gameStarted && gameState.players.length === 0) {
      resetGame(roomId);
    }

    io.to(roomId).emit('lobbyUpdate', {
      roomId,
      players: gameState.players.map(id => {
        const sock = io.sockets.sockets.get(id);
        return { id, name: sock ? sock.playerName : 'Unknown' };
      }),
      gameStarted: gameState.gameStarted
    });
  });
});

function isPlayerTurn(playerId, roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return false;
  return gameState.players[gameState.currentPlayerIndex] === playerId;
}

function nextTurn(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.gamePhase = 'draw';
  gameState.buyRequests = []; // Clear buy requests for new turn
  gameState.passedBuy = []; // Clear passed buy list
  gameState.buyJustProcessed = false; // Reset buy flag for new turn
}

function endRound(winnerId, roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  // Calculate scores for this round
  gameState.players.forEach(playerId => {
    const hand = gameState.playerHands[playerId];
    const points = hand.reduce((sum, card) => sum + getCardPoints(card), 0);

    // Record this round's score
    gameState.roundScores[playerId].push(points);

    // Update total score
    gameState.playerScores[playerId] += points;
  });

  // Track round winner
  if (winnerId) {
    gameState.roundsWon[winnerId]++;
  }

  // Clear continue tracking
  gameState.continueClicked = [];

  if (gameState.currentRound < 9) {
    // Show round summary
    gameState.gamePhase = 'roundSummary';
    broadcastGameState(roomId);
  } else {
    gameState.gamePhase = 'gameOver';
    broadcastGameState(roomId);
  }
}

function getCardPoints(card) {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === '2') return 20;
  if (card.rank === 'A') return 15;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  return 5;
}

function resetGame(roomId) {
  // Remove all AI players when resetting
  removeAllAIPlayers(roomId);

  // Reset the game state for this room
  games.set(roomId, createGameState());
}

function getNextPlayerInOrder(currentPlayerId, roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return null;

  const currentIndex = gameState.players.indexOf(currentPlayerId);
  const nextIndex = (currentIndex + 1) % gameState.players.length;
  return gameState.players[nextIndex];
}

function processBuyRequests(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  if (gameState.buyRequests.length === 0) return;

  // Sort buy requests by player order (next player after current has priority)
  const currentPlayerIndex = gameState.currentPlayerIndex;
  const sortedRequests = [...gameState.buyRequests].sort((a, b) => {
    const aIndex = gameState.players.indexOf(a.playerId);
    const bIndex = gameState.players.indexOf(b.playerId);

    // Calculate distance from current player
    const aDistance = (aIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;
    const bDistance = (bIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;

    return aDistance - bDistance;
  });

  // Give the first player in order the buy
  const buyingPlayer = sortedRequests[0].playerId;
  const buyingPlayerSocket = io.sockets.sockets.get(buyingPlayer);
  const buyingPlayerName = buyingPlayerSocket ? buyingPlayerSocket.playerName : 'Unknown';

  const discardCard = gameState.discardPile.pop(); // Remove from discard pile
  const deckCard = gameState.deck.shift();

  gameState.playerHands[buyingPlayer].push(discardCard);
  gameState.playerHands[buyingPlayer].push(deckCard);
  gameState.buyCount[buyingPlayer]++;

  // Notify all players about the buy result
  gameState.players.forEach(playerId => {
    const socket = io.sockets.sockets.get(playerId);
    if (socket) {
      if (playerId === buyingPlayer) {
        socket.emit('buyNotification', {
          type: 'granted',
          message: `✓ You won the buy! (${discardCard.rank}${discardCard.suit})`
        });
      } else if (gameState.buyRequests.some(r => r.playerId === playerId)) {
        socket.emit('buyNotification', {
          type: 'denied',
          message: `✗ ${buyingPlayerName} won the buy (higher priority)`
        });
      } else {
        socket.emit('buyNotification', {
          type: 'info',
          message: `${buyingPlayerName} bought ${discardCard.rank}${discardCard.suit}`
        });
      }
    }
  });

  // Clear all buy requests and set flag to prevent current player from taking discard
  gameState.buyRequests = [];
  gameState.buyJustProcessed = true;
}

function broadcastGameState(roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return;

  const maxBuys = roundRequirements[gameState.currentRound] ? roundRequirements[gameState.currentRound].maxBuys : 3;

  // Calculate winner if game is over
  let winner = null;
  if (gameState.gamePhase === 'gameOver') {
    winner = gameState.players.reduce((lowest, playerId) => {
      if (!lowest || gameState.playerScores[playerId] < gameState.playerScores[lowest]) {
        return playerId;
      }
      return lowest;
    }, null);
  }

  gameState.players.forEach(playerId => {
    const socket = io.sockets.sockets.get(playerId);
    if (socket) {
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const thisPlayerIndex = gameState.players.indexOf(playerId);

      // Calculate distance from current player (positive = after, 0 = current)
      let distance = (thisPlayerIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;

      // Find the next player who has requested a buy (closest after current player)
      let nextBuyerDistance = Infinity;
      let nextBuyer = null;
      gameState.buyRequests.forEach(req => {
        const reqIndex = gameState.players.indexOf(req.playerId);
        const reqDistance = (reqIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;
        if (reqDistance > 0 && reqDistance < nextBuyerDistance) {
          nextBuyerDistance = reqDistance;
          nextBuyer = req.playerId;
        }
      });

      // Current player can draw ONLY if there are no pending buy requests
      // If there are buy requests, they must take discard or pass
      const canDraw = isPlayerTurn(playerId, roomId) &&
                      gameState.gamePhase === 'draw' &&
                      (!gameState.buyRequests || gameState.buyRequests.length === 0);

      // Player can buy if:
      // 1. Not their turn
      // 2. Haven't exceeded max buys
      // 3. Didn't discard the card (if someone has discarded)
      // 4. There's actually a card in the discard pile
      // 5. No one with higher priority (closer to current) has requested
      // 6. A buy wasn't just processed (wait for current player to discard a new card)
      const canBuy = !isPlayerTurn(playerId, roomId) &&
                     gameState.gamePhase === 'draw' &&
                     gameState.buyCount[playerId] < maxBuys &&
                     (gameState.lastDiscarder === null || gameState.lastDiscarder !== playerId) &&
                     gameState.discardPile.length > 0 &&
                     distance > 0 &&
                     !gameState.buyJustProcessed;

      // Player should see pass button if:
      // 1. Someone wants to buy
      // 2. This player is current player OR between current and the buyer
      // 3. They haven't requested buy themselves
      // NOTE: shouldShowPass and canBuy can BOTH be true - player can buy OR pass
      const shouldShowPass = gameState.buyRequests.length > 0 &&
                            !gameState.buyRequests.some(r => r.playerId === playerId) &&
                            (isPlayerTurn(playerId, roomId) ||
                             (distance > 0 && gameState.buyRequests.some(req => {
                               const reqIndex = gameState.players.indexOf(req.playerId);
                               const reqDistance = (reqIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;
                               return reqDistance > distance;
                             })));

      // Current player can take discard if it's their turn AND no buy just processed
      const canTakeDiscard = isPlayerTurn(playerId, roomId) && gameState.gamePhase === 'draw' && !gameState.buyJustProcessed;

      socket.emit('gameState', {
        players: gameState.players.map(id => {
          const sock = io.sockets.sockets.get(id);
          return {
            id,
            name: sock ? sock.playerName : 'Unknown',
            handSize: gameState.playerHands[id] ? gameState.playerHands[id].length : 0,
            score: gameState.playerScores[id] || 0,
            melds: gameState.playerMelds[id] || [],
            buyCount: gameState.buyCount[id] || 0,
            roundsWon: gameState.roundsWon[id] || 0,
            roundScores: gameState.roundScores[id] || [],
            isMe: id === playerId  // Add flag to identify current player
          };
        }),
        myHand: gameState.playerHands[playerId] || [],
        myMelds: gameState.playerMelds[playerId] || [],
        discardPile: gameState.discardPile,
        deckSize: gameState.deck.length,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentRound: gameState.currentRound,
        gamePhase: gameState.gamePhase,
        isMyTurn: isPlayerTurn(playerId, roomId),
        hasMetRequirements: gameState.hasMetRequirements[playerId] || false,
        buyRequests: gameState.buyRequests,
        myBuyCount: gameState.buyCount[playerId] || 0,
        maxBuys: maxBuys,
        canBuy: canBuy,
        canDraw: canDraw,
        canTakeDiscard: canTakeDiscard,
        shouldShowPass: shouldShowPass,
        hasBuyRequest: gameState.buyRequests.some(r => r.playerId === playerId),
        hasPassed: gameState.passedBuy.includes(playerId),
        nextPlayerToBuy: nextBuyer,
        winner: winner,
        isWinner: winner === playerId,
        continueClicked: gameState.continueClicked,
        hasContinued: gameState.continueClicked.includes(playerId)
      });
    }
  });
}

// Validation functions
function getRankValue(rank) {
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  if (rank === 'JOKER') return 0;
  if (rank === 'A') return 1;
  return parseInt(rank);
}

function validateSet(cards) {
  if (cards.length < 3) return false;
  const nonWildCards = cards.filter(c => !c.isWild);
  if (nonWildCards.length === 0) return false;
  const rank = nonWildCards[0].rank;
  return nonWildCards.every(c => c.rank === rank);
}

function validateRun(cards) {
  if (cards.length < 4) return false;
  const nonWildCards = cards.filter(c => !c.isWild);
  if (nonWildCards.length === 0) return false;

  const suit = nonWildCards[0].suit;
  if (!nonWildCards.every(c => c.suit === suit)) return false;

  const values = nonWildCards.map(c => {
    if (c.rank === 'A') return { low: 1, high: 14, rank: c.rank };
    return { low: getRankValue(c.rank), high: getRankValue(c.rank), rank: c.rank };
  });

  const wildCount = cards.filter(c => c.isWild).length;

  // Try Aces low
  let sortedLow = values.map(v => v.low).sort((a, b) => a - b);
  let gapsLow = 0;
  let maxGapLow = 0;
  for (let i = 1; i < sortedLow.length; i++) {
    const gap = sortedLow[i] - sortedLow[i-1] - 1;
    if (gap < 0) return false;
    gapsLow += gap;
    if (gap > maxGapLow) maxGapLow = gap;
  }
  // Check if gaps can be filled with wildcards
  if (gapsLow <= wildCount) {
    // Additional check: make sure this isn't a wrap-around
    // A wrap-around (like K-A-2-3) would have a very large gap (8+) in the middle
    // A normal run (like 3-4-5-6-7-8-J-Q-K) has small fillable gaps
    if (maxGapLow <= 7) {
      return true;
    }
  }

  // Try Aces high
  let sortedHigh = values.map(v => v.high).sort((a, b) => a - b);
  let gapsHigh = 0;
  let maxGapHigh = 0;
  for (let i = 1; i < sortedHigh.length; i++) {
    const gap = sortedHigh[i] - sortedHigh[i-1] - 1;
    if (gap < 0) return false;
    gapsHigh += gap;
    if (gap > maxGapHigh) maxGapHigh = gap;
  }
  // Check if gaps can be filled with wildcards
  if (gapsHigh <= wildCount) {
    // Additional check: make sure this isn't a wrap-around
    // A wrap-around would have a very large gap (8+) in the middle
    if (maxGapHigh <= 7) {
      return true;
    }
  }

  return false;
}

function sortRunCards(cards, wildcardPlacement = null) {
  const nonWildCards = cards.filter(c => !c.isWild);
  const wildCards = cards.filter(c => c.isWild);

  if (nonWildCards.length === 0) return cards;

  const ranks = nonWildCards.map(c => c.rank);
  const hasKing = ranks.includes('K');
  const hasQueen = ranks.includes('Q');
  const hasAce = ranks.includes('A');
  const hasTwo = ranks.includes('2');
  const hasThree = ranks.includes('3');

  const aceHigh = (hasKing || hasQueen) && !hasTwo && !hasThree;

  const sorted = [...nonWildCards].sort((a, b) => {
    let aVal = getRankValue(a.rank);
    let bVal = getRankValue(b.rank);
    if (aceHigh) {
      if (a.rank === 'A') aVal = 14;
      if (b.rank === 'A') bVal = 14;
    }
    return aVal - bVal;
  });

  const result = [];
  const usedWilds = [];

  // Fill gaps between non-wild cards first
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      let prevVal = getRankValue(sorted[i-1].rank);
      let currVal = getRankValue(sorted[i].rank);

      if (aceHigh) {
        if (sorted[i-1].rank === 'A') prevVal = 14;
        if (sorted[i].rank === 'A') currVal = 14;
      }

      const gap = currVal - prevVal - 1;
      for (let j = 0; j < gap && usedWilds.length < wildCards.length; j++) {
        result.push(wildCards[usedWilds.length]);
        usedWilds.push(wildCards[usedWilds.length]);
      }
    }

    result.push(sorted[i]);
  }

  // Determine where to place remaining wildcards
  let placeAtBeginning = false;

  if (wildcardPlacement === 'beginning') {
    placeAtBeginning = true;
  } else if (wildcardPlacement === 'end') {
    placeAtBeginning = false;
  } else {
    // Auto-determine based on run position
    // Get the actual values in the sorted run
    let lowestVal = getRankValue(sorted[0].rank);
    let highestVal = getRankValue(sorted[sorted.length - 1].rank);

    if (aceHigh) {
      if (sorted[0].rank === 'A') lowestVal = 14;
      if (sorted[sorted.length - 1].rank === 'A') highestVal = 14;
    }

    // Check if run is at the top (can't extend higher)
    const atTop = highestVal === 14 || (aceHigh && hasAce);
    // Check if run is at the bottom (can't extend lower)
    const atBottom = lowestVal === 1 || (!aceHigh && hasAce) || lowestVal === 3;

    if (atTop && !atBottom) {
      // Run is at top, wildcards go at beginning
      placeAtBeginning = true;
    } else if (atBottom && !atTop) {
      // Run is at bottom, wildcards go at end
      placeAtBeginning = false;
    } else {
      // Default: place at end (but player should have been asked)
      placeAtBeginning = false;
    }
  }

  // Place remaining wildcards
  const remainingWilds = wildCards.slice(usedWilds.length);
  if (placeAtBeginning) {
    return [...remainingWilds, ...result];
  } else {
    return [...result, ...remainingWilds];
  }
}

function canCardFitMeld(card, meld) {
  if (meld.type === 'set') {
    if (card.isWild) return true;
    const nonWildCards = meld.cards.filter(c => !c.isWild);
    if (nonWildCards.length > 0 && card.rank === nonWildCards[0].rank) {
      return true;
    }
  } else {
    const testCards = [...meld.cards, card];
    if (validateRun(testCards)) {
      return true;
    }
  }
  return false;
}

function getValidWildcardPositions(wildcard, meld) {
  if (meld.type !== 'run' || !wildcard.isWild) {
    return [];
  }

  const validPositions = [];

  // Test if wildcard can go at the beginning
  const testBeginning = [wildcard, ...meld.cards];
  if (validateRun(testBeginning)) {
    validPositions.push('beginning');
  }

  // Test if wildcard can go at the end
  const testEnd = [...meld.cards, wildcard];
  if (validateRun(testEnd)) {
    validPositions.push('end');
  }

  return validPositions;
}

// Check if a run needs wildcard position choice when melding
function needsWildcardPositionChoice(cards) {
  const nonWildCards = cards.filter(c => !c.isWild);
  const wildCards = cards.filter(c => c.isWild);

  if (wildCards.length === 0 || nonWildCards.length === 0) return false;

  const ranks = nonWildCards.map(c => c.rank);
  const hasKing = ranks.includes('K');
  const hasQueen = ranks.includes('Q');
  const hasAce = ranks.includes('A');
  const hasTwo = ranks.includes('2');
  const hasThree = ranks.includes('3');

  const aceHigh = (hasKing || hasQueen) && !hasTwo && !hasThree;

  // Sort to find the range
  const sorted = [...nonWildCards].sort((a, b) => {
    let aVal = getRankValue(a.rank);
    let bVal = getRankValue(b.rank);
    if (aceHigh) {
      if (a.rank === 'A') aVal = 14;
      if (b.rank === 'A') bVal = 14;
    }
    return aVal - bVal;
  });

  // Count wildcards not used for gaps
  let gapWilds = 0;
  for (let i = 1; i < sorted.length; i++) {
    let prevVal = getRankValue(sorted[i-1].rank);
    let currVal = getRankValue(sorted[i].rank);
    if (aceHigh) {
      if (sorted[i-1].rank === 'A') prevVal = 14;
      if (sorted[i].rank === 'A') currVal = 14;
    }
    gapWilds += currVal - prevVal - 1;
  }

  const remainingWilds = wildCards.length - gapWilds;
  if (remainingWilds <= 0) return false;

  // Check if run is at the edges
  let lowestVal = getRankValue(sorted[0].rank);
  let highestVal = getRankValue(sorted[sorted.length - 1].rank);
  if (aceHigh) {
    if (sorted[0].rank === 'A') lowestVal = 14;
    if (sorted[sorted.length - 1].rank === 'A') highestVal = 14;
  }

  const atTop = highestVal === 14 || (aceHigh && hasAce);
  const atBottom = lowestVal === 1 || (!aceHigh && hasAce) || lowestVal === 3;

  // Can extend in both directions
  const canExtendLow = !atBottom && lowestVal - remainingWilds >= 1;
  const canExtendHigh = !atTop && highestVal + remainingWilds <= 14;

  return canExtendLow && canExtendHigh;
}

function checkMeldsMatchRequirements(playerId, roomId) {
  const gameState = games.get(roomId);
  if (!gameState) return false;

  const req = roundRequirements[gameState.currentRound];
  const melds = gameState.playerMelds[playerId];
  const sets = melds.filter(m => m.type === 'set');
  const runs = melds.filter(m => m.type === 'run');

  if (sets.length !== req.sets || runs.length !== req.runs) return false;

  for (let i = 0; i < req.setSizes.length; i++) {
    if (!sets[i] || sets[i].cards.length < req.setSizes[i]) return false;
  }

  for (let i = 0; i < req.runSizes.length; i++) {
    if (!runs[i] || runs[i].cards.length < req.runSizes[i]) return false;
  }

  return true;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
