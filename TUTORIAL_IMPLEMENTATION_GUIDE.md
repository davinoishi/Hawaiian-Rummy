# Hawaiian Rummy - Interactive Tutorial Implementation Guide

## Current Status ✅

**Already Implemented:**
- ✅ Tutorial mode checkbox in room creation UI
- ✅ Client state management (`tutorialMode`, `tutorialStep`, `tutorialActive`)
- ✅ Server accepts and stores tutorial mode flag
- ✅ Dynamic button text based on tutorial mode

**Location of Changes:**
- `public/index.html` lines 562-564, 1111-1120, 2039-2063
- `server.js` line 294-321

---

## What Needs to Be Built

### 1. Tutorial Configuration (New File)
### 2. Tutorial Components (React Components in index.html)
### 3. Server-Side Tutorial Scenario (server.js additions)
### 4. Game Logic Integration (index.html modifications)
### 5. Tutorial Completion Flow

---

## 1. TUTORIAL CONFIGURATION

Create this configuration object in `index.html` before the main component:

```javascript
// Tutorial Steps Configuration
const TUTORIAL_STEPS = [
  {
    id: 0,
    title: 'Welcome to Hawaiian Rummy!',
    message: 'This tutorial will teach you how to play. Click Next to begin!',
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: false
  },
  {
    id: 1,
    title: 'Your Hand',
    message: 'These are your cards. You have 11 cards to start Round 1.',
    spotlight: 'hand',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 2,
    title: 'Sets and Runs',
    message: 'A SET is 3+ cards of the same rank (like 7♠ 7♥ 7♦). A RUN is 4+ consecutive cards of the same suit (like 5♠ 6♠ 7♠ 8♠).',
    spotlight: 'hand',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 3,
    title: 'Wildcards',
    message: 'Jokers and 2s are wildcards - they can substitute for any card! Look for the wild cards in your hand.',
    spotlight: 'hand',
    highlightWildcards: true,
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 4,
    title: 'Round Requirements',
    message: 'Round 1 requires: 2 sets of 3 cards each. You need to create these melds to meet the requirements.',
    spotlight: 'requirements',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 5,
    title: 'Draw a Card',
    message: 'Your turn starts by drawing a card. Click the deck to draw!',
    spotlight: 'deck',
    allowedActions: ['draw'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'cardDrawn'
  },
  {
    id: 6,
    title: 'Create Your First Set',
    message: 'You have the cards to make a set! Click these three 7s to select them: 7♠ 7♥ 7♦',
    spotlight: 'hand',
    highlightCards: ['7♠', '7♥', '7♦'],
    allowedActions: ['selectCard'],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 7,
    title: 'Create Meld Button',
    message: 'Now click "Create Set" to make your first meld!',
    spotlight: 'createMeldButton',
    allowedActions: ['createMeld'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'meldCreated'
  },
  {
    id: 8,
    title: 'Create Second Set',
    message: 'Great! Now create your second set with the 8s: 8♠ 8♥ 8♦',
    spotlight: 'hand',
    highlightCards: ['8♠', '8♥', '8♦'],
    allowedActions: ['selectCard', 'createMeld'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'requirementsMet'
  },
  {
    id: 9,
    title: 'Requirements Met! 🎉',
    message: 'Excellent! You\'ve met Round 1 requirements. Your melds are shown above your hand.',
    spotlight: 'myMelds',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 10,
    title: 'Discard a Card',
    message: 'End your turn by discarding a card you don\'t need. Click a card, then click "Discard".',
    spotlight: 'hand',
    allowedActions: ['selectCard', 'discard'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'cardDiscarded'
  },
  {
    id: 11,
    title: 'Opponent Turn',
    message: 'The AI player will now take their turn. Watch what happens!',
    spotlight: null,
    allowedActions: [],
    autoAdvance: true,
    showProgress: true,
    autoAdvanceDelay: 3000
  },
  {
    id: 12,
    title: 'Buying from Discard',
    message: 'When an opponent discards, you can BUY that card if you need it! But you\'ll also get a penalty card from the deck.',
    spotlight: 'discardPile',
    allowedActions: [],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 13,
    title: 'Your Turn Again',
    message: 'It\'s your turn! Draw a card to continue.',
    spotlight: 'deck',
    allowedActions: ['draw'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'cardDrawn'
  },
  {
    id: 14,
    title: 'Laying Off Cards',
    message: 'Once you\'ve met requirements, you can LAYOFF cards onto any player\'s melds. This reduces the points in your hand!',
    spotlight: 'layoffButton',
    allowedActions: ['layoff'],
    autoAdvance: false,
    showProgress: true
  },
  {
    id: 15,
    title: 'Going Out!',
    message: 'The goal is to meld ALL your cards to "go out" and win the round. Let\'s complete this round!',
    spotlight: 'hand',
    allowedActions: ['selectCard', 'createMeld', 'discard'],
    autoAdvance: true,
    showProgress: true,
    nextTrigger: 'roundWon'
  },
  {
    id: 16,
    title: 'Tutorial Complete! 🎉',
    message: 'Congratulations! You\'ve learned:\n\n✓ Creating sets and runs\n✓ Meeting round requirements\n✓ Buying from discard pile\n✓ Going out to win\n\nReady to play a real game?',
    spotlight: null,
    allowedActions: [],
    autoAdvance: false,
    showProgress: false,
    showCompletion: true
  }
];

// Tutorial Predetermined Scenario
const TUTORIAL_SCENARIO = {
  round: 0, // Round 1
  playerHand: [
    // First set (7s)
    { rank: '7', suit: '♠', id: 'tutorial-7s', isWild: false },
    { rank: '7', suit: '♥', id: 'tutorial-7h', isWild: false },
    { rank: '7', suit: '♦', id: 'tutorial-7d', isWild: false },
    // Second set (8s)
    { rank: '8', suit: '♠', id: 'tutorial-8s', isWild: false },
    { rank: '8', suit: '♥', id: 'tutorial-8h', isWild: false },
    { rank: '8', suit: '♦', id: 'tutorial-8d', isWild: false },
    // Extra cards for layoff/discard practice
    { rank: '5', suit: '♠', id: 'tutorial-5s', isWild: false },
    { rank: '6', suit: '♠', id: 'tutorial-6s', isWild: false },
    { rank: '9', suit: '♠', id: 'tutorial-9s', isWild: false },
    { rank: 'K', suit: '♥', id: 'tutorial-kh', isWild: false },
    { rank: 'JOKER', suit: '', id: 'tutorial-joker', isWild: true }
  ],
  deckCards: [
    // Card to draw on step 5
    { rank: '10', suit: '♠', id: 'tutorial-10s', isWild: false },
    // More cards for later draws
    { rank: '3', suit: '♣', id: 'tutorial-3c', isWild: false },
    { rank: 'Q', suit: '♦', id: 'tutorial-qd', isWild: false }
  ],
  aiActions: [
    // Step 11 - AI turn
    {
      step: 11,
      actions: [
        { type: 'draw', from: 'deck' },
        { type: 'discard', card: { rank: '5', suit: '♥', id: 'ai-5h' } }
      ]
    }
  ]
};
```

