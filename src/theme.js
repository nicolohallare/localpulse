import React, { useState } from 'react';

// Appearance: 'system' (follow the phone), 'light' or 'dark'. index.html applies it before first paint.
const KEY = 'ub-theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeChoice() {
  try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
}

export function applyTheme(choice = getThemeChoice()) {
  const dark = choice === 'dark' || (choice === 'system' && media && media.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function setThemeChoice(choice) {
  try { localStorage.setItem(KEY, choice); } catch (e) { /* private mode */ }
  applyTheme(choice);
}

// Follow the phone switching between light and dark while the app is open.
if (media) {
  const onChange = () => { if (getThemeChoice() === 'system') applyTheme('system'); };
  if (media.addEventListener) media.addEventListener('change', onChange); else if (media.addListener) media.addListener(onChange);
}

const OPTIONS = [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

export function AppearancePicker() {
  const [choice, setChoice] = useState(getThemeChoice);
  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(([k, label]) => (
        <button key={k} role="radio" aria-checked={choice === k} className={choice === k ? 'seg-on' : ''}
          onClick={() => { setChoice(k); setThemeChoice(k); }}>{label}</button>
      ))}
    </div>
  );
}
