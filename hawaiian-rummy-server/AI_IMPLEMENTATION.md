# AI Player Implementation Guide

## Overview

This Hawaiian Rummy game now features intelligent AI players that automatically fill empty slots to ensure 4-player games.

## How It Works

### Auto-Join System

1. When a human player joins the lobby, the server automatically spawns AI players
2. AI players fill remaining slots up to 4 total players
3. AI players have names: "AI Player 1", "AI Player 2", "AI Player 3"

### AI Decision-Making

The AI uses strategic heuristics to play competently:

#### Draw Phase
- Evaluates whether discard card is useful for forming sets/runs
- Takes discard if useful, otherwise draws from deck
- Considers wildcards highly valuable

#### Buy Phase
- Requests to buy discarded cards that help complete melds
- Respects buy limits per round
- Passes when card isn't useful

#### Meld Phase
- **IMPORTANT FIX**: Only creates melds if it can meet ALL round requirements
- Prevents partial melding that would cause stuck turns
- Uses exact card counts needed for requirements
- Matches set sizes (e.g., 3 cards for "set of 3")
- Matches run sizes (e.g., 7 cards for "run of 7")

#### Discard Phase
- **IMPORTANT FIX**: Cancels incomplete melds before discarding
- This prevents the "Meld requirements not met" error
- Chooses to discard high-point, low-utility cards
- Keeps wildcards and useful cards for future melds

#### Layoff Phase
- After meeting requirements, tries to layoff high-value cards
- Targets opponent melds to reduce hand points
- Prioritizes getting rid of Jokers (50 pts) and 2s (20 pts) first

## Key Files

- `aiPlayer.js` - Main AI player class with decision logic
- `server.js` - Modified to spawn/manage AI players
- `testAI.js` - Test script to verify AI integration

## Bug Fixes Applied

### Issue 1: AI Players Getting Stuck

**Problem**: AI would create partial melds that didn't meet round requirements, then couldn't discard because the server validates meld completion.

**Error Message**:
```
Meld requirements not met. Complete your melds or cancel them before discarding.
```

**Solution**: Two-part fix in `aiPlayer.js`:

1. **Smart Meld Creation** (`findBestMelds` function, lines 366-422):
   - Only creates melds if ALL requirements can be met
   - Uses exact card counts specified by round requirements
   - Returns empty array if can't complete full requirements
   - Prevents partial melding entirely

2. **Fallback Cancel Logic** (`handleDiscardPhase` function, lines 185-222):
   - Checks if player has incomplete melds before discarding
   - Automatically cancels melds that don't meet requirements
   - Then discards safely
   - Acts as safety net if meld logic fails

### Issue 2: AI Not Continuing After Round Ends

**Problem**: AI players would not click "continue" button after round summary, causing the game to get stuck.

**Solution**: Special case handling in `aiPlayer.js` (lines 59-73):

1. **Early Phase Detection**:
   - Checks for `roundSummary` phase at the very beginning of `handleGameState()`
   - Bypasses normal turn checking and state tracking

2. **Unique State Signature**:
   - Uses `roundSummary-{roundNumber}` signature
   - Ensures each round is processed exactly once
   - Prevents duplicate continue requests

3. **Immediate Processing**:
   - No 1-second delay for round continuation (only 500ms)
   - Emits `continueToNextRound` event
   - Allows game to flow smoothly between rounds

### Issue 3: AI Helping Opponents with Discards

**Problem**: AI would discard high-point cards without considering if they would help the next player complete melds.

**Solution**: Smart discard analysis in `aiPlayer.js` (lines 520-602):

1. **Opponent Analysis** (`wouldHelpOpponent` function):
   - Checks if card can layoff on next player's melds
   - Avoids discarding cards matching opponent's set ranks
   - Avoids discarding cards that could extend opponent's runs (same suit + adjacent values)

2. **Discard Penalty System** (`chooseDiscardCard` function):
   - Applies -200 point penalty to cards that would help opponents
   - Prioritizes keeping opponent-helpful cards over high-point cards
   - Strategically chooses discards to minimize helping next player

**Code Location**:
```javascript
// Line 544: Check if card would help next player
const helpsNextPlayer = this.wouldHelpOpponent(card, nextPlayer);
const opponentPenalty = helpsNextPlayer ? -200 : 0;
```

## Testing

Run the test script:
```bash
node testAI.js
```

Expected output:
- AI players auto-join lobby
- Game starts with 4 players
- AI players make intelligent moves
- No stuck turns or errors

## Starting the Server

```bash
npm start
```

The server runs on `http://localhost:3001`

## Configuration

### AI Settings (in `aiPlayer.js`)

```javascript
this.decisionDelay = 1000; // AI "thinking" time in ms
```

### AI Names (in `server.js`)

```javascript
const AI_NAMES = ['AI Player 1', 'AI Player 2', 'AI Player 3'];
```

You can customize these to give AI players different names.

## How AI Players Are Managed

### Spawning
- Triggered when human joins lobby
- Triggered when game starts with < 4 players
- Creates socket.io client connections

### Cleanup
- AI players disconnect when game resets
- Removes all AI instances on `resetGame()`

## Future Improvements

Potential enhancements:
- Difficulty levels (easy/medium/hard)
- More sophisticated meld optimization
- Wildcard replacement strategy in runs
- Opponent hand tracking and probability analysis
- Strategic discard choices (avoid giving opponents useful cards)