---

## 2. TUTORIAL COMPONENTS

Add these React components inside the main HawaiianRummyMultiplayer component:

```javascript
// Tutorial Overlay Component
const TutorialOverlay = ({ step, onNext, onSkip }) => {
  if (!tutorialActive || !TUTORIAL_STEPS[step]) return null;

  const currentStep = TUTORIAL_STEPS[step];

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-60 z-40 pointer-events-none" />

      {/* Tutorial message box */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 border-4 border-blue-500">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{currentStep.title}</h2>
              {currentStep.showProgress && (
                <p className="text-sm text-gray-500 mt-1">
                  Step {step} of {TUTORIAL_STEPS.length - 1}
                </p>
              )}
            </div>
            <button
              onClick={onSkip}
              className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
            >
              Skip Tutorial
            </button>
          </div>

          {/* Message */}
          <div className="mb-6">
            <p className="text-gray-700 whitespace-pre-line leading-relaxed">
              {currentStep.message}
            </p>
          </div>

          {/* Progress bar */}
          {currentStep.showProgress && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(step / (TUTORIAL_STEPS.length - 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {!currentStep.autoAdvance && (
              <button
                onClick={onNext}
                className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600 transition-colors"
              >
                {currentStep.showCompletion ? 'Play Real Game!' : 'Next →'}
              </button>
            )}
            {currentStep.autoAdvance && (
              <div className="flex-1 bg-gray-100 text-gray-500 px-6 py-3 rounded-xl font-semibold text-center">
                {currentStep.nextTrigger === 'cardDrawn' && 'Click the deck...'}
                {currentStep.nextTrigger === 'meldCreated' && 'Create the meld...'}
                {currentStep.nextTrigger === 'cardDiscarded' && 'Discard a card...'}
                {!currentStep.nextTrigger && 'Waiting...'}
              </div>
            )}
          </div>

          {/* Completion checkmarks */}
          {currentStep.showCompletion && (
            <div className="mt-6 space-y-2 text-left">
              <div className="flex items-center text-green-600">
                <span className="mr-2">✓</span>
                <span>Creating sets and runs</span>
              </div>
              <div className="flex items-center text-green-600">
                <span className="mr-2">✓</span>
                <span>Meeting round requirements</span>
              </div>
              <div className="flex items-center text-green-600">
                <span className="mr-2">✓</span>
                <span>Buying from discard pile</span>
              </div>
              <div className="flex items-center text-green-600">
                <span className="mr-2">✓</span>
                <span>Going out to win</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Tutorial Badge Component
const TutorialBadge = () => {
  if (!tutorialActive) return null;

  return (
    <div className="fixed top-4 right-4 z-30">
      <div className="bg-blue-500 text-white px-4 py-2 rounded-full font-bold shadow-lg">
        🎓 Tutorial Mode
      </div>
    </div>
  );
};

// Spotlight Effect Component
const TutorialSpotlight = ({ target }) => {
  if (!tutorialActive || !target) return null;

  const getSpotlightStyle = () => {
    switch (target) {
      case 'hand':
        return { bottom: '10px', left: '50%', transform: 'translateX(-50%)', width: '90%', height: '200px' };
      case 'deck':
        return { top: '50%', left: '30%', transform: 'translate(-50%, -50%)', width: '150px', height: '200px' };
      case 'discardPile':
        return { top: '50%', right: '30%', transform: 'translate(50%, -50%)', width: '150px', height: '200px' };
      case 'createMeldButton':
        return { bottom: '220px', left: '50%', transform: 'translateX(-50%)', width: '200px', height: '50px' };
      case 'requirements':
        return { top: '80px', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '60px' };
      default:
        return null;
    }
  };

  const style = getSpotlightStyle();
  if (!style) return null;

  return (
    <div
      className="fixed z-45 pointer-events-none"
      style={{
        ...style,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
        border: '3px solid #3B82F6',
        borderRadius: '12px',
        animation: 'pulse 2s infinite'
      }}
    />
  );
};
```

