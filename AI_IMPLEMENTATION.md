# AI Player Implementation Guide

## Overview

Hawaiian Rummy features intelligent AI players that automatically fill empty slots to ensure 4-player games. The AI system uses personality-based strategies with bottleneck-focused decision-making.

## Architecture

### File Structure

```
shared/
├── ai/
│   ├── index.ts              # AI module exports
│   ├── ai-strategy.ts        # Base strategy interface and context
│   ├── ai-personalities.ts   # AI personality types and round strategies
│   └── standard-ai.ts        # Standard AI strategy implementation
server/
├── ai/
│   ├── ai-manager.ts         # AI player lifecycle management
│   └── ...
```

### Key Components

1. **AIManager** (`ai-manager.ts`)
   - Manages AI player instances
   - Handles spawning and cleanup
   - Coordinates AI turns with game state

2. **AIStrategy** (`ai-strategy.ts`)
   - Defines the interface for AI decision-making
   - Allows for multiple strategy implementations

3. **StandardAI** (`strategies/standard-ai.ts`)
   - Default AI implementation
   - Handles all game phases: draw, meld, layoff, discard

## How It Works

### Auto-Join System

1. When a human player joins the lobby, the server checks player count
2. AI players are spawned to fill remaining slots (up to 4 total)
3. AI players have names: "Alex-AI", "Jordan-AI", "Taylor-AI"

### AI Decision-Making

The AI uses strategic heuristics with personality-based decision-making:

## AI Personalities

Four personality types provide variety in play styles:

| Personality | Buy Aggression | Bottleneck Focus | Risk Tolerance |
|-------------|----------------|------------------|----------------|
| Aggressive  | 0.9            | 0.7              | 0.6            |
| Conservative| 0.6            | 0.5              | 0.3            |
| Strategic   | 0.75           | 0.95             | 0.4            |
| Balanced    | 0.7            | 0.7              | 0.5            |

## Round Strategy

Each round has a calculated strategy based on requirements:

- **Bottleneck Type**: Identifies if sets or runs are harder (runs usually are)
- **Bottleneck Size**: The size of the hardest meld requirement
- **Target Hand Size**: Ideal number of cards to aim for
- **Buy Threshold Modifier**: Adjusts how aggressively to buy

## Decision-Making

#### Draw Phase
- Evaluates whether discard card is useful for forming sets/runs
- Takes discard if useful, otherwise draws from deck
- Considers wildcards highly valuable
- **If requirements met**: Only takes discard if card can be immediately laid off

#### Buy Phase (v2.4.0 Improvements)
- **Hand Size Penalty**: Progressive penalty when hand would exceed cards needed
- **Dynamic Max Buys**: Early rounds limit to 1 buy, later rounds allow more
  - Round 1-4: Max 1 buy (already have enough cards)
  - Round 5-6: Max 2 buys
  - Round 7-8: Max 3 buys
  - Round 9-10: Max 4 buys
- **Layoff Check**: Values cards that can be laid off after going down
- **Pair Value Fix**: Only values pairs highly if sets are the bottleneck
- Won't buy just to block opponents if card isn't useful

#### Meld Phase
- **IMPORTANT**: Only creates melds if it can meet ALL round requirements
- Prevents partial melding that would cause stuck turns
- Uses exact card counts needed for requirements
- Matches set sizes (e.g., 3 cards for "set of 3")
- Matches run sizes (e.g., 7 cards for "run of 7")

#### Discard Phase
- Cancels incomplete melds before discarding if needed
- Chooses to discard high-point, low-utility cards
- Keeps wildcards and useful cards for future melds
- **Next Player Awareness**: Heavy penalty (-30) for discarding cards the next player can immediately lay off
- **Opponent Meld Check**: Checks all opponent melds before discarding
- **If requirements met**: Prioritizes discarding highest point cards first (minimizes penalty if someone else goes out)

#### Layoff Phase
- After meeting requirements, tries to layoff high-value cards
- Targets any player's melds to reduce hand points
- Prioritizes getting rid of Jokers (50 pts) and 2s (20 pts) first

## Type Definitions

Key types from `shared/game-engine/types.ts`:

```typescript
interface AIPlayerConfig {
  name: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  decisionDelay?: number;
}

interface AIDecision {
  action: GameAction;
  reasoning?: string;
}
```

## Bug Fixes Applied

### Issue 1: AI Players Getting Stuck

**Problem**: AI would create partial melds that didn't meet round requirements, then couldn't discard because the server validates meld completion.

**Solution**: Two-part fix:

1. **Smart Meld Creation**: Only creates melds if ALL requirements can be met
2. **Fallback Cancel Logic**: Automatically cancels incomplete melds before discarding

### Issue 2: AI Not Continuing After Round Ends

**Problem**: AI players would not continue after round summary.

**Solution**: Special case handling for `roundSummary` phase with unique state signature to prevent duplicate continue requests.

### Issue 3: AI Helping Opponents with Discards

**Problem**: AI would discard cards that help opponents complete melds.

**Solution**: Smart discard analysis that:
- Checks if card can layoff on any opponent's melds
- Avoids discarding cards matching opponent's set ranks
- Avoids discarding cards that extend opponent's runs

## Configuration

### AI Settings

Configure in the AIManager or when spawning AI players:

```typescript
const aiConfig = {
  name: 'Alex-AI',
  difficulty: 'medium',
  decisionDelay: 1000  // Thinking time in ms
};
```

### AI Names

Default AI player names are defined in the AIManager:

```typescript
const AI_NAMES = ['Alex-AI', 'Jordan-AI', 'Taylor-AI'];
```

## Server Integration

The AI system integrates with the game through Socket.IO:

```typescript
// server/index.ts
import { AIManager } from './ai';

const aiManager = new AIManager(io, gameManager);

// When game starts with fewer than 4 players
aiManager.spawnAIPlayers(roomId, 4 - humanPlayerCount);
```

## Testing

Run the game with AI players:

```bash
npm start
```

Then:
1. Open browser to http://localhost:3000
2. Create a room
3. Click "Start Game"
4. AI players automatically join and play

## Future Improvements

Potential enhancements:
- Multiple difficulty levels (easy/medium/hard) - currently all personalities are competitive
- Opponent hand tracking and probability analysis
- Learning from player patterns
- Late round suit focusing for long runs (7-10 cards)
- "Going out speed" estimation after meeting requirements
