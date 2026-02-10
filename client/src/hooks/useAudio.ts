/**
 * useAudio - Hook for sound effects using Web Audio API
 * Generates sounds programmatically - no external files needed
 */

import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../store/settings-store';

type SoundName =
  | 'cardDraw' | 'cardPlace' | 'cardFlip' | 'meldCreate' | 'discard'
  | 'buyRequest' | 'buyGranted' | 'buyDenied'
  | 'turnStart' | 'roundEnd' | 'gameWin' | 'gameLose'
  | 'error' | 'click' | 'countdown';

// Sound generation functions
type SoundGenerator = (ctx: AudioContext, volume: number) => void;

const soundGenerators: Record<SoundName, SoundGenerator> = {
  click: (ctx, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  },

  countdown: (ctx, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  },

  cardDraw: (ctx, volume) => {
    // Whoosh sound
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  },

  cardPlace: (ctx, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  },

  cardFlip: (ctx, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(volume * 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  },

  meldCreate: (ctx, volume) => {
    // Ascending chime
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.2);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.2);
    });
  },

  discard: (ctx, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  },

  buyRequest: (ctx, volume) => {
    // Alert tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  },

  buyGranted: (ctx, volume) => {
    // Happy ascending
    [440, 554.37, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.15);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.15);
    });
  },

  buyDenied: (ctx, volume) => {
    // Sad descending
    [440, 349.23].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.2);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.2);
    });
  },

  turnStart: (ctx, volume) => {
    // Attention chime
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  },

  roundEnd: (ctx, volume) => {
    // Fanfare
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
  },

  gameWin: (ctx, volume) => {
    // Victory fanfare
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const startTime = ctx.currentTime + i * 0.15;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  },

  gameLose: (ctx, volume) => {
    // Sad trombone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(311.13, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(277.18, ctx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.6);
    osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.9);
    gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  },

  error: (ctx, volume) => {
    // Buzzer
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }
};

export function useAudio() {
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const volume = useSettingsStore((state) => state.soundVolume);
  const setSoundEnabled = useSettingsStore((state) => state.setSoundEnabled);
  const setSoundVolume = useSettingsStore((state) => state.setSoundVolume);
  const toggleSound = useSettingsStore((state) => state.toggleSound);

  const muted = !soundEnabled;
  const audioContextRef = useRef<AudioContext | null>(null);

  // Get or create audio context
  const getAudioContext = useCallback((): AudioContext | null => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  }, []);

  // Initialize audio context on user interaction
  const initAudioContext = useCallback(() => {
    getAudioContext();
  }, [getAudioContext]);

  // Play a sound
  const playSound = useCallback((name: SoundName) => {
    if (muted) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      soundGenerators[name](ctx, volume);
    } catch (err) {
      console.debug('Audio play failed:', err);
    }
  }, [muted, volume, getAudioContext]);

  // Set muted state (inverted from soundEnabled)
  const setMuted = useCallback((value: boolean) => {
    setSoundEnabled(!value);
  }, [setSoundEnabled]);

  // Toggle muted state
  const toggleMute = useCallback(() => {
    toggleSound();
  }, [toggleSound]);

  // Set volume
  const setVolume = useCallback((value: number) => {
    setSoundVolume(value);
  }, [setSoundVolume]);

  // Convenience methods for common sounds
  const playCardDraw = useCallback(() => playSound('cardDraw'), [playSound]);
  const playCardPlace = useCallback(() => playSound('cardPlace'), [playSound]);
  const playCardFlip = useCallback(() => playSound('cardFlip'), [playSound]);
  const playMeldCreate = useCallback(() => playSound('meldCreate'), [playSound]);
  const playDiscard = useCallback(() => playSound('discard'), [playSound]);
  const playBuyRequest = useCallback(() => playSound('buyRequest'), [playSound]);
  const playBuyGranted = useCallback(() => playSound('buyGranted'), [playSound]);
  const playBuyDenied = useCallback(() => playSound('buyDenied'), [playSound]);
  const playTurnStart = useCallback(() => playSound('turnStart'), [playSound]);
  const playRoundEnd = useCallback(() => playSound('roundEnd'), [playSound]);
  const playGameWin = useCallback(() => playSound('gameWin'), [playSound]);
  const playGameLose = useCallback(() => playSound('gameLose'), [playSound]);
  const playError = useCallback(() => playSound('error'), [playSound]);
  const playClick = useCallback(() => playSound('click'), [playSound]);
  const playCountdown = useCallback(() => playSound('countdown'), [playSound]);

  // No-op for compatibility
  const preloadAllSounds = useCallback(() => {}, []);

  return {
    // State
    muted,
    volume,

    // Controls
    setMuted,
    toggleMute,
    setVolume,

    // Generic play
    playSound,

    // Convenience methods
    playCardDraw,
    playCardPlace,
    playCardFlip,
    playMeldCreate,
    playDiscard,
    playBuyRequest,
    playBuyGranted,
    playBuyDenied,
    playTurnStart,
    playRoundEnd,
    playGameWin,
    playGameLose,
    playError,
    playClick,
    playCountdown,

    // Utilities
    preloadAllSounds,
    initAudioContext
  };
}
