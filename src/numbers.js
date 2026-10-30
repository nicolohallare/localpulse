import React, { useEffect, useState } from 'react';
import { supabase } from './lib';
import { Spinner, Notice } from './ui';

// One row per device per day, so the admin Numbers page can count active users. No personal data.
export function pingOpen() {
  try {
    let id = localStorage.getItem('ub-device');
    if (!id) { id = `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; localStorage.setItem('ub-device', id); }
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('ub-ping') === today) return;
    const cap = window.Capacitor;
    const platform = cap && cap.getPlatform ? cap.getPlatform() : 'web';
    supabase.rpc('ping_open', { p_device: id, p_platform: platform }).then(({ error }) => { if (!error) localStorage.setItem('ub-ping', today); });
  } catch (e) { /* private mode */ }
}

// Google list prices per 1,000 calls (USD), minus each SKU's free monthly allowance.
const PRICES = {
  g_nearby: { label: 'Google: nearby search', per1k: 35, free: 1000 },
  g_text: { label: 'Google: text search', per1k: 35, free: 1000 },
  g_details: { label: 'Google: place details', per1k: 20, free: 1000 },
  g_photo: { label: 'Google: photos', per1k: 7, free: 1000 },
  g_routes: { label: 'Google: drive times', per1k: 5, free: 1000 },
  brave: { label: 'Brave search', per1k: 5, free: 1000 },
  ai: { label: 'Claude AI', per1k: 3, free: 0 },
};
const FIXED = 20 + 8 + 1; // Vercel Pro (once commercial) + Apple ($99/yr) + domain, per month
const BUDGET_PHP = 8000;
const PHP = 58;

const usd = (n) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const cost = (k, n) => { const p = PRICES[k]; return p ? Math.max(0, n - p.free) / 1000 * p.per1k : 0; };

export function NumbersAdmin() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc('admin_numbers').then(({ data, error }) => (error ? setErr(error.message) : setD(data)));
  }, []);
  if (err) return <Notice tone="warn">{err}</Notice>;
  if (!d) return <Spinner label="Counting…" />;

  const month = d.usage_month || {};
  const kinds = Object.keys(PRICES);
  const variable = kinds.reduce((s, k) => s + cost(k, month[k] || 0), 0);
  const day = Number(String(d.today).slice(8, 10)) || 1;
  const daysInMonth = new Date(Number(String(d.today).slice(0, 4)), Number(String(d.today).slice(5, 7)), 0).getDate();
  const projected = variable / day * daysInMonth + FIXED;
  const projectedPhp = projected * PHP;
  const over = projectedPhp > BUDGET_PHP;

  const Tile = ({ label, value, sub }) => (
    <div className="num-tile"><span className="tiny muted">{label}</span><span className="num-big">{value}</span>{sub && <span className="tiny muted">{sub}</span>}</div>
  );

  return (
    <div className="stack-12">
      <p className="small muted">Goal by mid-December: about 1,000 people a week and 30+ restaurants with check-ins, on under ₱{BUDGET_PHP.toLocaleString()} a month.</p>
      <div className="num-grid">
        <Tile label="People this week" value={d.active_7d} sub={`goal 1,000 · ${d.new_7d} new`} />
        <Tile label="Today" value={d.active_today} sub={`${d.active_30d} in 30 days`} />
        <Tile label="Check-ins this week" value={d.checkins_7d} sub={`${d.checkins_total} all time`} />
        <Tile label="Restaurants checked in" value={d.places_with_checkins} sub={`goal 30 · ${d.checkers_total} people`} />
      </div>
      <div className={`num-budget ${over ? 'num-over' : ''}`}>
        <span className="small strong">Spend this month (estimate)</span>
        <span className="num-big">₱{Math.round(projectedPhp).toLocaleString()}</span>
        <span className="tiny">projected for the month, of ₱{BUDGET_PHP.toLocaleString()} budget · {usd(variable)} usage so far + {usd(FIXED)} fixed</span>
      </div>
      <table className="num-table">
        <thead><tr><th>Paid calls</th><th>7 days</th><th>Month</th><th>Est.</th></tr></thead>
        <tbody>
          {kinds.map((k) => (
            <tr key={k}><td>{PRICES[k].label}</td><td>{(d.usage_7d || {})[k] || 0}</td><td>{month[k] || 0}</td><td>{usd(cost(k, month[k] || 0))}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">Estimates from list prices after free monthly allowances; your Google bill is the real number. Counting started Oct 30, 2026.</p>
      {(d.weeks || []).length > 0 && (
        <table className="num-table">
          <thead><tr><th>Week of</th><th>People</th><th>New</th><th>Check-ins</th></tr></thead>
          <tbody>{d.weeks.map((w) => <tr key={w.week}><td>{w.week}</td><td>{w.active}</td><td>{w.new}</td><td>{w.checkins}</td></tr>)}</tbody>
        </table>
      )}
      {d.platforms_7d && <p className="tiny muted">This week by platform: {Object.entries(d.platforms_7d).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</p>}
    </div>
  );
}
