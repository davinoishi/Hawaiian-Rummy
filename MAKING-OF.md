# Making of Hawaiian Rummy

The running story of this project — what got decided, what got tested, and what turned
out to be wrong. Appended to after every session. Newest session at the bottom.

The point of this file is the wrong turns. Anyone can read README.md and see where
things landed; this is the record of how, so a decision doesn't get re-litigated in six
months because nobody remembers why it went the way it did.

---

## Session 1 — 2026-08-26 — Review, and the "table never stalls" fixes

First session after a ~3 month gap. Last real code change was the v2.5.0 tournament
system (`bbadf9c`); the two commits after it were README link edits.

### Starting health check (verified)

- `cd client && npx tsc --noEmit` — clean.
- `./node_modules/.bin/tsc -p tsconfig.server.json --noEmit` — **one pre-existing error**,
  `server/tournament-manager.ts(665,7): TS2322: Type 'string | null' is not assignable
  to type 'string | undefined'`. Confirmed pre-existing by stashing all changes and
  re-running. This means `npm run build` is currently broken. `npm start` works anyway
  because it runs through `tsx`, which does not typecheck. **Not fixed this session** —
  out of scope, flagged for later.
- `npm run client:build` reproduced the exact committed bundle hashes
  (`index-C6laJOal.js`, `index-0_szPen-.css`), so `public/` was genuinely in sync with
  `client/src`. Worth knowing: the committed bundle is trustworthy, not stale.
- No tests exist anywhere in the repo. No lint in CI (`.github/` has only Dependabot).

### Roadmap reality check

README's "Future Enhancements" was stale in both directions:

| Listed item | Actual |
|---|---|
| Saved games / resume **for offline mode** | Save/resume exists (single-player, via profiles). Offline mode itself was *deleted* in v2.4.0, so the line describes something that can't exist. |
| Tournament mode | Shipped in v2.5.0. Still listed as future. |
| Custom game rules configuration | Not started. |
| Enhanced AI difficulty levels | Partial — 4 personalities, no difficulty selector. |
| Mobile app version | Not started (PWA manifest + SW present). |

Other drift found: both `package.json`s say `2.0.0` while the game is v2.5.0; CHANGELOG
has no v2.5.0 entry; `AI_IMPLEMENTATION.md` names the AIs Alex/Jordan/Taylor when
`constants.ts` says 🥭 Mango / 🍍 Pineapple / 🥥 Coconut / 🧃 Papaya; README claims the
settings panel has a haptics toggle and that action buttons have tooltips — neither is
true. **None of this was fixed this session**; it's queued behind the gameplay work.

### The plan we picked

A usability review turned up 18 items. Agreed order:

1. **Group 1+2 — "the table never stalls"** (this session): idle-turn timer,
   server-driven buy-window expiry, pinned buy prompt.
2. Group 3+5+6 — mobile card reordering, sticky sort, dead sort state.
3. Group 7+9+10+11+12+13 — requirement progress, disabled-button reasons, the `M`
   shortcut bug, light-theme MeldArea, haptics toggle, discard pile count.

### What shipped this session

**1. Idle-turn timer (`TURN_IDLE_TIMEOUT = 120000`).**

The bug: `server/index.ts`'s periodic check only skipped turns for *disconnected*
players. A player who stayed connected but walked away stalled the table forever.
Disconnect had a 45s grace period and AI takeover; idle had nothing at all.

Design decisions worth recording:

- **Auto-play the turn, don't skip it.** The disconnect path calls
  `advanceToNextActivePlayer()`, which skips the turn outright. Copying that for idle
  players would have been less code, but it leaves hand sizes wrong — the player never
  draws. Instead `autoPlayIdleTurn()` plays the minimum legal turn: draw, then discard.
- **Discard the highest-point non-wild card.** Trims the most points off the idle
  player's round score without throwing away a wildcard they'll want when they return.
- **Cancel incomplete melds first.** `canDiscard()` in `discard-action.ts` refuses a
  discard while a player has melds down that don't meet the round requirement, so the
  auto-play would have failed silently without this.
- **Only enforce the clock when 2+ humans are connected.** A solo player against AI can
  take as long as they like — nobody is waiting on them. This is `connectedHumans.length
  < 2` in `isIdleTimerApplicable()`. Also skipped for tutorial mode, AI turns, and
  already-disconnected players.
