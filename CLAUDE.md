# Hawaiian Rummy

A multiplayer card game: TypeScript, React 18 + Vite + Tailwind + Zustand (client),
Express + Socket.IO (server), with an isomorphic game engine in `shared/`.

## Layout

- `shared/game-engine/` — pure game logic (deck, actions, validation, constants). No I/O.
- `shared/ai/` — AI strategy and personalities.
- `server/` — Socket.IO handlers, `game-manager.ts` (room + state ownership),
  `ai-manager.ts`, `tournament-manager.ts`, `profile-manager.ts`.
- `client/src/` — React app. Stores in `store/`, hooks in `hooks/`, components by feature.
- `public/` — the **built** client. Vite's `outDir` is `../public`, so
  `npm run client:build` writes here directly and the built bundle is committed.

## Build & run

```bash
npm start              # production server on :3001 (tsx, no typecheck)
npm run dev            # server with auto-reload
npm run client:build   # rebuild the committed bundle in public/  <- run after ANY client/src change
```

The server serves the prebuilt client from `public/`, so a client change is not live
until `npm run client:build` runs and the new `public/assets/*` are committed.

Typecheck with `./node_modules/.bin/tsc -p tsconfig.server.json --noEmit` (server/shared)
and `cd client && npx tsc --noEmit` (client). There are no automated tests.

## MAKING-OF.md

This project keeps a `MAKING-OF.md` next to the README. It is the running story of
the project — what got decided, what got tested, and what turned out to be wrong.

- **Append, never rewrite.** New dated `## Session N — <date>` section at the bottom.
  Never edit or tidy earlier sessions. If a past conclusion was wrong, add a
  "Correction to session N" subsection saying so — leave the original in place.
- **The point of the file is the wrong turns.** Bad cost estimates, misread API
  responses, theories that got disproved, instructions that didn't work. A session
  entry that only records the clean final answer is a failed entry. Keep superseded
  theories under a `WRONG THEORY:` heading rather than deleting them.
- **Receipts.** Include the actual numbers, commands, error text, and file paths.
- **Say what was verified vs. assumed.** Mark anything not actually run as assumed.
- **Update it at the end of every working session**, before wrapping up — not only
  when asked. README says where things landed; this says how and why, so a decision
  doesn't get re-litigated in six months because nobody remembers the reasoning.
