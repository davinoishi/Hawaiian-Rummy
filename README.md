# Hawaiian Rummy - Card Game

A multiplayer card game built with TypeScript, React, and Socket.IO. This is a version of Rummy I played as a kid with my family. Since its rules are unique, I had to build the game from scratch. This is altogether vibe coded with Claude Code.

<img width="500" height="500" alt="hawaiian-rummy-logo" src="https://github.com/user-attachments/assets/be1f695c-bbb1-498e-9311-41e04a9dad60" />

## Live Demo

Play now at: **https://gdlnmnsw4amo.nobgp.com**

## Features

### Game Mechanics
- **Multi-Room Support**: Create or join independent game rooms for simultaneous games
- 4 players per room (at least one human is required, and AI opponents will fill any open spots)
- **AI Players**: Intelligent AI opponents automatically fill empty seats
- **Offline Mode (PWA)**: Play against AI without internet connection - installable as a Progressive Web App
- 10 rounds with increasing difficulty
- Complete buy mechanism with priority system
- Sets, runs, wildcards (2s and Jokers), and layoff functionality
- Wildcard replacement in runs
- Real-time game state synchronization
- Turn-based gameplay
- Individual hand visibility
- Player scores and meld tracking

### Social Features
- **Private Rooms**: Create password-protected rooms for friends-only games
- **Invite Links**: Share a single URL that includes room code and password
- **In-Game Chat**: Real-time messaging between players during the game
- **Rematch**: Quick restart with the same players after a game ends
- **Player Disconnect Handling**: 45-second grace period with AI takeover for disconnected players

### User Interface
- Clockwise player arrangement following turn order
- Current player highlighting with a colored background
- Compact player info showing cards and melds
- Always-visible action buttons (greyed when unavailable)
- Buy countdown timer
- How to Play guide accessible during gameplay
- Drag-and-drop hand organization
- Sound effects with volume controls (card actions, notifications, victory fanfare)
- Mobile-optimized responsive design with touch support
- Card zoom on long-press for better visibility
- **Light/Dark Theme**: Choose your preferred color scheme or use system default
- **Settings Panel**: Customize sound, haptics, and theme preferences
- **Offline Status Indicator**: Shows connection status with visual indicator

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, Socket.IO, TypeScript (tsx)
- **State Management**: Zustand
- **Build**: Vite (client), tsx (server)

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

Server will run on http://localhost:3000

For development with auto-reload:
```bash
npm run dev
```

All players need to be on the same LAN and access the game via http://<IP_address_of_host>:3000

## Setup using noBGP (uses LLM to install and deploy the game)

Requirements: a Linux machine to install noBGP agent (this will also be the host server for the game), a free noBGP account, an account with an LLM agent (ChatGPT, Claude)

