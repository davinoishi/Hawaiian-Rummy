const io = require('socket.io-client');

console.log('Testing Buy Request Priority...\\n');

// Create a test human player
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✓ Test player connected');
  socket.emit('joinGame', 'Test Human');
});

socket.on('lobbyUpdate', (data) => {
  console.log(`📋 Lobby: ${data.players.length}/4 players`);

  if (data.players.length === 4 && !data.gameStarted) {
    console.log('✓ Starting game...\\n');
    setTimeout(() => {
      socket.emit('startGame');
    }, 2000);
  }
});

let buyRequestDetected = false;
let currentPlayerPassed = false;

socket.on('gameState', (state) => {
  const currentPlayer = state.players[state.currentPlayerIndex];

  // Detect buy request scenario
  if (state.gamePhase === 'draw' && !state.isMyTurn) {
    // Check if there's a discard and someone wants to buy
    if (state.discardPile && state.discardPile.length > 0) {
      const discard = state.discardPile[state.discardPile.length - 1];

      // Log any buy requests
      const buyRequests = state.players.filter(p => p.hasBuyRequest);
      if (buyRequests.length > 0 && !buyRequestDetected) {
        buyRequestDetected = true;
        console.log(`\\n🔔 BUY REQUEST DETECTED`);
        console.log(`   Discard: ${discard.rank}${discard.suit}`);
        console.log(`   Current player: ${currentPlayer.name}`);
        console.log(`   Buyers: ${buyRequests.map(p => p.name).join(', ')}`);
        console.log(`   Watching to see if current player passes or takes...\\n`);
      }
    }
  }

  // Monitor current player's action
  if (state.gamePhase === 'meld' && buyRequestDetected && !currentPlayerPassed) {
    currentPlayerPassed = true;
    console.log(`✓ Current player completed draw phase (either took discard or passed)`);
    buyRequestDetected = false;
  }
});

socket.on('error', (msg) => {
  console.error('❌ Error:', msg);
});

// Keep running for 2 minutes
setTimeout(() => {
  console.log('\\nTest complete');
  process.exit(0);
}, 120000);
