/**
 * AboutPage - Information about the game, its origins, and tech stack
 */

import { useSettingsStore } from '../../store';

interface AboutPageProps {
  onBack: () => void;
  onViewPrivacy: () => void;
}

export function AboutPage({ onBack, onViewPrivacy }: AboutPageProps) {
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const isLight = resolvedTheme === 'light';

  return (
    <div className={`min-h-screen p-4 ${isLight ? 'bg-gradient-to-br from-emerald-100 to-emerald-50' : 'bg-gradient-to-br from-emerald-800 to-emerald-950'}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <div className="flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${isLight ? 'text-emerald-900' : 'text-white'}`}>
              About Hawaiian Rummy
            </h1>
            <button
              onClick={onBack}
              className={`p-2 rounded-lg ${isLight ? 'hover:bg-emerald-100' : 'hover:bg-emerald-700'}`}
            >
              <svg className={`w-5 h-5 ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* The Story */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            The Story
          </h2>
          <p className={`leading-relaxed ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            Hawaiian Rummy is a family card game with a unique set of rules that has been passed down through
            generations. Despite being a beloved household game, no digital version existed — so we built one
            from scratch. Now you can play it with friends and family online, no matter where you are.
          </p>
        </div>

        {/* Built by AI */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Built by AI
          </h2>
          <p className={`leading-relaxed ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            This entire application was coded by Claude Code (Anthropic). Human developers provided reviews,
            direction, and input, with additional assistance from GLM and ChatGPT for brainstorming
            and testing ideas. The game logic, UI, AI opponents, and server infrastructure were all
            written by AI.
          </p>
        </div>

        {/* Demo Instance */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Demo Instance
          </h2>
          <p className={`leading-relaxed ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            This demo runs on local hardware and is safely exposed to the public internet through a{' '}
            <a
              href="https://nobgp.com"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-100'}`}
            >
              noBGP
            </a>{' '}
            proxy — no ports are forwarded on the home network.
          </p>
          <p className={`mt-2 text-sm ${isLight ? 'text-emerald-600' : 'text-emerald-300'}`}>
            Version 2.4.0
          </p>
        </div>

        {/* Tech Stack */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Tech Stack
          </h2>
          <div className="flex flex-wrap gap-2">
            {['React 18', 'TypeScript', 'Tailwind CSS', 'Socket.IO', 'Express', 'Zustand', 'Vite'].map((tech) => (
              <span
                key={tech}
                className={`px-3 py-1 rounded-full text-sm font-medium ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-700 text-emerald-200'}`}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Self-Hosting */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Self-Hosting
          </h2>
          <p className={`leading-relaxed ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            Anyone can run their own instance of Hawaiian Rummy. The source code is available on{' '}
            <a
              href="https://github.com/davinoishi/Hawaiian-Rummy"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-100'}`}
            >
              GitHub
            </a>.
          </p>
        </div>

        {/* Contact & Feedback */}
        <div className={`panel p-4 ${isLight ? 'bg-white/90' : 'bg-emerald-800/90'}`}>
          <h2 className={`text-lg font-bold mb-3 ${isLight ? 'text-emerald-900' : 'text-white'}`}>
            Contact & Feedback
          </h2>
          <p className={`leading-relaxed ${isLight ? 'text-emerald-800' : 'text-emerald-100'}`}>
            Found a bug or have a suggestion? Open an issue on{' '}
            <a
              href="https://github.com/davinoishi/Hawaiian-Rummy/issues"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-100'}`}
            >
              GitHub Issues
            </a>.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center space-y-3">
          <button
            onClick={onViewPrivacy}
            className={`text-sm underline ${isLight ? 'text-emerald-600 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-100'}`}
          >
            Privacy & Terms
          </button>
          <div>
            <button onClick={onBack} className="btn-primary">
              Back to Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
