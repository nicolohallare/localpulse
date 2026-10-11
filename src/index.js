import '@fontsource-variable/fraunces/full.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Auto-update: when the app comes back to the screen, check whether a newer version has been
// deployed (its main script file name changes on every deploy) and reload into it.
if (process.env.NODE_ENV === 'production') {
  const current = () => {
    const s = document.querySelector('script[src*="/static/js/main."]');
    return s ? s.getAttribute('src') : null;
  };
  let lastCheck = 0;
  const check = async () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    try {
      const html = await fetch('/', { cache: 'no-store' }).then((r) => r.text());
      const m = html.match(/\/static\/js\/main\.[a-z0-9]+\.js/);
      const mine = current();
      if (m && mine && !mine.endsWith(m[0])) window.location.reload();
    } catch (e) { /* offline: keep the current version */ }
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
}
