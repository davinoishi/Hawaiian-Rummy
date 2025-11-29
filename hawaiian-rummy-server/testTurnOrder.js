const io = require('socket.io-client');

// Create a test client
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✓ Connected to server');

  // Join game
  socket.emit('joinGame', 'TestPlayer');
});

socket.on('lobbyUpdate', (data) => {
  console.log('✓ Lobby update:', data.players.map(p => p.name).join(', '));

  // If we're the first player, start the game
  if (data.players.length === 1) {
    console.log('✓ Starting game...');
    setTimeout(() => {
      socket.emit('startGame');
    }, 500);
  }
});

socket.on('turnOrderUpdate', (data) => {
  console.log('\n=== Turn Order Update ===');
  console.log('Phase:', data.phase);
  console.log('Draws:');
  data.draws.forEach(draw => {
    console.log(`  - Player ${draw.playerId}: ${draw.card.rank}${draw.card.suit} (value: ${draw.value})`);
  });

  if (data.tiedPlayers) {
    console.log('Tied players:', data.tiedPlayers);
  }

  if (data.finalOrder) {
    console.log('Final order:', data.finalOrder);
  }
});

socket.on('turnOrderCountdown', (countdown) => {
  console.log(`\n⏱️  Countdown: ${countdown}`);
});

socket.on('gameState', (state) => {
  console.log('\n✓ Game started!');
  console.log('Current round:', state.currentRound);
  console.log('Current player index:', state.currentPlayerIndex);
  console.log('Game phase:', state.gamePhase);
  console.log('Players order:', state.players.map((p, idx) => `${idx + 1}. ${p.name}`).join(', '));

  // Test completed successfully
  console.log('\n✅ Turn order mini-game test PASSED!');
  process.exit(0);
});

socket.on('error', (msg) => {
  console.error('❌ Error:', msg);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout - something went wrong');
  process.exit(1);
}, 30000);
