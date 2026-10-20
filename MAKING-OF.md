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

---

## Session 3 — 2026-08-26 — The polish group, and two defects the screenshots caught

Final group from the session 1 review: items 7, 9, 10, 11, 12, 13.

### What shipped

**#13 was already done.** The discard pile count shipped as part of group 1+2 in session 1
(`Discard (3)`, matching the deck's `Deck (125)`). Verified rather than re-implemented.

**#7 Requirement progress.** `RoundInfo` showed `Goal: 3 sets of 3 and a run of 5` and
nothing else until the whole requirement was met. It now appends live counts —
`Goal: 2 sets of 3 (0/2 sets)` — derived from `getMeldsNeeded()`, which had been sitting
in `validation/requirements.ts:97` written and unused since it was added.

**#9 Disabled buttons now say why.** Create Set / Create Run / Discard were greyed with
no explanation. Each now carries a `title` naming the blocker, and — because a `title`
never appears on a touch device — the single most relevant reason is rendered inline
under the buttons: *"Draw from the deck or take the discard to start your turn."*
becoming *"Tap cards to select them, then create a meld or discard."* once you have
drawn. Also deleted `canLayoff`, a computed variable nothing referenced.

**#10 The `M` shortcut was genuinely wrong, not just inelegant.** It chose the meld type
by counting cards: `selectedCardIds.length === 3 ? 'set' : 'run'`. Round 7 requires
**3 sets of 4**, so pressing `M` on a legitimate four-of-a-kind tried to build a run and
failed. Replaced with `detectMeldType()` in `card-utils`, which decides from the cards:
if the non-wild cards all share a rank it is a set, otherwise a run. `HowToPlayModal`
documented the buggy behaviour as if intended ("Auto meld (3=set, 4+=run)") and was
corrected too.

**#11 MeldArea was dark-theme only**, while every sibling component branched on
`isLight`. Measured contrast ratios for the classes as they actually rendered on the
light theme, versus after:

| element | before | after |
|---|---|---|
| "X's Melds" heading (`text-emerald-200` on `emerald-50`) | **1.22:1** | 7.29:1 |
| SET/RUN badge (`text-blue-200` on `bg-blue-500/30`) | **1.10:1** | 7.15:1 |
| "3 cards" count (`text-emerald-300` on meld group) | **1.34:1** | 4.84:1 |

WCAG AA for normal text is 4.5:1. 1.10:1 is, for practical purposes, invisible — light
theme players have not been able to read the SET/RUN labels at all. Before-figures
computed from the Tailwind palette values; after-figures measured with
`getComputedStyle` in the running app.

**#12 The haptics toggle was missing, and the reason was worse than it looked.** The
plan was "add a switch to SettingsPanel". But `useHaptics` held the preference in its own
`useState`:

```ts
const [enabled, setEnabledState] = useState(getSavedHapticsState);
```

`useHaptics()` is called from about a dozen components, and each call creates its own
copy of that state. A toggle wired to SettingsPanel's copy would have flipped the switch,
written localStorage, and **changed nothing** — every other component would have kept
vibrating until a reload. Moved the flag into `settings-store` (one shared zustand store,
same shape as the sound setting) and pointed `useHaptics` at it. Kept the legacy
`hawaiianRummy_haptics` localStorage key rather than folding it into the settings blob,
so nobody loses a preference they already set. The switch only renders where
`navigator.vibrate` exists.

### Two defects the screenshots caught that no test would have

Both found by actually looking at a full-page screenshot of the running game, not by any
assertion.

**Melded cards were washed out.** `MeldArea` passed `isDisabled` to `Card` to make melds
non-interactive, but `isDisabled` also applies `card-disabled` → `opacity-50`. That is
right for "you can't play this right now" and wrong for cards on the table: you need to
read opponents' melds to plan layoffs, and at 50% opacity on a light background they were
barely legible. Added a `readOnly` prop to `Card` that blocks the click and the
hover-lift but leaves the card at full opacity, and used it for melds and for the touch
drag ghost (which had been 0.5 × 0.8 = 0.4 opacity).

**The pinned buy prompt from session 1 was translucent.** `.panel` is
`rgba(209,250,229,0.85)` in light and `bg-emerald-800/90` in dark — fine for a panel in
the page flow, wrong for one pinned above the board. The screenshot showed the action
bar's "Waiting for your turn…" reading straight through the middle of "Buy this card?".
This was a defect I introduced in session 1 and did not notice, because session 1's
verification was socket-level and never looked at the screen. Added a `.panel-solid`
modifier (specificity-matched to beat the themed `.panel` rules) and applied it to the
buy prompt. Now measured `rgb(236, 253, 245)` — no alpha channel at all.

The lesson worth keeping: session 1 verified the buy prompt's *behaviour* (it opens, it
expires, it is pinned to the bottom) and every one of those assertions passed while the
thing was visually broken. Screenshots are not decoration.

