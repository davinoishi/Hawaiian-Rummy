# Hawaiian Rummy - Tutorial System Documentation

> **Note**: This document describes the tutorial system implementation. As of v2.0.0, the tutorial has been migrated to the new TypeScript architecture.

## Current Implementation

The tutorial system is implemented in the React client with the following components:

### Client Components

Located in `client/src/`:

- **`store/tutorial-store.ts`**: Zustand store managing tutorial state
  - `tutorialActive`: Whether tutorial mode is enabled
  - `currentStep`: Current step index
  - `isActionAllowed()`: Check if an action is permitted
  - `advanceStep()`: Progress to next step

- **`components/ui/TutorialOverlay.tsx`**: Visual tutorial overlay
  - Step-by-step instructions
  - Visual spotlights on relevant UI elements
  - Progress indicator
  - Skip tutorial option

### Tutorial Flow

1. **Start**: User enables tutorial mode from join screen
2. **Guided Steps**: Tutorial walks through:
   - Drawing cards
   - Creating sets and runs
   - Understanding wildcards
   - Meeting round requirements
   - Laying off cards
   - Discarding
   - Buying from discard pile
3. **Completion**: Tutorial ends with summary of learned concepts

### Tutorial Steps Configuration

The tutorial is configured with steps that include:

```typescript
interface TutorialStep {
  id: number;
  title: string;
  message: string;
  spotlight?: string;        // Element to highlight
  allowedActions: string[];  // Actions user can perform
  autoAdvance: boolean;      // Auto-advance on action completion
  nextTrigger?: string;      // Event that triggers advancement
}
```

### Key Tutorial Steps

| Step | Title | Action |
|------|-------|--------|
| 0 | Welcome | Introduction |
| 1 | Your Hand | Show player's cards |
| 2 | Sets and Runs | Explain meld types |
| 3 | Wildcards | Highlight 2s and Jokers |
| 4 | Round Requirements | Show current round goal |
| 5 | Draw a Card | Practice drawing |
| 6-8 | Create Melds | Practice creating sets |
| 9 | Requirements Met | Celebrate meeting requirements |
| 10 | Discard | Practice discarding |
| 11-13 | Buying & Layoff | Advanced mechanics |
| 14 | Tutorial Complete | Summary and exit |

## Integration with Game Logic

The tutorial integrates with game actions through hooks:

```typescript
// In usePlayerActions.ts
const createMeld = useCallback((type, wildcardPositions) => {
  if (tutorialActive && !isActionAllowed('createMeld')) {
    return;
  }

  // ... perform action ...

  if (tutorialActive && currentStepData?.nextTrigger === 'meldCreated') {
    advanceStep();
  }
}, [/* deps */]);
```

## Server-Side Support

The server accepts tutorial mode flag in room creation:

```typescript
// In server/socket-handlers/room-handler.ts
socket.on('createRoom', (data) => {
  const room = {
    ...roomData,
    tutorialMode: data.tutorialMode || false
  };
});
```

## Styling

Tutorial elements use Tailwind CSS classes:

- Spotlight: `ring-4 ring-blue-500 ring-opacity-50`
- Overlay: `fixed inset-0 bg-black/60 z-40`
- Message box: `bg-white rounded-2xl shadow-2xl p-6`

## Testing the Tutorial

1. Start the game: `npm start`
2. Open http://localhost:3000
3. Check "Tutorial Mode" before creating a room
4. Follow the guided steps

## Customization

To modify tutorial steps, edit `client/src/store/tutorial-store.ts`:

```typescript
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 0,
    title: 'Welcome to Hawaiian Rummy!',
    message: 'This tutorial will teach you how to play.',
    // ... configuration
  },
  // ... more steps
];
```

## Future Enhancements

- [ ] Save tutorial completion to localStorage
- [ ] Add "Replay Tutorial" from settings menu
- [ ] Localization support for multiple languages
- [ ] Adaptive difficulty based on user performance
- [ ] Video clips for complex mechanics
