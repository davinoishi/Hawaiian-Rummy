# Roadmap

Ideas we want to keep, not commitments. Nothing here is scheduled. Bugs and chores live in
GitHub issues; this file holds features that haven't been decided yet.

---

## Tournament modes and hosting (proposed, 18 Oct 2026)

Feedback from Davin, recorded so it isn't lost. **Not committed to build.**

### The three modes

**March Madness — 64 players**
- Spread human players evenly across the four brackets, so humans and AI start on
  opposite sides and humans meet as late as possible.
- Four brackets of 16 players each, single elimination, 4 players per game. Each bracket
  starts with 4 games; the bracket winner goes to the Final Four.
- Bracket names: Oahu, Maui, Kauai, BigIsland.
- The 4 finalists play one game to decide the champion.

**Marathon — 10 games**
- Players play 10 full games. Lowest cumulative score wins.

**First to 5000 loses**
- Play rounds 1–10, then start again at round 1, and keep cycling.
- After any round, if a player has 5000 or more, the tournament ends. That player loses;
  the player with the lowest score wins.
- No need to finish a full 10-round game.

### Hosting and running a tournament
- **Host Tournament** from the player's profile page.
- **Invite users** to the tournament.
- The host names the tournament; the name is displayed throughout.
- Each tournament has its own **leaderboard / status page** with scores and progress.
- Tournaments can run long, so they rely on **saved games**.
- A **waiting room**: wait for every player to sign in (from their profile page) before
  continuing.
- The host can **start without everyone**, with AI playing for the missing players.

### What the code already has (checked 18 Oct 2026, `main` at `e064715`)

The v2.5.0 tournament work (`bbadf9c`, Feb 2026) designed all three modes, but built only
Marathon. Read from the code, not run:

| Idea | State in code |
|---|---|
| Marathon, 10 games, lowest total wins | **Built.** `server/tournament-manager.ts`, `MarathonTracker.tsx`. |
| First to 5000 | **Types only.** `FirstTo5000Tournament` in `shared/tournament-types.ts` (threshold, cycling round index, loser/winner). No server logic. |
| March Madness | **Types only.** `MarchMadnessTournament`: 4 brackets × (4 round-1 games + 1 bracket final), Final Four, seeding map, 64 AI names from Hawaiian towns (`HAWAIIAN_CITY_NAMES`). No server logic. |
| Choosing a mode | **Missing.** `createTournament()` always sets `type: 'marathon'`; the profile page only offers Marathon. |
| Host from profile page | **Built** for Marathon (`ProfilePage.tsx`). |
| Tournament name | **Built.** `CreateTournamentConfig.name`. |
| Invites | **Partly.** Shareable invite code. No way to invite a specific user. |
| Per-tournament leaderboard | **Partly.** `/tournament/:id/standings` exists, Marathon only. |
| Saved games across restarts | **Built.** Game state snapshot on every action, restored on rejoin. |
| Wait for everyone | **Partly.** Lobby shows who's connected; between games every human must vote "continue". |
| Start without everyone, AI fills in | **Partly.** At start, empty seats are filled with AI. An AI standing in for a *registered but absent* human is not wired: `substituteForProfileId` is read by `reclaimSlot()` but nothing ever sets it, and the client never sends `reclaimSlot`. Mid-game, the 45-second disconnect grace period with AI takeover (v2.1.0) still applies. |

### Questions to settle before building

- **March Madness bracket shape.** The feedback says each bracket is 4 games and the
  winner goes to the Final Four; 4 games produce 4 winners, so there has to be a fifth
  bracket-final game. The existing types already assume that (round 1 = 4 games, round 2
  = 1 game): 21 games per tournament in total. Confirm that's the intent.
- **Bracket name spelling.** The feedback said "Kawaii"; recorded here as Kauai, which is
  also what `BRACKET_NAMES` uses. The code orders them Oahu, Kauai, Maui, BigIsland.
- **Running 16 games at once on pi5-ai2.** Round 1 of March Madness is 16 games of 4. With
  few humans, most are AI-only. Simulate AI-only games headlessly and quickly, rather than
  as live rooms? Not measured.
- **Invites.** By profile, by link, or both? Do invitees need a profile first?
- **How long to wait for absent players** before the host can hand their seat to an AI,
  and can they take it back afterwards (the unfinished `reclaimSlot`)?

### Fix first

These open issues affect tournaments directly:
- #14: finished games aren't recorded (the AI profile lookup is broken).
- #16: AI keeps taking turns after `gameOver`. With 21 March Madness games, every
  finished room would keep looping.

---

## Other ideas carried over from the docs

From README "Future Enhancements", `AI_IMPLEMENTATION.md` and
`TUTORIAL_IMPLEMENTATION_GUIDE.md`, minus what has shipped or was dropped (tournament mode
shipped in v2.5.0; offline mode was removed in v2.4.0):

- Custom game rules configuration.
- AI difficulty levels (every AI personality is currently competitive).
- Smarter AI: opponent hand tracking, late-round suit focus for long runs, going-out speed.
- Mobile app version.
- Tutorial: remember completion, "Replay Tutorial" in settings, localisation, video clips.