---

## 3. SERVER-SIDE TUTORIAL SCENARIO

Add to `server.js` after the `startGame` handler (around line 400):

```javascript
// Tutorial-specific game initialization
function initializeTutorialGame(roomId) {
  const gameState = games.get(roomId);

  console.log(`[Room ${roomId}] Initializing tutorial game`);

  // Use tutorial scenario instead of random deck
  gameState.playerHands = {
    [gameState.players[0]]: [...TUTORIAL_SCENARIO.playerHand]
  };

  gameState.deck = [...TUTORIAL_SCENARIO.deckCards];
  gameState.currentRound = 0; // Round 1
  gameState.tutorialStep = 0;

  // Don't add AI players for tutorial
  console.log(`[Room ${roomId}] Tutorial initialized with predetermined cards`);
}

// Modify startGame to check for tutorial mode
// Find the startGame handler and add this check at the beginning:
socket.on('startGame', () => {
  const roomId = socket.roomId;
  const gameState = games.get(roomId);

  if (gameState.tutorialMode) {
    initializeTutorialGame(roomId);
    gameState.gameStarted = true;
    gameState.currentPlayerIndex = 0;

    broadcastGameState(roomId);
    return;
  }

  // ... rest of existing startGame code
});
```

---

## 4. GAME LOGIC INTEGRATION

Add these functions to `index.html` in the main component:

```javascript
// Tutorial step management
const advanceTutorialStep = () => {
  if (!tutorialActive) return;

  const nextStep = tutorialStep + 1;
  if (nextStep < TUTORIAL_STEPS.length) {
    setTutorialStep(nextStep);

    // Auto-advance after delay if specified
    const step = TUTORIAL_STEPS[nextStep];
    if (step.autoAdvanceDelay) {
      setTimeout(() => {
        advanceTutorialStep();
      }, step.autoAdvanceDelay);
    }
  }
};

const skipTutorial = () => {
  setTutorialActive(false);
  setTutorialMode(false);
  setTutorialStep(0);
  // Optionally: return to lobby or start regular game
};

// Check if action is allowed in current tutorial step
const isTutorialActionAllowed = (action) => {
  if (!tutorialActive) return true;

  const currentStep = TUTORIAL_STEPS[tutorialStep];
  return currentStep.allowedActions.includes(action) || currentStep.allowedActions.length === 0;
};

// Trigger tutorial advancement on game events
useEffect(() => {
  if (!tutorialActive) return;

  const currentStep = TUTORIAL_STEPS[tutorialStep];

  // Check for auto-advance triggers
  if (currentStep.autoAdvance && currentStep.nextTrigger) {
    // These will be called from existing game event handlers
    // Example: when card is drawn, call checkTutorialTrigger('cardDrawn')
  }
}, [gameState, tutorialStep, tutorialActive]);

const checkTutorialTrigger = (trigger) => {
  if (!tutorialActive) return;

  const currentStep = TUTORIAL_STEPS[tutorialStep];
  if (currentStep.nextTrigger === trigger && currentStep.autoAdvance) {
    advanceTutorialStep();
  }
};
```

Add to existing game action handlers:

