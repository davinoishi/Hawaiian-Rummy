const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

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

// Game state
let gameState = {
  players: [],
  gameStarted: false,
  currentPlayerIndex: 0,
  currentRound: 0,
  deck: [],
  discardPile: [],
  playerHands: {},
  playerMelds: {},
  playerScores: {},
  roundScores: {}, // Track score per round per player: {playerId: [round1Score, round2Score, ...]}
  gamePhase: 'lobby', // lobby, draw, meld, discard, roundSummary
  hasMetRequirements: {},
  buyRequests: [], // Array of {playerId, timestamp}
  maxBuysPerRound: {},
  buyCount: {},
  lastDiscarder: null,
  roundsWon: {},
  passedBuy: [],
  buyJustProcessed: false, // Flag to prevent current player from taking discard after buy
  continueClicked: [] // Track which players have clicked continue
};

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function startNewRound() {
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

function startGame() {
  gameState.gameStarted = true;
  gameState.currentRound = 0;
  gameState.currentPlayerIndex = 0;

  // Initialize scores, rounds won, and round scores
  gameState.players.forEach(playerId => {
    gameState.playerScores[playerId] = 0;
    gameState.roundsWon[playerId] = 0;
    gameState.roundScores[playerId] = [];
  });

  startNewRound();
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinGame', (playerName) => {
    if (gameState.gameStarted) {
      socket.emit('gameAlreadyStarted');
      return;
    }

    if (gameState.players.length >= 4) {
      socket.emit('gameFull');
      return;
    }

    gameState.players.push(socket.id);
    socket.playerName = playerName;
    socket.playerId = socket.id;

    console.log(`${playerName} joined. Players: ${gameState.players.length}`);

    io.emit('lobbyUpdate', {
      players: gameState.players.map(id => {
        const sock = io.sockets.sockets.get(id);
        return { id, name: sock ? sock.playerName : 'Unknown' };
      }),
      gameStarted: gameState.gameStarted
    });
  });

  socket.on('startGame', () => {
    if (gameState.players.length < 2) {
      socket.emit('error', 'Need at least 2 players to start');
      return;
    }

    startGame();
    broadcastGameState();
  });

  socket.on('drawCard', () => {
    if (!isPlayerTurn(socket.id) || gameState.gamePhase !== 'draw') {
      return;
    }

    // Check if someone with higher priority wants to buy
    const currentPlayerIndex = gameState.currentPlayerIndex;
    const hasHigherPriorityBuy = gameState.buyRequests.some(req => {
      const reqIndex = gameState.players.indexOf(req.playerId);
      const reqDistance = (reqIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;
      return reqDistance > 0; // Anyone after current player has priority
    });

    if (hasHigherPriorityBuy) {
      socket.emit('error', 'Waiting for buy requests to be processed');
      return;
    }

    const card = gameState.deck.shift();
    gameState.playerHands[socket.id].push(card);
    gameState.gamePhase = 'meld';
    gameState.buyJustProcessed = false; // Reset flag
    
    broadcastGameState();
  });

  socket.on('requestBuy', () => {
    // Can't buy if it's your turn
    if (isPlayerTurn(socket.id)) {
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
    }

    broadcastGameState();
  });

  socket.on('cancelBuy', () => {
    gameState.buyRequests = gameState.buyRequests.filter(r => r.playerId !== socket.id);
    broadcastGameState();
  });

  socket.on('passBuy', () => {
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
      broadcastGameState();
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
      processBuyRequests();
      gameState.passedBuy = [];
    }
    
    broadcastGameState();
  });

  socket.on('takeDiscard', () => {
    if (!isPlayerTurn(socket.id) || gameState.gamePhase !== 'draw') {
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
    
    // Clear any pending buy requests since current player took the card
    gameState.buyRequests = [];
    
    broadcastGameState();
  });

  socket.on('createMeld', ({ type, cardIds }) => {
    if (!isPlayerTurn(socket.id) || gameState.gamePhase === 'draw') {
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

    // Sort run cards
    const sortedCards = type === 'run' ? sortRunCards(cards) : cards;
    
    gameState.playerMelds[socket.id].push({ type, cards: sortedCards });
    gameState.playerHands[socket.id] = hand.filter(c => !cardIds.includes(c.id));
    
    // Check if requirements met
    if (checkMeldsMatchRequirements(socket.id)) {
      gameState.hasMetRequirements[socket.id] = true;
    }
    
    broadcastGameState();
  });

  socket.on('cancelMelds', () => {
    if (!isPlayerTurn(socket.id) || gameState.gamePhase === 'draw') {
      return;
    }

    // Return all melded cards to hand
    const myMelds = gameState.playerMelds[socket.id] || [];
    const cardsToReturn = myMelds.flatMap(meld => meld.cards);
    
    gameState.playerHands[socket.id] = [...gameState.playerHands[socket.id], ...cardsToReturn];
    gameState.playerMelds[socket.id] = [];
    gameState.hasMetRequirements[socket.id] = false;
    
    broadcastGameState();
  });

  socket.on('layoffCard', ({ cardId, meldOwnerId, meldIndex, wildcardToReplace, wildcardNewPosition, wildcardPosition }) => {
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
        endRound(socket.id);
      }

      broadcastGameState();
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
        endRound(socket.id);
      }

      broadcastGameState();
      return;
    }

    // Non-wildcard or set layoff
    const newCards = [...meld.cards, card];
    gameState.playerMelds[meldOwnerId][meldIndex].cards =
      meld.type === 'run' ? sortRunCards(newCards) : newCards;

    gameState.playerHands[socket.id] = hand.filter(c => c.id !== cardId);

    // Check if player won by laying off all cards
    if (gameState.playerHands[socket.id].length === 0) {
      endRound(socket.id);
    }

    broadcastGameState();
  });

  socket.on('discard', (cardId) => {
    if (!isPlayerTurn(socket.id) || gameState.gamePhase === 'draw') {
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
      const meetsReqs = checkMeldsMatchRequirements(socket.id);
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
        checkMeldsMatchRequirements(socket.id)) {
      endRound(socket.id);
    } else {
      nextTurn();
    }
    
    broadcastGameState();
  });

  socket.on('reorderHand', (cardIds) => {
    const hand = gameState.playerHands[socket.id];
    const reordered = cardIds.map(id => hand.find(c => c.id === id)).filter(c => c);
    gameState.playerHands[socket.id] = reordered;
    broadcastGameState();
  });

  socket.on('newGame', () => {
    if (gameState.gamePhase === 'gameOver') {
      startGame();
      broadcastGameState();
    }
  });

  socket.on('continueToNextRound', () => {
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
      startNewRound();
    }

    broadcastGameState();
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    gameState.players = gameState.players.filter(id => id !== socket.id);
    
    if (gameState.gameStarted && gameState.players.length === 0) {
      resetGame();
    }
    
    io.emit('lobbyUpdate', {
      players: gameState.players.map(id => {
        const sock = io.sockets.sockets.get(id);
        return { id, name: sock ? sock.playerName : 'Unknown' };
      }),
      gameStarted: gameState.gameStarted
    });
  });
});