- For ChatGPT:
  - Free accounts can use our custom GPT, [piGPT](https://chatgpt.com/g/g-69055d82e7e08191a15cc07894808c21-pi-gpt)
  - For users with paid accounts, you can use the custom GPT or add our MCP server to your agent
- For Claude, you will need a paid account to connect the noBGP MCP server to your agent
- More details and instructions on using either the custom GPT or the MCP server: https://docs.nobgp.com

1. Once you have created a noBGP account via your LLM, you will be able to get a registration/installation code from your LLM. Just ask the LLM to provide the one-line code for your device:
   - "Give me the installation command to install noBGP on my (Raspberry Pi, AWS EC2 instance, Nvidia Spark, Debian Linux machine, etc.)"
   - Run the command on your device. This will install the noBGP agent and register your device.

2. Ask your LLM to install this project on your device:
   - "Install https://github.com/davinoishi/Hawaiian-Rummy on my (Raspberry Pi)"

3. Ask your LLM to create a public URL to share the game:
   - "Create a public URL to share the game"
   - This will create a proxy URL in the format https://xxxxxxxxxx.nobgp.com that will redirect users to the proper host and port. There is no need for any other networking steps such as port forwarding.

4. Share the URL with all your friends to enjoy the game.

[noBGP Documentation](https://docs.nobgp.com)

## How to Play

1. In your browser, open http://localhost:3000 for LAN-only play or your noBGP URL for remote play
2. Enter your name
3. **Create a new room** or **Join an existing room** by entering a room ID
4. Share the room ID with friends so they can join your game
5. Wait for other players to join (up to 4 players total per room)
6. Any player can click "Start Game" when ready. AI players will fill in any empty spots so the total number of players will always be 4
7. Players take turns:
   - Draw from the deck or take the discard pile
   - Create sets and runs to meet round requirements
   - Layoff cards to any player's melds
   - A round ends when one player has no cards remaining

## Game Flow

### Lobby
- Players join and see other players
- Game starts when any player clicks "Start Game" (maximum of 4 players)

### Gameplay
- Turn indicator shows whose turn it is
- Current player can draw, meld, layoff, and discard
- Other players wait and can see all melds. Players are allowed to place their cards on other players' melds as long as they have completed the round requirements themselves
- Round ends when a player has no cards remaining in their hand
- Scores calculated, and the next round begins
- Game ends after 10 rounds

## Project Structure

```
hawaiian-rummy/
├── client/                    # React frontend (TypeScript)
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── actions/       # ActionBar, BuyActions
│   │   │   ├── game/          # GameBoard, PlayerHand, Card, ChatPanel, etc.
│   │   │   ├── lobby/         # JoinScreen, LobbyScreen
│   │   │   ├── modals/        # HowToPlayModal, WildcardPositionModal
│   │   │   ├── profile/       # PlayerProfile, Leaderboard
│   │   │   └── ui/            # Notifications, Tutorial, SettingsPanel, OnlineStatusIndicator
│   │   ├── hooks/             # Custom React hooks (useLocalGame, useOnlineStatus, etc.)
│   │   ├── services/          # Local game runner for offline play
│   │   ├── store/             # Zustand state stores (game, UI, settings, profile)
│   │   └── styles/            # Tailwind CSS
│   ├── public/
│   │   ├── sw.js              # Service worker for PWA/offline support
│   │   ├── manifest.json      # PWA manifest
│   │   └── icons/             # App icons for PWA
│   ├── package.json
│   └── vite.config.ts
├── server/                    # Express backend (TypeScript)
│   ├── ai/                    # AI player logic
│   │   ├── ai-manager.ts
│   │   ├── ai-strategy.ts
│   │   └── strategies/
│   ├── socket-handlers/       # Socket.IO event handlers
│   ├── routes/                # REST API routes (profiles)
│   ├── game-manager.ts
│   ├── profile-manager.ts     # Player profile management
│   └── index.ts
├── shared/                    # Shared game engine (TypeScript)
│   ├── game-engine/
│   │   ├── actions/           # Game actions (draw, meld, discard, etc.)
│   │   ├── validation/        # Meld validation (sets, runs, requirements)
│   │   ├── types.ts           # TypeScript type definitions
│   │   ├── deck.ts            # Deck management
│   │   └── game-state.ts      # Game state management
│   ├── ai/                    # Isomorphic AI for offline play
│   └── profile-types.ts       # Player profile types
├── public/                    # Static assets & built client
│   ├── assets/                # Vite-built JS/CSS bundles
│   ├── sw.js                  # Service worker
│   └── index.html             # Entry point
├── data/                      # Persistent data storage
│   └── profiles/              # Player profile JSON files
├── package.json               # Root dependencies
├── tsconfig.json              # TypeScript config (client)
└── tsconfig.server.json       # TypeScript config (server)
```

## NPM Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with auto-reload
npm run build      # Build server TypeScript
npm run client:dev # Start Vite dev server for client
npm run client:build # Build client for production
```

## Testing Locally

To test with multiple players:
1. Open multiple browser windows/tabs to http://localhost:3000
2. Each tab can create a new room or join the same room
3. Multiple independent games can run simultaneously in different rooms

## Recent Updates

- **v2.3.0**: Offline/PWA mode - play against AI without internet connection
  - Progressive Web App with service worker for asset caching
  - Isomorphic game engine runs client-side for offline play
  - Offline mode indicator and seamless online/offline switching
  - Fixed wildcard run creation bug in offline mode
  - Fixed buy window timer display
- **v2.2.0**: Social features and UI improvements
  - Private rooms with password protection
  - Shareable invite links with embedded room code and password
  - In-game chat for real-time player communication
  - Rematch button for quick restarts with same players
  - Light/dark theme support with system preference detection
  - Settings panel for sounds, haptics, and theme
  - Player profiles with statistics tracking
- **v2.1.0**: Player disconnect handling with 45-second grace period and AI takeover
- **v2.0.0**: Migrated to TypeScript with separate client/server/shared architecture
- Fixed click punch-through bug in wildcard position modal
- Improved AI player decision-making
- Enhanced mobile touch support
- 5-second buy window for fairer gameplay

## Future Enhancements

- Saved games and resume functionality for offline mode
- Tournament mode
- Custom game rules configuration
- Enhanced AI difficulty levels
- Mobile app version
