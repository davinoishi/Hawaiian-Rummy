# Hawaiian Rummy - Multiplayer

Implemented with Node.js server and Socket.io for multiplayer gameplay.

## Features

- 2-4 players can join from different browsers
- Real-time game state synchronization
- Lobby system with player list
- Turn-based gameplay
- Individual hand visibility
- Player scores and meld tracking

## Setup
1. Clone/Download repo

2. Install dependencies:
```bash
cd hawaiian-rummy-server
npm install
```

3. Start the server:
```bash
npm start
```

Server will run on http://localhost:3001

## How to Play

1. Open http://localhost:3001 in your browser for LAN only play.  If you deploy with the noBGP MCP or custom GPT, you can ask your LLM to create a public URL to access the game. noBGP will create a proxy URL that anyone on the public internet can use to access the game. Share the URL with players.
2. Enter your name and click "Join Game"
3. Wait for other players to join (2-4 players total)
4. Any player can click "Start Game" when ready
5. Players take turns:
   - Draw from deck or take discard pile
   - Create sets and runs to meet round requirements
   - Layoff cards to any player's melds
   - Discard to end turn

## Game Flow

### Lobby
- Players join and see other players
- Game starts when any player clicks "Start Game" (minimum 2 players)

### Gameplay
- Turn indicator shows whose turn it is
- Current player can draw, meld, layoff, and discard
- Other players wait and can see all melds
- Round ends when a player discards all cards
- Scores calculated and next round begins
- Game ends after 8 rounds

## Technical Details

### Server (server.js)
- Express HTTP server
- Socket.io for WebSocket communication
- Game state management
- Card validation and scoring
- Turn management

### Client (public/index.html)
- React-based UI
- Socket.io client
- Real-time updates
- Drag-and-drop hand organization

## File Structure

```
hawaiian-rummy-server/
├── server.js          # Node.js server with game logic
├── public/
│   └── index.html     # React client
├── package.json       # Dependencies
└── README.md          # This file
```

## Testing Locally

Open multiple browser windows/tabs to http://localhost:3001 to simulate multiple players.

## Future Upates

- AI players to fill empty seats
- Game history and statistics