```javascript
// In drawCard function, add:
const drawCard = () => {
  if (!isTutorialActionAllowed('draw')) return;

  socket.emit('drawCard');

  // Tutorial trigger
  checkTutorialTrigger('cardDrawn');
};

// In createMeld function, add:
const createMeld = () => {
  if (!isTutorialActionAllowed('createMeld')) return;

  // ... existing code ...

  // Tutorial trigger
  checkTutorialTrigger('meldCreated');

  // Check if requirements met
  if (gameState?.hasMetRequirements) {
    checkTutorialTrigger('requirementsMet');
  }
};

// In discard function, add:
const discardCard = (cardId) => {
  if (!isTutorialActionAllowed('discard')) return;

  // ... existing code ...

  // Tutorial trigger
  checkTutorialTrigger('cardDiscarded');
};
```

---

## 5. RENDERING TUTORIAL COMPONENTS

Add to the return statement of HawaiianRummyMultiplayer component:

```javascript
return (
  <div className="min-h-screen bg-gradient-to-br from-orange-100 via-pink-50 to-purple-100">
    {/* Existing game UI */}
    {/* ... all existing content ... */}

    {/* Tutorial Components */}
    {tutorialActive && (
      <>
        <TutorialBadge />
        <TutorialSpotlight
          target={TUTORIAL_STEPS[tutorialStep]?.spotlight}
        />
        <TutorialOverlay
          step={tutorialStep}
          onNext={advanceTutorialStep}
          onSkip={skipTutorial}
        />
      </>
    )}
  </div>
);
```

---

## 6. STYLING

Add to the `<style>` section:

```css
@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6),
                0 0 20px rgba(59, 130, 246, 0.8);
  }
  50% {
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6),
                0 0 40px rgba(59, 130, 246, 1);
  }
}

.tutorial-highlight {
  animation: pulse 2s infinite;
  position: relative;
  z-index: 45;
}
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Configuration (30 min)
- [ ] Add TUTORIAL_STEPS configuration
- [ ] Add TUTORIAL_SCENARIO configuration
- [ ] Test configuration loads without errors

### Phase 2: Components (1 hour)
- [ ] Create TutorialOverlay component
- [ ] Create TutorialBadge component
- [ ] Create TutorialSpotlight component
- [ ] Test components render correctly

### Phase 3: Server Integration (30 min)
- [ ] Add initializeTutorialGame function
- [ ] Modify startGame handler
- [ ] Test tutorial game starts with predetermined cards

### Phase 4: Game Logic (1.5 hours)
- [ ] Add tutorial step management functions
- [ ] Integrate action permission checks
- [ ] Add trigger checks to game handlers
- [ ] Test step progression

### Phase 5: Polish (1 hour)
- [ ] Add animations
- [ ] Mobile responsiveness
- [ ] Edge case handling
- [ ] Full playthrough test

---

## TESTING GUIDE

1. **Basic Flow Test:**
   - Check tutorial checkbox
   - Create room
   - Verify tutorial badge appears
   - Verify Step 0 message shows

2. **Step Progression:**
   - Click through non-interactive steps
   - Verify auto-advance steps work
   - Test spotlight highlights correct elements

3. **Game Actions:**
   - Verify only allowed actions are enabled
   - Test draw → meld → discard flow
   - Verify triggers advance tutorial

4. **Completion:**
   - Complete all steps
   - Verify completion screen
   - Test "Play Real Game" button

---

## FUTURE ENHANCEMENTS

- [ ] Save tutorial completion to localStorage
- [ ] Add "Replay Tutorial" from menu
- [ ] Localization support
- [ ] Alternative tutorial paths
- [ ] Hint system for stuck players
- [ ] Tutorial analytics

---

## TROUBLESHOOTING

**Tutorial doesn't start:**
- Check tutorialMode is true in room creation
- Verify lobbyUpdate includes tutorialMode flag
- Check browser console for errors

**Steps don't advance:**
- Verify trigger names match exactly
- Check allowedActions array
- Use console.log in checkTutorialTrigger

**Spotlight doesn't show:**
- Check target element exists in DOM
- Verify z-index values
- Test getSpotlightStyle returns valid style

**Actions blocked incorrectly:**
- Check isTutorialActionAllowed logic
- Verify allowedActions includes needed action
- Test with tutorialActive = false

---

## ESTIMATED COMPLETION TIME

- Experienced developer: 4-5 hours
- With this guide: 3-4 hours
- In dedicated session: Can be done in one sitting

## CURRENT FILES MODIFIED

- ✅ `public/index.html` - Checkbox and state (DONE)
- ✅ `server.js` - Accept tutorial parameter (DONE)
- ⏳ `public/index.html` - Components and logic (PENDING)
- ⏳ `server.js` - Tutorial scenario (PENDING)

---

Good luck with implementation! This guide should give you everything needed to complete the tutorial system.
