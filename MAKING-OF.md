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
