/**
 * Settings Store - Manages user preferences with localStorage persistence
 */

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface SettingsState {
  // Audio settings
  soundEnabled: boolean;
  soundVolume: number; // 0-1

  // Theme settings
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark'; // Actual theme after resolving 'auto'

  // Actions
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleSound: () => void;
  initializeFromStorage: () => void;
}

const STORAGE_KEY = 'hawaiianRummy_settings';

// Get saved settings from localStorage
function loadSettings(): Partial<SettingsState> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore errors
  }
  return {};
}

// Save settings to localStorage
function saveSettings(settings: Partial<SettingsState>) {
  try {
    const current = loadSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      soundEnabled: settings.soundEnabled,
      soundVolume: settings.soundVolume,
      themeMode: settings.themeMode
    }));
  } catch {
    // Ignore errors
  }
}

// Resolve 'auto' theme based on system preference
function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark'; // Default to dark if can't detect
  }
  return mode;
}

// Apply theme to document
function applyTheme(theme: 'light' | 'dark') {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Default settings
const defaults = {
  soundEnabled: true,
  soundVolume: 0.5,
  themeMode: 'dark' as ThemeMode,
  resolvedTheme: 'dark' as const
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,

  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled });
    saveSettings({ ...get(), soundEnabled: enabled });
  },

  setSoundVolume: (volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    set({ soundVolume: clampedVolume });
    saveSettings({ ...get(), soundVolume: clampedVolume });
  },

  setThemeMode: (mode) => {
    const resolved = resolveTheme(mode);
    set({ themeMode: mode, resolvedTheme: resolved });
    applyTheme(resolved);
    saveSettings({ ...get(), themeMode: mode });
  },

  toggleSound: () => {
    const newValue = !get().soundEnabled;
    set({ soundEnabled: newValue });
    saveSettings({ ...get(), soundEnabled: newValue });
  },

  initializeFromStorage: () => {
    const saved = loadSettings();
    const soundEnabled = saved.soundEnabled ?? defaults.soundEnabled;
    const soundVolume = saved.soundVolume ?? defaults.soundVolume;
    const themeMode = (saved.themeMode as ThemeMode) ?? defaults.themeMode;
    const resolved = resolveTheme(themeMode);

    set({
      soundEnabled,
      soundVolume,
      themeMode,
      resolvedTheme: resolved
    });

    applyTheme(resolved);

    // Listen for system theme changes when in auto mode
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        if (get().themeMode === 'auto') {
          const newResolved = resolveTheme('auto');
          set({ resolvedTheme: newResolved });
          applyTheme(newResolved);
        }
      };
      mediaQuery.addEventListener('change', handleChange);
    }
  }
}));
