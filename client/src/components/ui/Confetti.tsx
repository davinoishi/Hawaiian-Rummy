/**
 * Confetti - Celebration effect for wins
 */

import { useEffect, useState } from 'react';
import { useUIStore } from '../../store';

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  rotate: number;
}

const COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export function Confetti() {
  const setShowConfetti = useUIStore((state) => state.setShowConfetti);
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    // Generate confetti pieces
    const newPieces: ConfettiPiece[] = [];
    for (let i = 0; i < 50; i++) {
      newPieces.push({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 2,
        rotate: Math.random() * 360
      });
    }
    setPieces(newPieces);

    // Auto-hide after animation
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 4000);

    return () => clearTimeout(timer);
  }, [setShowConfetti]);

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            left: `${piece.x}%`,
            top: '-20px',
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotate}deg)`,
            animation: `confettiFall ${piece.duration}s ease-out ${piece.delay}s forwards`
          }}
        />
      ))}
    </div>
  );
}