- **`syncTurnClock()` rather than resetting the clock at every call site.** The turn
  advances through at least four paths (normal discard, disconnect skip, AI takeover,
  new round). Rather than remembering to reset in each, the server tick compares
  `currentPlayerIndex` against `room.turnClockPlayerIndex` and restarts the clock on a
  change. Within-turn activity resets it too, via `GameManager.processAction()`.

**2. Server-driven buy-window expiry.**

The bug: `isBuyWindowActive()` is computed on read from `lastDiscardTimestamp`. Nothing
re-broadcast when the 5-second window closed, so clients kept a stale
`buyWindowActive: true` until the next action. The "Buy this card?" panel sat on screen
at 0s doing nothing.

The client had been papering over this with **two separate local timers** —
`usePlayerActions.ts` and `DiscardPile.tsx` — which initialised `localBuyWindowExpired`
to *opposite* values (`true` vs `false`). Both are now deleted; the server broadcasts
once per discard when the window closes, and `canTakeDiscard` is authoritative again.

Consolidated all of this into one commented room tick in `server/index.ts` handling
(1) disconnect skip, (2) buy-window expiry, (3) idle auto-play.

**3. Buy prompt pinned to the viewport.**

`GameBoard.tsx` rendered `<BuyActions/>` *in the page flow*, between the deck row and
the hand. On a phone in round 10 with 15 cards, that is plausibly scrolled off-screen
for the entire 5-second life of the prompt. Now `fixed inset-x-0 bottom-0 z-40` with
`pointer-events-none` on the wrapper so it doesn't eat taps on the board behind it.
`BuyActions` also now returns `null` once its local countdown hits 0, so the panel
disappears instantly rather than waiting up to 1s for the server broadcast.

**Incidental, forced by the change:** `shouldSkipBuyWindow()` logged three lines every
time it ran, and it runs twice per player per broadcast. The new 1Hz tick would have
made that catastrophic, so the logging came out. A 50-second 4-player session now
produces 164 log lines total.

### Wrong turns

**WRONG THEORY: "the idle timer isn't firing, the guard must be broken."**
First run of the idle test showed `turnTimeRemaining=0` and no auto-play. Spent time
suspecting `isIdleTimerApplicable()`. Added a `[TICKDEBUG]` line to the tick and the
actual state was:

```
players=[0DOsQkvYWgmyMmHbAAAB, ai-WW7TZ7-2, ai-WW7TZ7-1, ai-WW7TZ7-0]
```

Only **one** human in the room. The guard was correct; the *test* was wrong. The test
had used `a.emit('createRoom', { playerName: 'Ann' })` and
`b.emit('joinRoom', {...})`, but the real signatures are positional
`createRoom(playerName, tutorialMode, ...)` and the join event is `joinGame`, not
`joinRoom` (`server/socket-handlers/room-handler.ts:106,187`). Bob never joined; the
room filled with 3 AI. Lesson: check the actual `socket.on(...)` signatures before
writing a harness against them — the client wrappers hide the shape.

**Nearly shipped a bug:** the first version reset the idle clock only inside
`processAction()`. But `advanceToNextActivePlayer()` doesn't go through
`processAction()`, so after a disconnect-skip or an idle-skip the *next* player would
have inherited an already-expired clock and been auto-played instantly. That's what
`syncTurnClock()` exists to prevent. Caught by reasoning through the paths, **not** by a
test — no test covers the skip-then-next-player sequence.

### Verification (all actually run, against a live server on :3001)

Driven by two throwaway socket.io harnesses (not committed — they live in the session
scratchpad).

- **Buy-window expiry**, production settings: `buy window OPENED (remaining=5)` then
  `buy window CLOSED via unprompted broadcast, +5446ms  canTakeDiscard=false`. No client
  action was sent between the two. Before this change no such broadcast existed at all.
- **Idle auto-play**, with `TURN_IDLE_TIMEOUT` temporarily lowered to `8000` and the
  server restarted:
  ```
  03:03:25 Ann's turn began. hand=9 turnTimeRemaining=8s phase=draw
  03:03:25 >>> sending NO actions; expecting server auto-play
  03:03:34 Ann NOTIF: ⏱ Ann ran out of time - auto-discarded A♥
  03:03:34 Bob NOTIF: ⏱ Ann ran out of time - auto-discarded A♥
  03:03:41 after idle: Ann isMyTurn=false hand=9 (was 9)
  ```
  Drew one, discarded the highest non-wild (A♥, 15pts), turn passed, both clients
  notified. Hand back to 9 confirms draw+discard rather than a skip.