function isPlayerTurn(playerId) {
  return gameState.players[gameState.currentPlayerIndex] === playerId;
}

function nextTurn() {
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.gamePhase = 'draw';
  gameState.buyRequests = []; // Clear buy requests for new turn
  gameState.passedBuy = []; // Clear passed buy list
  gameState.buyJustProcessed = false; // Reset buy flag for new turn
}

function endRound(winnerId) {
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
    broadcastGameState();
  } else {
    gameState.gamePhase = 'gameOver';
    broadcastGameState();
  }
}

function getCardPoints(card) {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === '2') return 20;
  if (card.rank === 'A') return 15;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  return 5;
}

function resetGame() {
  gameState = {
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

function getNextPlayerInOrder(currentPlayerId) {
  const currentIndex = gameState.players.indexOf(currentPlayerId);
  const nextIndex = (currentIndex + 1) % gameState.players.length;
  return gameState.players[nextIndex];
}

function processBuyRequests() {
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
  const discardCard = gameState.discardPile.pop(); // Remove from discard pile
  const deckCard = gameState.deck.shift();

  gameState.playerHands[buyingPlayer].push(discardCard);
  gameState.playerHands[buyingPlayer].push(deckCard);
  gameState.buyCount[buyingPlayer]++;

  // Clear all buy requests and set flag to prevent current player from taking discard
  gameState.buyRequests = [];
  gameState.buyJustProcessed = true;
}

function broadcastGameState() {
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
      
      // Current player can draw if:
      // 1. It's their turn AND (no buy requests OR they are closer than any buyer)
      const canDraw = isPlayerTurn(playerId) && (
        gameState.buyRequests.length === 0 || 
        nextBuyerDistance === Infinity
      );
      
      // Player can buy if:
      // 1. Not their turn
      // 2. Haven't exceeded max buys
      // 3. Didn't discard the card (if someone has discarded)
      // 4. There's actually a card in the discard pile
      // 5. No one with higher priority (closer to current) has requested
      const canBuy = !isPlayerTurn(playerId) &&
                     gameState.gamePhase === 'draw' &&
                     gameState.buyCount[playerId] < maxBuys &&
                     (gameState.lastDiscarder === null || gameState.lastDiscarder !== playerId) &&
                     gameState.discardPile.length > 0 &&
                     distance > 0;
      
      // Player should see pass button if:
      // 1. Someone wants to buy
      // 2. This player is current player OR between current and the buyer
      // 3. They haven't requested buy themselves
      const shouldShowPass = gameState.buyRequests.length > 0 &&
                            !gameState.buyRequests.some(r => r.playerId === playerId) &&
                            (isPlayerTurn(playerId) || 
                             (distance > 0 && gameState.buyRequests.some(req => {
                               const reqIndex = gameState.players.indexOf(req.playerId);
                               const reqDistance = (reqIndex - currentPlayerIndex + gameState.players.length) % gameState.players.length;
                               return reqDistance > distance;
                             })));
      
      // Current player can take discard if it's their turn AND no buy just processed
      const canTakeDiscard = isPlayerTurn(playerId) && gameState.gamePhase === 'draw' && !gameState.buyJustProcessed;
      
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
            roundScores: gameState.roundScores[id] || []
          };
        }),
        myHand: gameState.playerHands[playerId] || [],
        myMelds: gameState.playerMelds[playerId] || [],
        discardPile: gameState.discardPile,
        deckSize: gameState.deck.length,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentRound: gameState.currentRound,
        gamePhase: gameState.gamePhase,
        isMyTurn: isPlayerTurn(playerId),
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
  for (let i = 1; i < sortedLow.length; i++) {
    const gap = sortedLow[i] - sortedLow[i-1] - 1;
    if (gap < 0) return false;
    gapsLow += gap;
  }
  // Check for wrap-around: if we have low cards (≤4) and high cards (≥11), it's wrapping
  const hasLowCards = sortedLow.some(v => v <= 4);
  const hasHighCards = sortedLow.some(v => v >= 11);
  if (hasLowCards && hasHighCards) {
    // This is a wrap-around like 2-3-J-Q-K-A, which is invalid
    // Don't return true even if gaps can be filled
  } else if (gapsLow <= wildCount) {
    return true;
  }

  // Try Aces high
  let sortedHigh = values.map(v => v.high).sort((a, b) => a - b);
  let gapsHigh = 0;
  for (let i = 1; i < sortedHigh.length; i++) {
    const gap = sortedHigh[i] - sortedHigh[i-1] - 1;
    if (gap < 0) return false;
    gapsHigh += gap;
  }
  // Check for wrap-around: if we have low cards (≤4) and high cards (≥11), it's wrapping
  const hasLowCardsHigh = sortedHigh.some(v => v <= 4);
  const hasHighCardsHigh = sortedHigh.some(v => v >= 11);
  if (hasLowCardsHigh && hasHighCardsHigh) {
    // This is a wrap-around, which is invalid
    return false;
  } else if (gapsHigh <= wildCount) {
    return true;
  }

  return false;
}

function sortRunCards(cards) {
  const nonWildCards = cards.filter(c => !c.isWild);
  const wildCards = cards.filter(c => c.isWild);
  
  if (nonWildCards.length === 0) return cards;
  
  const ranks = nonWildCards.map(c => c.rank);
  const hasKing = ranks.includes('K');
  const hasQueen = ranks.includes('Q');
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
  
  while (usedWilds.length < wildCards.length) {
    result.push(wildCards[usedWilds.length]);
    usedWilds.push(wildCards[usedWilds.length]);
  }
  
  return result;
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

function checkMeldsMatchRequirements(playerId) {
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
