# Hawaiian Rummy - Multiplayer Card Game

This is a version of Rummy I played as a kid with my family. Since it's rules are unique, I had to build the game from scratch. This is completely vibe coded with Claude Code. It's a simple web app. The instructions to install manually or via noBGP piGPT or noBGP MCP are below.

## Features

### Game Mechanics
- **Multi-Room Support**: Create or join independent game rooms for simultaneous games
- 4 players per room (at least one human is required and AI opponents will fill any open spots)
- **AI Players**: Intelligent AI opponents (Alex-AI, Jordan-AI, Taylor-AI) automatically fill empty seats
- 10 rounds with increasing difficulty
- Complete buy mechanism with priority system
- Sets, runs, wildcards (2s and Jokers), and layoff functionality
- Wildcard replacement in runs
- Real-time game state synchronization
- Turn-based gameplay
- Individual hand visibility
- Player scores and meld tracking

### User Interface
- Clockwise player arrangement following turn order
- Current player highlighting with colored background
- Compact player info showing cards and melds
- Always-visible action buttons (greyed when unavailable)
- Buy countdown timer
- How to Play guide accessible during gameplay
- Drag-and-drop hand organization
- Sound effects with volume controls (card actions, notifications, victory fanfare)
- Mobile-optimized responsive design with touch support
- Card zoom on long-press for better visibility

## Manual Setup
1. Clone/Download repo to a local folder

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

Server will run on http://localhost:3001
All the players need to be on the same LAN and access the game via HTTP://<IP_address_of_host>:3001 

## Setup using noBGP (uses LLM to install and deploy the game)
Requirements: a Linux machine to install noBGP agent )this will also be the host server for the game), a free noBGP account, an account with an LLM agent (ChatGPT, Claude)
   - For ChatGPT, free accounts can use our custom GPT, piGPT. For users with paid accounts, you can use the custom GPT or add our MCP server to your agent
   - For Claude, you will need a paid account to connect the noBGP MCP server to your agent
   - More details and instructions on using either the custom GPT or the MCP server https://docs.nobgp.com
1. Once you have created a noBGP account via your LLM, you will be able to get a registration/installation code from your LLM. Just ask the LLM to provide the one-line code for your device
   - "Give me the installation command to install noBGP on my (Raspberry Pi, AWS EC2 instance, Nvidia Spark, Debian Linux machine, etc.)
   - Run the command on your device. This will install the noBGP agent and register your device.
2. Ask you LLM to install this project on your device
   - "Install https://github.com/davinoishi/Hawaiian-Rummy on my (Raspberry Pi)
3. Ask you rLLM to create a public URL to share the game
   - "Create a public URL to share the game"
   - This will create a proxy URL in the format https://xxxxxxxxxx.nobgp.com that will redirect users to proper host and port. There is no need for any other networking steps such as port forwarding.
4. Share the URL with all your friends to enjoy the game.

[noBGP Documentation](https://docs.nobgp.com)

## How to Play

1. In your browser, Open http://localhost:3001 for LAN only play or https://xxxxxxxxxx.nobgp.com for remote play using noBGP
2. Enter your name
3. **Create a new room** or **Join an existing room** by entering a room ID
4. Share the room ID with friends so they can join your game
5. Wait for other players to join (up to 4 players total per room)
6. Any player can click "Start Game" when ready. AI players will fill in any empty spots so the total number of players will always be 4
7. Players take turns:
   - Draw from deck or take discard pile
   - Create sets and runs to meet round requirements
   - Layoff cards to any player's melds
   - A round ends when one player has no card remaining

## Game Flow

### Lobby
- Players join and see other players
- Game starts when any player clicks "Start Game" (maximum of 4 players)

### Gameplay
- Turn indicator shows whose turn it is
- Current player can draw, meld, layoff, and discard
- Other players wait and can see all melds, playes are allowed to place their cards on other player melds as long as they have completed the run melds themselves
- Round ends when a player has no cards remaining in their hand
- Scores calculated and next round begins
- Game ends after 10 rounds

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
├── server.js          # Node.js server with game logic and multi-room support
├── aiPlayer.js        # AI player logic
├── public/
│   └── index.html     # React client with sound effects and mobile support
├── package.json       # Dependencies
└── README.md          # This file
```

## Testing Locally

To test with multiple players:
1. Open multiple browser windows/tabs to http://localhost:3001
2. Each tab can create a new room or join the same room
3. Multiple independent games can run simultaneously in different rooms

## Future Enhancements

- Game history and statistics tracking
- Saved games and resume functionality
- Player reconnection after disconnect
- Tournament mode
- Custom game rules configuration
- Enhanced AI difficulty levels
- Mobile app version