- **No premature auto-play**: 50-second session at the restored 120s timeout produced
  `0` occurrences of "Auto-played idle turn".
- **Log spam gone**: `0` occurrences of `[BUY WINDOW]`.
- Constant restored to `120000` and the debug line removed before committing — both
  greps confirmed at `0` / `120000`.

**Assumed, not verified:** none of the visual changes were checked in a real browser.
The pinned buy prompt, the red pulsing turn countdown in `RoundInfo`, and the discard
pile count are typecheck-clean and built, but nobody has looked at them on a phone.

### Notes for next session

- Group 3+5+6 is next: mobile touch reorder (`PlayerHand.tsx` passes an empty `onDrop`
  to `handleTouchEnd` — touch drag literally goes nowhere), sticky sort preference, and
  the dead `sortMode` `useMemo` that always returns `'none'`.
- `tournament-manager.ts:665` still breaks `npm run build`. One line. Worth doing.
- The idle timeout is deliberately generous (2 min) and only applies with 2+ humans. If
  real games feel slow, that's the knob — `TURN_IDLE_TIMEOUT` in
  `shared/game-engine/constants.ts`.

---

## Session 2 — 2026-08-26 — Mobile hand handling, and a bug I shipped last session

Second half of the same working day. Goal: the pre-existing `npm run build` failure,
then group 3+5+6 from session 1's plan — mobile card reordering, sticky sort, and the
dead sort state.

### Correction to session 1

**The idle clock reset was wrong.** Session 1 put `room.turnActivityAt = Date.now()` on
*every* successful action in `GameManager.processAction()`, with the comment "any
successful action means the table is moving". That is not what the clock measures. It
measures whether *the player we are waiting on* is still there. `REORDER_HAND` is
allowed at any time by any player (`game-state.ts:289` returns `{ valid: true }`
unconditionally), so an opponent idly sorting their own hand — or the sticky sort added
*this* session, which reorders automatically on every hand change — would have kept
resetting the current player's idle clock and defeated the timeout entirely.

Fixed by capturing whether the acting player was the current player *before* running the
action (the action may advance the turn) and only resetting the clock then:

```ts
const actingPlayerWasCurrent = room.state.players[room.state.currentPlayerIndex] === action.playerId;
```

Worth noting the shape of this mistake: the session 1 feature was verified working, and
it *was* working — against the tests written for it. The hole only appeared when a later
feature started emitting a common action from a non-current player. Nothing caught it
but re-reading the code while adding that feature.

### The build fix

`server/tournament-manager.ts:665`. `let roomId = tournament.activeRoomId` is
`string | undefined` (`activeRoomId?: string` in `shared/tournament-types.ts:102`), but
`createTournamentGameRoom()` returns `string | null`. Narrowed through a local instead of
assigning straight back. `npm run build` now succeeds; it had been failing since before
session 1, hidden because `npm start` runs through `tsx`, which does not typecheck.

### What shipped

**One sort implementation instead of three.** The suit-sort logic was written out
separately in `PlayerHand`'s `sortedHand` memo, in `PlayerHand`'s `handleSort`, and again
in `useKeyboardShortcuts.handleSortBySuit`. Now `sortHand(cards, mode)` in
`shared/game-engine/card-utils.ts` and everything calls it.

**The dead sort state is gone.** `PlayerHand` had:

```tsx
const [sortMode, setSortMode] = useMemo(() => {
  const state = useUIStore.getState();          // assigned, never read
  const getSortMode = (): SortMode => 'none';   // always 'none'
  const setSortMode = (mode: SortMode) => {};   // no-op
  return [getSortMode(), setSortMode] as const;
}, []);
```

`sortMode` was hardcoded `'none'`, so the whole `sortedHand` memo below it was dead and
the component always rendered `myHand` directly. The sort buttons only worked because
`handleSort` bypassed all of it and emitted `reorderHand` to the server.

**Sort is now sticky.** `handSortMode` lives in `settings-store` and persists to
localStorage alongside sound and theme. An effect re-applies it whenever the hand
changes, so a new deal, a draw, or a won buy all land already ordered. Buttons toggle
(clicking the active mode returns to manual), and an "auto-sorting" label shows when a
mode is on. `sortHand` is idempotent, which is what stops the effect from looping — once
the server echoes the sorted order back, the order already matches and nothing is
emitted.

**Mobile card reordering actually works now.** `PlayerHand` was passing an empty
callback into `handleTouchEnd`:

