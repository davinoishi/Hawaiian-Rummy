# Changelog

All notable changes to Hawaiian Rummy will be documented in this file.

## [v2.0.0] - 2026-02-08

### Major Architecture Overhaul
- **TypeScript Migration**: Complete rewrite from JavaScript to TypeScript
- **Modular Architecture**: Separated codebase into `client/`, `server/`, and `shared/` directories
- **React with Vite**: Modern React 18 frontend built with Vite for fast development
- **Zustand State Management**: Replaced React useState with Zustand stores for cleaner state management
- **Shared Game Engine**: Game logic now shared between client and server in `shared/game-engine/`

### New Project Structure
```
├── client/           # React frontend (TypeScript, Vite, Tailwind)
├── server/           # Express backend (TypeScript, tsx)
└── shared/           # Shared game engine and types
```

### Bug Fixes
- **Wildcard Modal Click Punch-Through**: Fixed critical bug where clicking an arrangement option in the wildcard position modal would also trigger the "Create Run" button behind it, causing "Select at least 3 cards" error
  - Added `event.stopPropagation()` to all modal button click handlers
  - Affects `WildcardPositionModal.tsx`

### Technical Changes
- Server now runs with `tsx` for TypeScript execution
- Client built with Vite and outputs to `public/assets/`
- Type definitions in `shared/game-engine/types.ts`
- Socket handlers organized in `server/socket-handlers/`
- AI logic moved to `server/ai/`

## [Phase 5] - 2025-12-08

### Mobile UX Improvements - Phase 4
- **Enhanced Haptic Feedback (Priority 7)**: Different vibration patterns for various actions
  - Success pattern: Triple pulse [50, 100, 50, 100, 50] for successful discard and meld creation
  - Error pattern: Double pulse [100, 50, 100] for validation errors and failed actions
  - Tap pattern: Light 10ms vibration for button presses
  - Improved feedback clarity helps users understand action results without looking at screen
- **Scroll Optimization (Priority 8)**: Enhanced scrolling behavior on mobile
  - Added -webkit-overflow-scrolling: touch for momentum scrolling
  - Added overscroll-behavior: contain to prevent page bounce
  - Applied to main container and player melds for smoother scrolling experience

### Mobile UX Improvements - Phase 3
- **Conditional Button Display**: Reduced mobile scrolling by showing only valid action buttons
  - "Create Set" and "Create Run" buttons only shown when meld requirements not yet met
  - "Layoff Card" button only shown after meld requirements are met
  - "Cancel Melding" button only shown when melds exist but requirements not yet met
  - "Discard" button always visible (primary action)
- **Full-Screen Buy Notifications**: Buy status notifications now span full screen width for better visibility
- **UI Improvements**:
  - Renamed "Discard Pile & Actions" to "Discard Pile & Buy Actions" for clarity
  - Removed redundant "Buy Actions:" label text

### Mobile UX Improvements - Phase 2
- **Touch Target Improvements**: Increased all button sizes to meet 44px minimum touch target
  - Action buttons (Create Set, Create Run, Layoff, Discard) now have larger padding (0.75rem x 1.25rem)
  - Sort buttons increased to 0.75rem x 1rem padding
  - Buy action buttons increased to meet accessibility standards
  - Volume slider height increased to 44px for easier control
- **Card Size Improvements**: Optimized card sizing for mobile displays
  - Hand cards: 3.5rem x 5rem (matching meld card size for consistency)
  - Card rank text: 1rem
  - Card suit text: 0.875rem
  - WILD indicator text: 0.5rem
  - Meld cards: 3.5rem x 5rem minimum size
  - Player info text increased from 0.75rem to 0.875rem
  - Player name headings increased from 0.875rem to 1rem
- **Button Layout Optimization (Priority 3)**: Improved mobile button layout
  - Vertical button layout on mobile (full width, stacked)
  - Discard button separated with visual distinction (top border and extra padding)
  - Consistent 0.5rem gap between buttons
- **Player Info Optimization (Priority 4)**: Streamlined player displays on mobile
  - AI player card backs hidden (card count still visible)
  - Compact player info boxes with reduced padding
  - Larger, more readable meld cards
- **UI Improvements**:
  - Moved Tutorial Mode checkbox to bottom of opening screen (after How to Play button)

## [Phase 5] - 2025-12-07

### Critical AI Fixes
- **AI Discard Hang**: Fixed critical bug where AI would hang when game phase is 'discard' - AI now properly handles discard phase
- **Safety Timeout**: Added 10-second watchdog timer that forces AI to discard if it gets stuck, preventing game hangs
- **Emergency Discard**: Added fallback logic to discard first card if chooseDiscardCard fails
- **Better Logging**: Enhanced logging to detect and debug AI stuck states

### Mobile UX Improvements
- **Card Selection**: Changed from double-tap to single-tap for easier card selection
- **Drag Threshold**: Increased drag threshold from 15px to 30px to prevent accidental drags when tapping cards
- **Card Spacing**: Increased spacing between cards (gap-3 instead of gap-1) for better touch targets and reduced accidental touches
- **Haptic Feedback**: Added vibration feedback for card selection (20ms) and reordering (50ms)
- **Round Goal Position**: Moved round goal display to just above player scores for less visual prominence
- **Landscape Layout**: Fixed horizontal phone mode to use same vertical layout as portrait mode instead of cramped desktop layout

### Bug Fixes
- **Stuck Drag Mode**: Fixed cards getting stuck in drag mode by ensuring drag state is always reset
- **AI Turn Hang**: Reduced AI decision delay from 3000ms to 1500ms
- **AI Buy Processing**: Added retry logic when AI can't draw due to pending buy requests

## [Phase 5] - 2025-12-06

### Added - Interactive Tutorial System
- **Tutorial Mode**: Complete interactive tutorial for new players
- **Step-by-Step Guide**: 14-step tutorial covering all game mechanics
- **Auto-Start Tutorial**: Tutorial mode now starts immediately without lobby/room sharing
- **Visual Spotlight**: Highlighted elements with blue glow to guide players
- **Progress Tracking**: Clear indication of tutorial progress and completion

### Tutorial Improvements
- **Better Visibility**: Removed dark overlay, buttons now fully visible and clickable
- **Action Prevention**: Prevents out-of-order actions (e.g., drawing before step 5)
- **Exit Functionality**: "Play Real Game" button properly returns to join screen
- **Enhanced Spotlight**: Bright blue border with glow effect instead of blocking overlay
- **Auto-Advancement**: Tutorial automatically advances when actions are completed

### Bug Fixes
- **Server Callback**: Fixed createMeld callback to properly advance tutorial steps
- **Spotlight Positioning**: Dynamic element detection using getBoundingClientRect()
- **Tutorial Flow**: Removed AI turn steps that caused tutorial to hang
- **Socket Reconnection**: Fixed skipTutorial to properly reconnect socket

### Technical Changes
- Tutorial configuration with 14 distinct steps
- Dynamic tutorial box positioning (top/bottom based on spotlight target)
- Step validation and action allowance system
- Tutorial state management with React hooks

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
- Added AI logic with comprehensive strategy
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
