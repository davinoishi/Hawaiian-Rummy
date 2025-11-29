# Changelog

All notable changes to Hawaiian Rummy will be documented in this file.

## [Phase 4] - 2025-01-17

### Added - AI Opponents
- **AI Players**: Added three intelligent AI opponents (Alex-AI, Jordan-AI, Taylor-AI) that automatically fill empty seats in the lobby
- AI players make strategic decisions including:
  - Melding sets and runs to meet round requirements
  - Buying discards when cards are useful
  - Laying off high-value cards on any player's melds
  - Smart discard selection that avoids helping opponents
  - Checking ALL opponents before discarding (not just next player)

### UI Improvements
- **Clockwise Player Layout**: Players are now arranged in clockwise positions following turn order (bottom: you, left: next player, top: across, right: previous)
- **Compact Player Info**: Combined player cards and melds into unified boxes showing:
  - Card backs for AI players
  - Actual cards for human players (in dedicated hand section)
  - All melds displayed inline
- **Current Player Highlighting**: Removed status bar, now highlighting current player's box with blue background and ring
- **Always-Visible Actions**: All action buttons now always visible, greyed out when unavailable with helpful tooltips
- **Buy Countdown Timer**: 10-second countdown on Pass button when buy requests are pending
- **Improved Buy Display**: Changed from "Buys: 0/3" to "Remaining Buys: 3" format
- **How to Play Button**: Added accessible help button on game screen

### Bug Fixes
- **Buy System**: Fixed bug allowing multiple buys in a row without new discard - only the top card in discard pile can be bought
- **AI Discard Logic**: Fixed AI to check if discard helps ANY opponent (not just next player)

### Technical Changes
- Added `aiPlayer.js` with comprehensive AI logic
- Updated server buy validation to prevent sequential buys
- Refactored UI to use absolute positioning for clockwise layout

## [Phase 3] - Previous Release

### Added
- Complete 10-round game implementation
- Round summary screens with rankings and score tables
- Winner declaration and game over screen
- Buy mechanism with priority system
- Wildcard replacement in runs
- How to Play guide (modal and markdown)
- Favicon and game logo
- Drag-and-drop hand organization

### Features
- 10 rounds with specific requirements per round
- Individual hand visibility
- Real-time game state synchronization
- Turn-based gameplay with buy system
- Meld validation and layoff functionality
- Comprehensive scoring system

## [Phase 2] - Initial Multiplayer

### Added
- Node.js server with Socket.io
- 2-4 player multiplayer support
- Lobby system
- Real-time game synchronization
- Turn-based gameplay

## [Phase 1] - Core Game Mechanics

### Added
- Card game fundamentals (sets, runs, wildcards)
- Meld validation
- Scoring system
- Basic gameplay flow