```tsx
(x, y) => {
  // Handle touch drop - would need to detect target element
}
```

Touch drag started, tracked the finger, and dropped nowhere. Now card wrappers carry
`data-card-id`, and `cardIdAtPoint()` in `useCardSelection` resolves the drop target with
`document.elementFromPoint(...).closest('[data-card-id]')`. Added a drag ghost that
follows the finger (`pointer-events-none`, or it would shadow the card underneath and
break the hit test) and a drop indicator on the hovered card.

Gesture change: a drag now starts only on a *predominantly horizontal* swipe
(`deltaX > 20 && deltaX > deltaY`) and cards carry `touch-action: pan-y`, so a vertical
swipe still scrolls the page. That matters because the hand fills the bottom third of a
phone screen; the old `deltaX > 20 || deltaY > 20` would have captured scroll attempts.

### Wrong turns

**WRONG THEORY: "the touch handlers never fire — React must not be seeing the events."**
A probe on `document` showed touchstart plus 12 touchmove events arriving, but a
`console.log` inside `handleTouchStart` printed nothing, and a mouse click on a card did
nothing either. Spent time suspecting React's synthetic event system and the service
worker. The actual reason was much dumber: **it was not the player's turn**, so
`isDisabled` was true, and the test never waited for one. Once the harness waited on
`document.body.innerText.includes('Your Turn')`, every handler fired immediately. Lesson:
when a UI does nothing, check the app's own state gates before suspecting the framework.

**The real blocker was the chat button, and only the hit test found it.** With the drag
finally running (`isDragging: true`, ghost on screen, deltas up to 260px), the drop still
did nothing. Hit-testing the finger position mid-drag returned:

```
{"ghostOnScreen":true,"top":"BUTTON.relative flex items-center gap-2 px-4 py-2 rounded","resolvedCardId":null}
```

`ChatPanel` is `fixed bottom-4 right-4 z-50`. On a 393×727 phone viewport that lands at
roughly y 671–711, directly on top of the hand row at y 682. **The floating chat button
has been sitting on top of the player's cards on every phone**, swallowing taps as well
as drops — a pre-existing bug nobody had reported, found only because the drop needed a
target. Fixed by hiding the FAB below `sm:` and docking a chat toggle (with the unread
badge) into the `RoundInfo` header next to Help and Settings. Desktop keeps the FAB;
verified at 1280×900 that the FAB is `display: flex` and the header button is hidden.

Note this is inherent, not incidental: a `position: fixed` button over a scrolling page
will overlap *something* at some scroll offset. Moving it into the header was the fix,
not nudging its offset.

**`e.preventDefault()` in the touchmove handler has been dead code all along.** The
browser console during a drag:

```
Unable to preventDefault inside passive event listener invocation.   (×7)
```

React attaches `touchmove` at the root as a passive listener, so the call has never
suppressed anything. Removed it; `touch-action: pan-y` is what actually governs
scrolling. The pre-existing code had been relying on a no-op.

**WRONG THEORY: "the blank page means the app crashed."** One verification run came back
with an empty `document.body.innerText` and no hand. No page error was logged and the
server was healthy (`curl` returned 200, assets present on disk). The cause was the
**service worker** serving a cached `index.html` pointing at a bundle hash that a rebuild
had just deleted — Vite's `emptyOutDir: true` removes the old `public/assets/*` on every
build, and I had rebuilt three times mid-test. Running the browser context with
`serviceWorkers: 'block'` made the runs deterministic. Not proven to affect real
deploys (navigation is network-first in `public/sw.js:68`), so **assumed benign in
production** — but `CACHE_NAME` is a permanent `'hawaiian-rummy-v1'` that never rotates,
which is worth a look sometime.

### Verification (all actually run)

`sortHand` unit check via `tsx`, on a 9-card hand containing a Joker and a wild 2:

```
original : K♦ 🃏 3♠ A♥ 2♣ 7♠ 10♥ 3♦ Q♠
rank     : 🃏 A♥ 2♣ 3♠ 3♦ 7♠ 10♥ Q♠ K♦   idempotent=true preservesAllCards=true 9/9
suit     : 3♠ 7♠ Q♠ A♥ 10♥ 3♦ K♦ 🃏 2♣   idempotent=true preservesAllCards=true 9/9
none     : unchanged=true
```

`preservesAllCards` is the one that matters — a sort that dropped a card would silently
corrupt a hand.

