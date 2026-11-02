import React, { useEffect, useState } from 'react';
import { isNativeApp } from './lib';

// A small "Get the app" bar for people using Ube Banana in a phone browser.
// Shows from the second visit (or after opening a restaurant), and hides for 7 days when dismissed.
const PLAY = 'https://play.google.com/store/apps/details?id=com.ubebanana.app';
const APPSTORE = 'https://apps.apple.com/ph/app/ube-banana/id6824764829';
const KEY = 'ub-getapp';

function phone() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
}

export function noteVisit() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (s.last !== today) { s.visits = (s.visits || 0) + 1; s.last = today; }
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* private mode */ }
}

// Counted once per page load, before the bar decides whether to show.
if (typeof window !== 'undefined') noteVisit();

export default function GetAppBar({ route, visible }) {
  const [show, setShow] = useState(false);
  const os = phone();
  useEffect(() => {
    if (isNativeApp() || !os) return;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (route === 'place') { s.places = (s.places || 0) + 1; localStorage.setItem(KEY, JSON.stringify(s)); }
      const snoozed = s.hideUntil && Date.now() < s.hideUntil;
      setShow(!snoozed && ((s.visits || 0) >= 2 || (s.places || 0) >= 1));
    } catch (e) { setShow(false); }
  }, [route, os]);
  if (!show || !visible) return null;
  const dismiss = () => {
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); s.hideUntil = Date.now() + 7 * 864e5; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    setShow(false);
  };
  return (
    <div className="getapp" role="region" aria-label="Get the app">
      <img src="/icons/icon-192.png" alt="" className="getapp-icon" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      <span className="getapp-text"><strong>Get the Ube Banana app</strong><span>Faster, and check in with one tap.</span></span>
      <a className="getapp-btn" href={os === 'ios' ? APPSTORE : PLAY}>Get</a>
      <button className="getapp-x" onClick={dismiss} aria-label="Not now">×</button>
    </div>
  );
}
