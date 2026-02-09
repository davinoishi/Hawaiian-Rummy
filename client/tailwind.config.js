/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Card colors
        'card-red': '#dc2626',
        'card-black': '#1f2937',
        // Game theme colors
        'game-primary': '#3b82f6',
        'game-secondary': '#8b5cf6',
        'game-success': '#22c55e',
        'game-warning': '#f59e0b',
        'game-error': '#ef4444',
      },
      animation: {
        'card-deal': 'cardDeal 0.8s ease-out forwards',
        'card-discard': 'cardDiscard 0.5s ease-in forwards',
        'meld-snap': 'meldSnap 0.5s ease-out',
        'discard-glow': 'discardGlow 1.5s ease-in-out infinite',
        'shake': 'shake 0.4s ease-in-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'confetti-fall': 'confettiFall 3s linear forwards',
        'layoff-fly': 'layoffFly 0.6s ease-in-out',
        'meld-pulse': 'meldPulse 0.6s ease-in-out',
        'float': 'float 3s ease-in-out infinite',
        'tutorial-pulse': 'tutorialPulse 2s infinite',
      },
      keyframes: {
        cardDeal: {
          '0%': { opacity: '0', transform: 'translateY(-300px) scale(0.3) rotate(-20deg)' },
          '70%': { opacity: '1', transform: 'translateY(20px) scale(1.1) rotate(5deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1) rotate(0deg)' },
        },
        cardDiscard: {
          '0%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translateY(-200px) scale(0.5) rotate(25deg)' },
        },
        meldSnap: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.15) rotate(-3deg)' },
          '60%': { transform: 'scale(1.15) rotate(3deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        },
        discardGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(147, 51, 234, 0.6)' },
          '50%': { boxShadow: '0 0 30px rgba(147, 51, 234, 1), 0 0 60px rgba(147, 51, 234, 0.8)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '25%': { transform: 'translateX(-8px) rotate(-3deg)' },
          '50%': { transform: 'translateX(8px) rotate(3deg)' },
          '75%': { transform: 'translateX(-8px) rotate(-3deg)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.1)' },
        },
        confettiFall: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(100vh) rotate(720deg)', opacity: '0' },
        },
        layoffFly: {
          '0%': { transform: 'scale(1) translateY(0)', opacity: '1' },
          '50%': { transform: 'scale(1.3) translateY(-30px)', opacity: '0.8' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        meldPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
          '50%': { boxShadow: '0 0 20px 5px rgba(34, 197, 94, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        tutorialPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)' },
          '50%': { boxShadow: '0 0 40px rgba(59, 130, 246, 1)' },
        },
      },
      // Mobile-first breakpoints
      screens: {
        'xs': '320px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [],
}