Real browser, Chromium via Playwright emulating a Pixel 5 (393×727, touch), driving an
actual game against AI, touch events dispatched over CDP `Input.dispatchTouchEvent`:

```
=== 1. mobile touch drag reorder ===
  moved 2♥2: index 0 -> 5   reordered=true  noCardsLost=true
=== 2. chat button no longer covers the hand ===
  cards obstructed at their centre: 0 of 6 on-screen
  header chat button (phones): true
  floating chat FAB computed display on phone: none
=== 3. sticky sort ===
  sorted hand: 🃏 2♥ 2♥ 5♣ 6♠ 9♥ 9♦ 10♥ Q♥
  persisted: {"soundEnabled":true,"soundVolume":0.5,"themeMode":"dark","handSortMode":"rank"}
  indicator shown: true
  order stable over 4s (no reorder loop): true
=== 4. sticky across sessions ===
  localStorage handSortMode after reload: rank
```

Desktop regression check at 1280×900: FAB `display: flex`, header chat button hidden,
mouse drag reordered the hand with no card loss.

Both typechecks clean; `npm run build` and `npm run client:build` both succeed.

An earlier obstruction check reported "3 of 9 cards obstructed" and was **wrong** — those
three were at y=758 on a 727px viewport, i.e. below the fold, where `elementFromPoint`
returns null. The check now only considers cards inside the viewport.

### Found but not fixed

- **The deck/discard hint labels are covered on mobile.** "Click to draw" and "Click to
  take" are positioned `absolute -bottom-6`, which puts them underneath the
  `panel p-4 mt-auto` player section on a phone. Playwright refused to click one:
  `<div class="panel p-4 mt-auto">…</div> intercepts pointer events`. The deck itself is
  still clickable, so this is cosmetic — the hint is just unreadable/untappable.
- `public/sw.js` `CACHE_NAME` never rotates.

### Notes for next session

Group 7+9+10+11+12+13 is next, and three of those are now better understood:

- #7 requirement progress: `getMeldsNeeded()` (`validation/requirements.ts:97`) is still
  written and still unused.
- #10 the `M` auto-meld shortcut maps 3 cards → set, 4+ → run, which is wrong for
  round 7's "3 sets of 4". Detect by rank equality, not count.
- #12 haptics toggle: the preference already exists in `useHaptics.ts` localStorage under
  `hawaiianRummy_haptics`; `settings-store` now has the pattern to follow for it.

### Session 2 addendum — verifying the part I had only argued for

On review, the session 2 verification above covered the sort *button* but not the actual
claim behind item #5: that **a deal and a draw come up already ordered**. That is the
whole point of a sticky sort, and it had been reasoned about, not measured. Tested it
properly, on a Pixel 5 profile with `handSortMode: 'rank'` seeded into localStorage
before the first page load, i.e. a returning player:

```
=== A. first deal, preference restored from localStorage, no button pressed ===
  ranks: A 2 3 4 4 7 7 Q Q       DEAL ARRIVES SORTED: true
  auto-sorting indicator: true   Sort by Rank shown active: true
=== B. draw a card ===
  before draw: A 2 3 4 4 7 7 Q Q     sorted=true
  after draw : A 2 3 4 4 6 7 7 Q Q   sorted=true
  drew 6♥ -> landed at index 5 of 10 (inserted, not appended)
```

**WRONG RESULT, and it was the test's fault, not the product's.** The first run of test B
reported `DRAW LANDED SORTED: false`. The drawn card was a Joker and the hand read
`Joker 2 3 4 4 6 J Q Q K` — which is correct, since `sortCardsByRank` gives Joker a rank
value of 0. The harness scored it wrong: its rank regex was `/^(10|[AJQK2-9]|Joker)/`,
and regex alternation is first-match-wins, so `"Joker0"` matched the `J` branch and was
counted as a Jack (11) sitting in position 0. Reordering the alternation to
`/^(Joker|10|[AJQK2-9])/` fixed it. Worth writing down because the failure looked exactly
like a real product bug and would have been easy to "fix" in the wrong place.

Also found while checking for leftovers: **`npm run lint` in `client/` does not work at
all** — `ESLint couldn't find a configuration file`. The script is in `package.json` with
`--max-warnings 0`, but no eslint config has ever existed in the repo. So the "no lint in
CI" note from session 1 is worse than recorded: there is no lint locally either.

`sortCardsBySuit()` in `card-utils.ts` has zero callers. It was already dead before this
session (the old code hand-rolled its own suit grouping rather than calling it); left in
place rather than widening this change.