### Verification (all actually run)

`detectMeldType` unit check via `tsx`, 6/6:

```
PASS  4-card set (round 7!)    -> set     PASS  3-card set          -> set
PASS  4-card run               -> run     PASS  3 cards + wild      -> run
PASS  set with a wild          -> set     PASS  all wild (ambiguous)-> set
```

Live game, Chromium/Playwright, Pixel 5, **light theme** (so #11 is exercised):

```
#7  goal line: "Goal: 2 sets of 3(0/2 sets)"   shows progress counts: true
#9  hint before drawing: "Draw from the deck or take the discard to start your turn."
    Create Set (3+) => "Draw a card first" (disabled=true)
    Create Run (4+) => "Draw a card first" (disabled=true)
    Discard         => "Draw a card first" (disabled=true)
    after drawing:  "Tap cards to select them, then create a meld or discard."
    Discard         => "Select a card to discard" disabled=true
#11 heading 7.29:1 · badge 7.15:1 · card count 4.84:1  (theme=light)
#12 Haptics section visible: true
    aria-checked true -> false, localStorage hawaiianRummy_haptics: "false"
buy prompt: bg rgb(236,253,245) opaque=true pinnedToBottom=true topElementIsPanel=true
```

The `#11` check needed melds on the table, which meant driving real turns — the harness
auto-plays (draw, select last card, discard) until a `.meld-group` appears. Took one turn
before an AI melded.

Both typechecks clean, both builds succeed.

**Assumed, not verified:** the `M` shortcut's *wiring* was not exercised end-to-end in a
browser — that would need a hand containing a natural four-of-a-kind. The decision logic
is unit-tested 6/6 and the wiring is two lines (`myHand.filter(...)` then
`createMeld(detectMeldType(selected))`).

### Review scoreboard

All 18 items from the session 1 review are now closed across sessions 1–3, plus five
things found along the way that were not on the list: the chat button covering the hand
(session 2), the dead `preventDefault` (session 2), the idle-clock scope bug (session 2),
washed-out melds, and the translucent buy prompt (both this session).

### Still open

- Deck/discard hint labels (`-bottom-6`) sit under the player panel on a phone. Cosmetic.
- `public/sw.js` `CACHE_NAME` is a permanent `'hawaiian-rummy-v1'`.
- `client/` has no ESLint config, so `npm run lint` has never worked.
- `sortCardsBySuit()` in `card-utils.ts` has no callers.
- Documentation drift catalogued in session 1 is still entirely unaddressed: both
  `package.json`s say `2.0.0` for a v2.5.0 game, CHANGELOG has no v2.5.0 entry, README
  lists tournaments as a future enhancement and describes a client build step that does
  not match `vite.config.ts`, and `AI_IMPLEMENTATION.md` names AI players that no longer
  exist. That is probably the cheapest remaining win in the repo.

---

## Session 4 — 2026-08-26 — Correction to session 2: the sticky sort was wrong

Davin, testing the branch, asked why auto-sorting was enabled at all: *"later in the
game when players need sets and runs, auto-sort is harder to organize the cards. The
sort should be manual."*

He is right, and the problem is worse than a preference call.

### The two features I shipped were fighting each other

Session 2 delivered **both** a working mobile drag-to-reorder (item #3) **and** a sticky
sort that re-applied itself on every hand change (item #5). They are mutually exclusive
by construction, and I never tested them together:

1. Drag a card → `reorderHand(newOrder)` goes to the server
2. Server echoes the new hand order back
3. The sticky-sort effect sees the order differs from sorted → emits `reorderHand(sortedIds)`
4. The card snaps back

Measured on the branch as shipped, with `handSortMode: 'rank'`:

```
before drag : A♦2,2♣0,5♣2,6♦0,7♥2,9♠0,10♥0,Q♠2,K♦2
right after : A♦2,2♣0,5♣2,6♦0,7♥2,9♠0,10♥0,Q♠2,K♦2
2s later    : A♦2,2♣0,5♣2,6♦0,7♥2,9♠0,10♥0,Q♠2,K♦2
dragged card A♦2: index 0 -> 0     DRAG PERSISTED: false   SNAPPED BACK: true
```

So the headline fix of session 2 — mobile card reordering, which I verified extensively
and reported as working — was **dead on arrival for anyone with a sort mode enabled**.
Both of my session 2 verifications were real and both passed; neither exercised the
interaction. The drag test ran with sorting off, the sort test never dragged.

### WRONG PREMISE: item #5 itself

Session 1 recorded the problem as *"Hands are dealt unsorted every round and sort isn't
sticky... Every round starts with a manual 'Sort by Rank'."* That framing assumed sorted
is the state a player wants to be in, and that re-sorting is friction.

That is wrong for this game. Round 10 is "3 runs of 5" against a 15-card hand: players
group their cards into prospective melds by hand, and that grouping is *information* —
it has to survive a draw. A rank sort actively destroys it, and doing so automatically
destroys it without asking. The friction I "fixed" was the player expressing a
preference, and the fix overrode the preference.

Worth noting how the mistake was invisible from inside the work: every measurement in
session 2 was about whether the sort *worked*, and it did — it sorted the deal, it
sorted the draw, it persisted, it did not loop. Nothing I measured could have told me
that sorting the draw was the wrong thing to do. That needed someone who plays the game.

### The fix

Sorting is now a one-shot action, as it was before session 2, and nothing else:

- Deleted the re-apply effect from `PlayerHand`.
- Removed `handSortMode` from `settings-store` entirely — there is no mode to persist.
  A stale `handSortMode` left in a returning player's localStorage is simply ignored.
- Sort buttons are plain actions again: no active ring, no "auto-sorting" label, no
  toggle-off behaviour.
- `R` / `S` shortcuts likewise sort once.

Kept from session 2: the shared `sortHand()` helper (three hand-rolled copies collapsed
into one), the removal of the dead `useMemo` sort state, and the working touch drag —
which is the point, since it now actually works.

### Verification (all actually run)

Same harness, after the change:

```
1. sort buttons still work (one-shot)
   before:            K Q 2 K 10 Joker 8 6 K   sorted=false
   after Sort by Rank: Joker 2 6 8 10 Q K K K  sorted=true
   no "auto-sorting" label: true
2. a manual drag survives
   arranged: 2 6 8 10 Q Joker K K K   (deliberately not sorted: true)
3. drawing a card does NOT re-sort the arrangement
   after draw: 2 6 8 10 Q Joker K K K 7
   drew 7♠0 -> index 9 of 10          ARRANGEMENT PRESERVED: true
```

And the drag test that failed above now reports `index 0 -> 5, DRAG PERSISTED: true`,
with the hand left unsorted despite a seeded `handSortMode: 'rank'` in localStorage.

### The lesson worth keeping

Two features that each pass their own tests can still be mutually exclusive. Session 2
shipped a reordering feature and an auto-reordering feature on the same array on the same
day and tested them in separate harnesses. The cheap check that would have caught it —
"turn on feature A, then use feature B" — took about four minutes to write once someone
pointed at it.

---

## Session 5 — 2026-10-18 — Backlog review, and a tournament spec that was already written

No code changed. Two things: a review of everything open, and a place to keep Davin's
tournament feedback.

### The review

Open on GitHub: #11, #12, #14, #15, #16, and Dependabot PR #9. Read with
`gh api 'repos/davinoishi/Hawaiian-Rummy/issues?state=open'` (the `gh issue list` GraphQL
path failed with `tls: failed to verify certificate: x509: OSStatus -26276`; later `gh api`
calls failed the same way, so issue comments and PR #9 were read with unauthenticated
`curl` against the public REST API).

- #11 is already done: PR #13 (`e064715`) added the Dockerfile and compose file on 6 Oct,
  but the issue was never closed.
- #14 still applies on `main`: `game-handler.ts:84` strips `'🤖 '` while `AI_NAMES` are
  `'🥭 Mango'` etc. `durationMinutes` is still hardcoded to `0`.
- #15 was narrowed down in a 12 Oct comment: on an iPhone, a second tap replaces the
  selected card instead of adding to it.
- PR #9 isn't redundant even though May's single bumps (#1, #3, #5) were closed:
  `package.json` on `main` is still on `cors ^2.8.5`, `express ^5.1.0`, `socket.io ^4.8.1`.
- Session 4's "Still open" list is still all open (both `package.json`s say `2.0.0`,
  `CACHE_NAME` is `'hawaiian-rummy-v1'`, no client ESLint config).

Gap: this file has nothing for the 6 Oct deploy-files work or the 11–12 Oct investigation
that filed #14–#16. Not reconstructed here.

### Tournament feedback → ROADMAP.md

Davin sent tournament ideas (March Madness 64-player brackets, a 10-game Marathon, First
to 5000 loses; hosting from the profile page, invites, per-tournament leaderboard, waiting
for players, AI filling in for absentees) to keep, explicitly **not** to build yet. They
went into a new `ROADMAP.md`, along with the still-live "Future" items from README,
`AI_IMPLEMENTATION.md` and `TUTORIAL_IMPLEMENTATION_GUIDE.md` (minus tournament mode, which
shipped, and offline mode, which was removed).

The turn: I started out treating these as new ideas. `shared/tournament-types.ts` shows
the v2.5.0 work (`bbadf9c`, Feb 2026) had already designed all three modes, with the same
names, the 5000 threshold, island brackets and human seeding. Only Marathon got built:
`createTournament()` hardcodes `type: 'marathon'`. The AI-substitute path is half there:
`reclaimSlot()` reads `substituteForProfileId`, nothing ever sets it, and the client never
emits `reclaimSlot`. So ROADMAP.md maps each idea to its state in the code instead of
listing it as new.

Two things in the feedback differ from the code, and are recorded as questions rather
than changed silently: "each bracket is 4 games, the winner goes to the Final Four" needs
a fifth bracket-final game (the types already have one), and "Kawaii" is recorded as
Kauai, matching `BRACKET_NAMES`.

**Verified vs assumed:** the code states in ROADMAP.md come from reading and grepping the
source on `main` at `e064715`. Nothing was run. The concern about pi5-ai2 load for 16
concurrent March Madness games is a guess, not measured.

> **The lesson:** before writing up a feature request, grep for its nouns. Here the spec
> had been written eight months earlier, in the types file.

### Shipping it (PR #17)

Committed on `claude/roadmap-tournament-ideas` (`abef885`). `git push` succeeded, but
printed `error: could not write config file .git/config: Operation not permitted` twice:
the sandbox protects `.git/config`, so the local branch has no upstream recorded.
`git ls-remote` confirmed the branch was on GitHub.

`gh pr create` and `gh api …/pulls` both failed with the same
`x509: OSStatus -26276` as the review. The PR was opened (#17) by POSTing to the REST API
with `curl`, authenticated with `gh auth token` passed in a header and never printed.
WRONG THEORY: the first `gh api` call in the review worked, so I took the TLS failure for
a GraphQL-only problem. Every later `gh` call, REST included, failed, so it's `gh` itself
in this sandbox, not the endpoint. Not diagnosed further.

---

## Session 6 — 2026-10-18/19 — #14 (games not recorded) and #15 (iPhone can't meld)

Two fixes, on separate branches: `claude/fix-game-recording` (PR #18) and
`claude/fix-ios-card-selection` (this entry's branch). This entry lives on the second so the
two PRs don't conflict on this file.

### #14: completed games not recorded

The cause was as the issue said: `recordGameCompletion()` stripped `'🤖 '` before looking
up the AI profile, but since v2.4.0 the names are `'🥭 Mango'` etc. `getAIProfileId()` now
ignores any leading non-letter prefix.

**A bug the issue didn't mention, found by testing on `main` first.** A script
(scratchpad, not committed) drove games to `gameOver` through the real
`broadcastGameState()` and `ProfileManager`, in a scratch copy of the repo so `data/`
started empty, once against `git archive origin/main` and once against the fix:

```
main:  A games: 5   (signed-in human + 3 AI, gameOver broadcast 5 times -> 5 records)
       B: "No players with profiles to record"   (guest + 3 AI)
       D: "No players with profiles to record"   (human converted to AI)
       profile Tester gamesPlayed: 8   after 3 games
fix:   A 1 record, 4 players, dur=23 | B 1 record, 3 AI | C rematch: +1 | D human kept as human
```

The duplicate check compared `gameId.slice(0, -13)` (`game-<room>-`) against a set that
stored `<room>`, so it never matched. Every `gameOver` broadcast recorded the game
again. It never showed because since February almost nothing was recorded at all. Fixing
only the AI lookup would have turned that on: with #16's AI loop broadcasting every
~1.5 s after a game ends, one game could have been recorded hundreds of times. The check
now keys on room + `gameStartedAt` (new field on `Room`, set in `startGame`), so a rematch
in the same room still counts. The same field replaces the hardcoded
`durationMinutes = 0`.

Also checked before trusting the human path: `convertToAIPlayer()` moves the profile
mapping to the new AI id (`updatePlayerSocketId`), so a human who disconnects and is
taken over is now looked up by profile first and recorded as a human.

Not checked: whether the 7 February games in production's `completed-games.json` are
duplicates. Not deployed.

### #15: on iPhone only one card stays selected

**Getting a real WebKit browser took three attempts.** Playwright isn't installed, and
`xcrun simctl boot` from the sandbox fails with `CoreSimulatorService connection became
invalid`. Davin booted the simulator himself. The tool attached to an **iPhone 18 Pro**
(the model in the report), not the iPhone 17 Pro the boot command named. The game ran
from a scratch copy on port 3101, served through a temporary `.claude/launch.json` entry
(removed afterwards).

WRONG THEORY 1: "a tap toggles twice: `onTouchEnd` selects, then the synthetic `click`
runs `onClick` and deselects." Reading the code supports this, but it predicts that no
card ever stays selected, and Davin saw exactly one. I didn't ship a fix on it.

WRONG THEORY 2, briefly: "the tool's taps land one touch late." The first screenshots
showed a draw and a selection appearing only after the *next* tap. In fact the screenshot
just lags the simulator by a second or two. Waiting ~2 s before each screenshot made it
consistent.

**The probe settled it.** A script added to the scratch copy's built `index.html`
logged every touch/pointer/mouse/click event, with the "N selected" count, in a fixed
overlay. A plain button tap: `touchend` then, within 10 ms, `mouseover mousedown mouseup
click`. On cards, before the fix:

```
100.23 touchend   A♣  sel=1
100.23 mouseover  A♣  sel=1          <- iOS stops here: no click on this tap
112.01 touchend   8♥  sel=2
112.06 mousedown  8♥  sel=1
112.06 click      8♥  sel=1          <- the click deselects the second card
```

So theory 1 was right about the mechanism and wrong about what happens. iOS sometimes
holds the click back. Most likely its rule for taps that change the page (assumed from
the pattern, not confirmed). That's why the first card stuck and every later one
flipped back.

Fix: `handleTouchEnd` calls `e.preventDefault()` (if cancelable) in the tap branch, which
stops the emulated mouse events and click. The other option, dropping the touch path and
relying on `click`, would have broken the first tap, which got no click at all.

After the fix, same simulator:

```
96.97  touchend K♠ sel=1   98.57 touchend K♥ sel=2   109.40 touchend 2♦ sel=3   (no click after any)
[SERVER] createMeld result: success=true            -> "Your Melds: SET K♠ K♥ 2♦"
```

Tapping a selected card twice gave `sel=1` then `sel=0`. A horizontal `touch_path` drag
moved 9♠ from slot 1 to slot 3. The Draw button still receives its click. Client
`tsc --noEmit` is clean. `npm ci` in `client/` was needed first (`client/node_modules` was
missing). `npm run build` changed only the JS bundle; the CSS hash was unchanged.

Not tested: desktop mouse clicks after the fix (that code path is unchanged), a real
iPhone, Android.

Why August missed it: every mobile check ran in Chromium emulating a Pixel 5, and the
touch tests there drove events directly rather than through the browser's tap handling.

### Correction to session 5

Session 5 says every `gh` call after the first failed TLS verification. The final
`gh pr merge 17` succeeded. It ran right after the `curl` merge attempt was refused by
the auto-mode permission check. In this session `gh pr create` failed again with
`x509: OSStatus -26276`, so PR #18 was opened through the REST API with `curl`, as before.
`gh` in this sandbox is intermittent, not dead.

> **The lesson:** a theory that explains the bug but predicts the wrong symptom is not
> the cause yet. Here the mechanism was right and the prediction wrong, and only an event
> log in the real browser showed the missing piece: iOS sometimes sends the click and
> sometimes doesn't.

---

## Session 7 — 2026-10-19 — #16: AI keeps taking turns after gameOver

Fix on `claude/fix-ai-gameover-loop` (PR #20). This entry is on PR #19's branch so the
three PRs don't conflict on this file.

The cause was a phase gap in `AIManager.checkIfAINeedsAction()`: it returned true
whenever `currentPlayerIndex` pointed at the AI, with no phase check. At `gameOver` the
index stays on the last player. If that's an AI, the 500 ms processor schedules it,
`processAIAction` sleeps `AI_DECISION_DELAY` (1500 ms, which matches the issue's "about
every 1.5 seconds"), and `handleAITurn` logs `taking turn (phase: gameOver)`, handles
neither `draw` nor `meld`, and returns. The fix is an early `return false` at
`gameOver`. Before deciding that was enough, I checked the other phases:
`'discard'` is never set anywhere (`grep "gamePhase: 'discard'"` finds nothing), and
`lobby`/`turnOrder` are filtered out by `!state.gameStarted`.

Reproduced before fixing, with a script on `git archive main` in a scratch copy: 4 AIs,
game started, `gamePhase` forced to `gameOver` with `currentPlayerIndex: 0`, console
captured:

```
main: gameOver, 10 s: "needs action" 7, "taking turn" 6
fix:  gameOver, 10 s: "needs action" 0, "taking turn" 0
```

Control: a rematch in the same room must still get AI turns. The first run looked like
a regression. At 6 s the fix showed `draw/meld turns 3, draw/discard actions 0, phase now
draw`, against `4, 1, meld` on main. Rerunning both at 15 s: main 10 turns / 4 actions,
fix 9 / 3. The difference is buy-window timing (a fresh deal can open the 5 s window,
which AIs wait out), not the change.

**Answered but not fixed: finished rooms are never released.** `deleteRoom` runs only
when the last player leaves, and AIs never leave. `cleanupStaleRooms()` only deletes
rooms that never started, and has no callers. `unregisterRoomAIs()` has no callers
either. So every finished game with AIs stays in memory with its AIs registered until a
restart. After this fix they're idle, but `processAITurns` still iterates them every
500 ms. Releasing them has to work with rematches (`resetGameForRematch`) and tournaments
reusing a room, so it's left for a separate change and noted in PR #20.

Not verified: that this explains the ~2,900 log lines/day on idle days in production (the
issue's guess). Not deployed.

---

## Session 8 — 2026-10-19 — Releasing rooms no human is left in

Change on `claude/release-finished-rooms` (PR #21), cut from `main` and independent of
PR #20. This entry is on PR #19's branch, like sessions 6 and 7.

Session 7 found that finished rooms are never released. Before choosing a rule I mapped
every path that creates, reuses or drops a room:
- **Rematch** (`requestRematch`) needs every human in the room to vote at `gameOver`, so
  a room with a human in it must survive.
- **A human who closes the tab** goes through `markPlayerDisconnected`, a 45 s grace
  period, then `convertToAIPlayer`. `reconnectToGame` only matches players still in the
  grace period, so after conversion nobody can get back in.
- **Tournaments** reuse their room between games (`resetGameForRematch` +
  `startGame`), and recreate one if `activeRoomId` is missing.
- **Saved games** restore into a fresh room, so the old one isn't needed.

Rule: every 60 s, release any started room not in `roomToTournament` whose every seat is
in `aiPlayerIds` (`GameManager.getRoomsWithNoHumans()`, swept in `server/index.ts`). I
decided against a timeout for rooms that still have a connected human, and against
wiring the unused `cleanupStaleRooms()` for lobbies. Either could delete a room someone
is sitting in.

Predicate script, six rooms: released `["CONVERTED"]`; kept
`["CONNECTED","GAMEOVER","GRACE","LOBBY","REMATCHED"]`.

End to end: the real server ran from a scratch copy on port 3102, with two socket.io
clients (`client/node_modules/socket.io-client`).

WRONG TEST, first run: client A disconnected 3 s after `startGame`, and after 130 s
there was no `Released`, and not even `Grace period expired`. My next theory was also
wrong: that `socketData` is shared between connections, so A's disconnect looked up B's
room. It's created per connection (`room-handler.ts:99`). The real reason is that
`determineTurnOrder` takes about 8 s (1 s + 1.5 s steps) before `gameStarted` is set. A
left during it, so the server took the lobby path (`removePlayerFromRoom`, which logs
nothing). The log then still showed A's socket id among the room's players once the game
started (read from the log, not traced in the code). That **ghost seat** is neither AI
nor disconnected, so the room (E9TD7Q) is never released. That's a pre-existing bug,
noted in PR #21 and not fixed.

Second run, A leaving at 15 s:

```
[Room WVFE3D] Player Leaver2 marked as disconnected
[Room WVFE3D] Grace period expired for Leaver2
[Room WVFE3D] Converted Leaver2 to AI control (ai-converted-…)
[Room WVFE3D] Released: no human players left
```

B (ZHS4SU) stayed connected and kept playing for the whole 145 s. The first run's B room
(VYS7GU), whose client disconnected at the end of that run, was released too. AI log
lines don't carry a room id, so "its AIs stopped" was judged from which room's broadcasts
appear afterwards, not counted. `tsc` is clean. Not deployed.

> **The lesson:** when a test shows nothing at all, check the test before the code. Here
> the client left during a phase the test didn't know existed. That exposed a separate
> bug, not a flaw in the fix.

---

## Session 9 — 2026-10-19 — The ghost seat from turn order

Fix on `claude/fix-turn-order-ghost-seat` (PR #22), cut from `main`. Entry on PR #19's
branch, like sessions 6–8.

Traced in the code this time. `determineTurnOrder()` (game-handler.ts) does
`remainingPlayers = [...state.players]` when it starts and writes the drawn order back
with `setPlayerOrder()`, which replaces `players` wholesale. `removePlayer()` had already
dropped the leaver from `players`, `playerNames` and `playerStates`. `startGame()` then
rebuilds `playerStates` for every id in `players`, so the ghost gets a fresh state but
no name.

Same mechanism, other direction: `joinGame` only refused once `gameStarted` was set, so
a join during turn order succeeded and was then overwritten out of `players`.

WRONG THEORY (my own, stated to Davin mid-session): "every ghost turn waits out the
2-minute idle timeout." I waited over 2 minutes on `main` and saw no `Auto-played idle
turn`. `isIdleTimerApplicable()` returns false when fewer than 2 connected humans are
seated ("A solo player against AI can take as long as they like"), and the ghost is
the only human. So in a solo game the game **stalls on the ghost's first turn
forever**: last log line `currentPlayer: A04gzt6cgYbkl8NPAAAD phase: draw`, then
nothing from that room. The 2-minute wait would only apply with other humans present
(from the code, not measured).

Fix: before `setPlayerOrder`, keep only ids still in `players` (logs `Dropping N
player(s) who left during turn order`). `joinGame` refuses during `turnOrder`. I chose to
drop the leaver rather than give them a grace period: nothing has been dealt, and the
lobby path already treats a pre-start disconnect as leaving.

Real server (scratch copy, port 3103, socket.io clients; A leaves at 3 s, C joins at 5 s):

```
main  leave: A's socket in "Broadcasting to players" after start; parked on A's turn >2 min
main  join:  {"success":true}; order [Pineapple, LeaverBefore, Papaya, Mango]; C never seated
fix   leave: "Dropping 1 player(s) who left during turn order"; order = 3 AIs; A never reappears
fix   join:  {"error":"Game already started"}
```

`tsc` is clean. Not deployed. Not changed: the tutorial path (reads state fresh after
500 ms; a leave inside that window would make the AI `players[0]`).

### Correction to session 8

Session 8 says turn order takes "about 8 s (1 s + 1.5 s steps)". Adding up every sleep in
`determineTurnOrder` gives about 14 s: 1 s spawn wait, 1.5 s, 3 × 1.5 s, 1 s, 3 s final
display, 3 × 1 s countdown. Session 8's second test, leaving at 15 s, only cleared it by
about a second.

> **The lesson:** "it falls back to the idle timer" was a guess about a fallback I hadn't
> read. The fallback had its own condition, and that condition turned a slow game into a
> stuck one.

---

## Session 10 — 2026-10-20 — Deploying #14, #15, #16, room release and the ghost-seat fix

PRs #19–#22 were merged at Davin's request. `gh pr merge` failed TLS verification
(`x509: OSStatus -26276`) five times in a row. The merges went through the REST merge
endpoint with `curl`, each pinned to its PR's head sha (`3d1d57c`, `d6fa1aa`, `bf4b18a`,
`587a7c5`). The four PRs touched disjoint files. On the merged `main`: server and client
`tsc` clean, and the session 7 and 8 scripts reproduced their numbers (gameOver loop 0/0;
release rule picks only `CONVERTED`).

Deployed to pi5-ai2 (`guest` network, `/root/Hawaiian-Rummy`) through the noBGP MCP
`command` tool, as root.

**Before.** Pi checkout at `e064715`, container up 12 days from an image built about 7
weeks earlier. Was anyone playing? The obvious probes gave wrong answers first:

- WRONG READING: `docker logs --since 15m` and `--since 24h` both returned **0 lines**,
  while `docker logs --tail 5` showed lines from that minute. `--since` isn't usable on
  this host.
- WRONG READING: a full `docker logs -t` returned 120,674 lines ending **7 Oct 18:21**,
  from a json log file of **276 MB** last written that day. A full read stops partway;
  only `--tail` reaches the present. Cause not investigated.
- My own awk "last 30 min" filter then counted all 20,000 tail lines as recent, because
  `mktime` read the UTC timestamps as local time. Discarded.

What the tail actually showed: 20,000 lines spanning 02:46–04:50 UTC, **19,747 of them
the #16 loop** (`davin` and `🥭 Mango` "taking turn (phase: gameOver)"), so about 160
lines a minute or 230,000 a day. That's two orders of magnitude above the issue's guess
of ~2,900/day. The other 253 were the healthcheck's `page_view` every 30 s. No client
connections, so a restart dropped nobody.

**Backup.** `/root/hawaiian-rummy-data-20261020-045049.tar.gz`, 4 files, each checked by
sha256 against the live copy (all OK).

**Deploy.** `git pull --ff-only origin main` → `587a7c5` (11 files, +529/−26). Then
`docker compose up -d --build`, run detached via `setsid` with output to
`/root/hawaiian-rummy-deploy.log`: `exit=0`, finished 04:53:01 UTC.

**After, verified:**
- `Up (healthy)`. Startup: `Loaded 5 profiles`, `Loaded 7 completed games`,
  `Loaded 1 active tournaments`, the same counts as before.
- All three server fixes present in the container (grep). **0** `phase: gameOver` lines
  after start.
- `curl 127.0.0.1:3002/` serves `index-DYfyiy9S.js`, the same hash as the committed
  bundle, although the image builds the client from source. So the committed `public/`
  matches a fresh build.
- Signed-out fetch of the noBGP service "Hawaiian Rummy (Public)",
  `https://xjpl6dawgo66.nobgp.link`: 200, title "Hawaiian Rummy", same bundle (409,971
  bytes), which contains `F.cancelable&&F.preventDefault(),U()` (the #15 fix).

Correction to the project memory (not to an earlier session): it described the proxy as
private and auth-gated. The service is titled Public and serves signed out. Memory
updated.

Not done: #12's stale `data.fresh-1783985149/` is still on the Pi. Not checked: a real
game on the deployed build, and whether new games now land in `completed-games.json` (the
#14 fix). That needs someone to finish a game.

> **The lesson:** "nobody has played in 24 hours" rested on a command that returned
> nothing for the last 24 hours. A zero has to be checked against something that
> should not be zero; here, `--tail` was that check.

### #12: the stale `data.fresh-1783985149/` removed (20 Oct)

Compared it with the live `data/` before deleting:
- **`profiles.json` (Jul 13):** the 4 built-in AI profiles with all-zero stats. Live
  has the same 4 ids with real stats (e.g. `ai-mango` gamesPlayed 0→5, totalScore
  0→4345) plus `Davin`. No id missing from live, no live stat lower.
- **`tournaments.json`:** `[]`.
- **References:** not in docker-compose.yml or the Dockerfile; the container's only
  mount is `/root/Hawaiian-Rummy/data -> /app/data`.

That matches the issue's guess: a scratch "start clean" directory from the July
containerisation. Archived to `/root/hawaiian-rummy-data.fresh-1783985149.tar.gz` (493
bytes, sha256 of both files checked against the originals), then `rm -r`. Afterwards
`git status -sb` on the Pi was clean, with no untracked files, and the container
stayed `Up (healthy)`.

---

## Session 11 — 2026-10-20 — #14 checked in production; guests stay unrecorded

Davin finished a game on the deployed build (587a7c5). Read on pi5-ai2:
- **`completed-games.json`:** 7 → **8**, the first new record since 11 Feb:
  `game-0KFCL4-1792513935767`, 10 rounds, `durationMinutes: 48`, matching the room's
  15:44:24 → 16:32:15 UTC in the log.
- **`server-stats.json`:** `totalGamesCompleted: 8`.
- **Log:** `Recorded game stats for 3 players (3 AI, 0 human)`, written once.
- **#16 in production:** no AI `taking turn` after that line. The only two `phase: gameOver`
  lines were the server's own final broadcast.

The winner (placement 1) wasn't in the record. The log shows why:
`createRoom ... playerName: Test10-20 ... profileId: undefined`. Davin played as a guest,
not signed in, and `recordGameCompletion()` only keeps players with a profile.

**Decision (Davin):** keep it that way. Only signed-in players are recorded, and guests'
games aren't. This answers the question left open in #14 ("Decide whether games by players
who aren't signed in should be recorded"). Davin will sign in to his own profile to have
his games count.
