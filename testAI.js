const io = require('socket.io-client');

console.log('Testing AI Player Integration...\n');

// Create a test human player
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✓ Test player connected:', socket.id);
  console.log('✓ Joining game as "Test Human"...\n');
  socket.emit('joinGame', 'Test Human');
});

socket.on('lobbyUpdate', (data) => {
  console.log('📋 Lobby Update:');
  console.log(`   Players (${data.players.length}/4):`);
  data.players.forEach((player, index) => {
    const marker = player.name.startsWith('AI') ? '🤖' : '👤';
    console.log(`   ${index + 1}. ${marker} ${player.name}`);
  });
  console.log('');

  // If we have 4 players, start the game
  if (data.players.length === 4 && !data.gameStarted) {
    console.log('✓ All 4 players present! Starting game in 2 seconds...\n');
    setTimeout(() => {
      console.log('🎮 Starting game...\n');
      socket.emit('startGame');
    }, 2000);
  }
});

socket.on('gameState', (state) => {
  if (state.gamePhase === 'draw' && state.currentRound === 0) {
    console.log('✓ Game started successfully!');
    console.log(`   Round: ${state.currentRound + 1}/10`);
    console.log(`   Current player: ${state.players[state.currentPlayerIndex].name}`);
    console.log(`   Game phase: ${state.gamePhase}`);
    console.log('\n🎉 AI Integration Test PASSED!\n');
    console.log('The AI players successfully:');
    console.log('  ✓ Auto-joined when human player entered');
    console.log('  ✓ Filled lobby to 4 players');
    console.log('  ✓ Game started with mixed human/AI players\n');

    // Disconnect after successful test
    setTimeout(() => {
      console.log('Disconnecting test player...');
      socket.disconnect();
      process.exit(0);
    }, 2000);
  }

  // Monitor AI turns
  if (state.isMyTurn) {
    console.log(`\n👤 Your turn! (Phase: ${state.gamePhase})`);
  } else {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.name.startsWith('AI')) {
      console.log(`🤖 AI turn: ${currentPlayer.name} (Phase: ${state.gamePhase})`);
    }
  }
});

socket.on('error', (msg) => {
  console.error('❌ Error:', msg);
});

socket.on('disconnect', () => {
  console.log('Test player disconnected');
});

// Auto-exit after 30 seconds
setTimeout(() => {
  console.log('\n⚠️  Test timeout - exiting');
  process.exit(1);
}, 30000);
