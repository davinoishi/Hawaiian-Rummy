/**
 * GameBoard - Main game playing area
 */

import { useGameStore, useSettingsStore, selectTopDiscard, selectOpponents } from '../../store';
import { PlayerHand } from './PlayerHand';
import { MeldArea } from './MeldArea';
import { ActionBar } from '../actions/ActionBar';
import { DiscardPile } from './DiscardPile';
import { DeckArea } from './DeckArea';
import { PlayerInfo } from './PlayerInfo';
import { RoundInfo } from './RoundInfo';
import { BuyActions } from '../actions/BuyActions';
import { ChatPanel } from './ChatPanel';
import { ROUND_REQUIREMENTS } from '@shared/game-engine/constants';

export function GameBoard() {
  const {
    players,
    myMelds,
    currentRound,
    isMyTurn: rawIsMyTurn,
    hasMetRequirements: rawHasMetRequirements,
    buyWindowActive,
    currentPlayerIndex,
    tutorialMode
  } = useGameStore();

  const topDiscard = useGameStore(selectTopDiscard);
  const opponents = useGameStore(selectOpponents);
  const myPlayer = players?.find(p => p.isMe);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  // Ensure boolean values
  const isMyTurn = rawIsMyTurn ?? false;
  const hasMetRequirements = rawHasMetRequirements ?? false;

  const requirement = ROUND_REQUIREMENTS[currentRound || 0];

  return (
    <div className={`min-h-screen flex flex-col p-2 sm:p-4 safe-area-inset-top safe-area-inset-bottom ${tutorialMode ? 'pt-14' : ''}`}>
      {/* Header with round info */}
      <RoundInfo
        round={(currentRound || 0) + 1}
        requirement={requirement}
        isMyTurn={isMyTurn}
        hasMetRequirements={hasMetRequirements}
      />

      {/* Main game area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Opponents section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          {opponents.map((opponent) => (
            <div key={opponent.id} className="panel p-3">
              <PlayerInfo
                player={opponent}
                isCurrentTurn={players?.[(currentPlayerIndex ?? 0)]?.id === opponent.id}
              />
              <MeldArea
                playerId={opponent.id}
                playerName={opponent.name}
                melds={opponent.melds}
                isMe={false}
                canLayoff={hasMetRequirements && isMyTurn}
              />
            </div>
          ))}
        </div>

        {/* Center area - Deck and Discard */}
        <div className="flex justify-center items-center gap-8">
          <DeckArea />
          <DiscardPile topCard={topDiscard} />
        </div>

        {/* My player section */}
        <div className="panel p-4 mt-auto">
          {/* My score */}
          {myPlayer && (
            <div className={`flex items-center justify-between mb-3 pb-2 border-b ${isLight ? 'border-emerald-300' : 'border-emerald-700/50'}`}>
              <div className="flex items-center gap-2">
                <span className={`${isLight ? 'text-emerald-900' : 'text-white'} font-medium`}>{myPlayer.name}</span>
                {isMyTurn && (
                  <span className={`text-xs ${isLight ? 'text-amber-900 bg-amber-200' : 'text-yellow-400 bg-yellow-400/20'} px-1.5 py-0.5 rounded`}>
                    Your Turn
                  </span>
                )}
              </div>
              <div className={`${isLight ? 'text-emerald-700' : 'text-emerald-200'} text-sm`}>
                <span className="font-medium">{myPlayer.score}</span> pts
                {myPlayer.wins > 0 && <span className="ml-2">{myPlayer.wins} wins</span>}
              </div>
            </div>
          )}

          {/* My melds */}
          {myMelds && myMelds.length > 0 && myPlayer && (
            <div className="mb-4">
              <MeldArea
                playerId={myPlayer.id}
                playerName="You"
                melds={myMelds}
                isMe={true}
                canLayoff={hasMetRequirements && isMyTurn}
              />
            </div>
          )}

          {/* My hand */}
          <PlayerHand />

          {/* Action bar */}
          <ActionBar />
        </div>
      </div>

      {/* Buy prompt - pinned to the viewport so the 5-second window is never
          scrolled out of view on a phone */}
      {buyWindowActive && !isMyTurn && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-2 sm:p-4 pointer-events-none safe-area-inset-bottom">
          <div className="max-w-md mx-auto pointer-events-auto">
            <BuyActions />
          </div>
        </div>
      )}

      {/* Chat panel */}
      <ChatPanel />
    </div>
  );
}
