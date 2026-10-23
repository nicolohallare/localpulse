import React, { useEffect, useState } from 'react';
import { supabase, ensureUser, currentUser } from './lib';
import { Icon, Sheet, Spinner, Notice, Empty } from './ui';
import { compressImage } from './media';

// Credit card dining promos: read from banks' promo pages (daily) and submitted by people (approved by admins).
// They're matched to restaurants by name, so one promo covers every branch unless it names specific ones.
export const BANKS = ['BDO', 'BPI', 'Metrobank', 'Security Bank', 'RCBC', 'UnionBank', 'EastWest', 'HSBC', 'China Bank', 'PNB', 'AUB', 'Maybank', 'Citi', 'Maya', 'GCash'];

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['the', 'restaurant', 'resto', 'cafe', 'coffee', 'bar', 'grill', 'kitchen', 'and', 'by', 'at', 'of', 'co',
  'ph', 'manila', 'philippines', 'branch', 'branches', 'all', 'sm', 'mall', 'inc', 'group', 'dining', 'bistro', 'house']);
export function matchWords(name) {
  const w = norm(String(name || '').split(/[-–|(]/)[0]).split(' ').filter((x) => x.length > 2 && !STOP.has(x));
  return w.length ? w.slice(0, 3) : norm(name).split(' ').filter((x) => x.length > 1).slice(0, 2);
}

// ── My cards (kept on the phone, and in a private table so they follow you) ──
const KEY = 'ub-cards';
let myCardsCache = null;
export function getMyCards() {
  if (myCardsCache) return myCardsCache;
  try { myCardsCache = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { myCardsCache = []; }
  return myCardsCache;
}
export async function saveMyCards(banks) {
  myCardsCache = banks;
  try { localStorage.setItem(KEY, JSON.stringify(banks)); } catch (e) { /* private mode */ }
  window.dispatchEvent(new Event('ub-cards'));
  try { const u = await ensureUser(); await supabase.from('my_cards').upsert({ user_id: u.id, banks, updated_at: new Date().toISOString() }); } catch (e) { /* offline */ }
}
export async function syncMyCards() {
  try {
    const u = await currentUser();
    if (!u) return;
    const { data } = await supabase.from('my_cards').select('banks').eq('user_id', u.id).maybeSingle();
    if (data && Array.isArray(data.banks) && data.banks.length && !getMyCards().length) await saveMyCards(data.banks);
  } catch (e) { /* ignore */ }
}
export function useMyCards() {
  const [cards, setCards] = useState(getMyCards);
  useEffect(() => {
    const on = () => setCards([...getMyCards()]);
    window.addEventListener('ub-cards', on);
    return () => window.removeEventListener('ub-cards', on);
  }, []);
  return cards;
}

// ── Promos ──
let promosPromise = null;
export function loadPromos(force) {
  if (!promosPromise || force) {
    promosPromise = supabase.from('card_promos')
      .select('id,source,bank,cards,merchant,match_words,google_place_id,branches,discount,details,min_spend,ends_on,source_url,status')
      .eq('status', 'live').order('ends_on', { ascending: true, nullsFirst: false }).limit(1000)
      .then(({ data }) => data || []).catch(() => []);
  }
  return promosPromise;
}
export function usePromos() {
  const [promos, setPromos] = useState(null);
  useEffect(() => { loadPromos().then(setPromos); }, []);
  return promos;
}

// Words too common to identify a restaurant on their own (e.g. "The Lounge" at a hotel).
const GENERIC = new Set(['lounge', 'lobby', 'bar', 'grill', 'terrace', 'garden', 'market', 'pool', 'deli', 'buffet', 'steak',
  'steakhouse', 'pizza', 'pizzeria', 'ramen', 'sushi', 'bakery', 'bakeshop', 'tea', 'brew', 'pub', 'cafeteria', 'spectrum', 'vue',
  'cucina', 'trattoria', 'izakaya', 'diner', 'canteen', 'eatery', 'room', 'club', 'hall', 'table', 'feast', 'kusina']);
const has = (name, x) => name.includes(` ${x} `) || name.includes(` ${x}`);

// Promos for a place: same Google place, or every distinctive word of the promo's restaurant name is in the place's name.
// A one-word generic name (a hotel's "Lounge") also needs a word from its location (e.g. "Fairmont") to match.
export function promosFor(place, promos, cards) {
  if (!place || !promos) return [];
  const name = ` ${norm(`${place.name} ${place.address || ''}`)} `;
  const title = ` ${norm(place.name)} `;
  return promos.filter((p) => {
    if (cards && cards.length && !cards.includes(p.bank)) return false;
    if (p.google_place_id) return p.google_place_id === place.id;
    const w = (p.match_words && p.match_words.length ? p.match_words : matchWords(p.merchant));
    if (!w.length || !w.every((x) => has(title, x))) return false;
    if (w.length === 1 && GENERIC.has(w[0])) {
      const where = matchWords(p.branches || '').filter((x) => !GENERIC.has(x));
      return where.length > 0 && where.some((x) => has(name, x));
    }
    return true;
  });
}

export const shortDate = (d) => (d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : null);

export function PromoCard({ p, onOpenName }) {
  return (
    <div className="promo-card">
      <div className="row-between">
        <span className="promo-bank">{p.bank}</span>
        {p.ends_on && <span className="tiny muted">Until {shortDate(p.ends_on)}</span>}
      </div>
      <span className="promo-discount">{p.discount}</span>
      {onOpenName ? <button className="link-btn left strong" onClick={() => onOpenName(p)}>{p.merchant} →</button> : <span className="strong small">{p.merchant}</span>}
      {p.branches && <span className="tiny muted">📍 {p.branches}</span>}
      {(p.min_spend || p.details) && (
        <span className="small">{[p.min_spend ? `Min. spend ₱${Number(p.min_spend).toLocaleString()}` : null, p.details].filter(Boolean).join(' · ')}</span>
      )}
      <div className="row-between">
        <span className="tiny muted">{p.cards || `${p.bank} cards`}{p.source === 'community' ? ' · shared by a user' : ''}</span>
        {/^https?:/.test(p.source_url || '') && <a className="link-out tiny" href={p.source_url} target="_blank" rel="noreferrer">Full terms <Icon name="external" size={12} /></a>}
      </div>
    </div>
  );
}

export function MyCardsSheet({ onClose }) {
  const [sel, setSel] = useState(getMyCards);
  const toggle = (b) => setSel((s) => (s.includes(b) ? s.filter((x) => x !== b) : [...s, b]));
  return (
    <Sheet title="My cards" onClose={onClose}>
      <div className="stack-12">
        <p className="small muted">Pick the banks whose credit or debit cards you have. We’ll only show promos you can use. Nothing about your cards is shared — just the bank names, kept private.</p>
        <div className="row-wrap">
          {BANKS.map((b) => (
            <button key={b} className={`chip ${sel.includes(b) ? 'chip-on' : ''}`} aria-pressed={sel.includes(b)} onClick={() => toggle(b)}>{b}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => { saveMyCards(sel); onClose(); }}>{sel.length ? `Save ${sel.length} card${sel.length === 1 ? '' : 's'}` : 'Show promos for all banks'}</button>
      </div>
    </Sheet>
  );
}

export function SubmitPromoSheet({ onClose, place }) {
  const [f, setF] = useState({ bank: '', merchant: place ? place.name : '', discount: '', branches: '', ends_on: '', source_url: '', details: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.bank && f.merchant.trim().length >= 2 && f.discount.trim().length >= 2;
  async function submit() {
    setBusy(true);
    try {
      const u = await ensureUser();
      const { error } = await supabase.from('card_promos').insert({
        source: 'community', status: 'pending', created_by: u.id, bank: f.bank, merchant: f.merchant.trim().slice(0, 120),
        match_words: matchWords(f.merchant), google_place_id: place && f.branches.trim() ? place.id : null,
        discount: f.discount.trim().slice(0, 80), branches: f.branches.trim().slice(0, 160) || null,
        ends_on: f.ends_on || null, source_url: /^https?:\/\//.test(f.source_url.trim()) ? f.source_url.trim().slice(0, 500) : null,
        details: f.details.trim().slice(0, 400) || null, cards: `${f.bank} cards`,
      });
      if (error) throw error;
      setDone('Thanks! We’ll check it and post it soon.');
    } catch (e) {
      setDone('Couldn’t send it. Check your connection and try again.');
    }
    setBusy(false);
  }
  return (
    <Sheet title="Share a card promo" onClose={onClose} tall>
      {done ? (
        <div className="stack-12"><Notice>{done}</Notice><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      ) : (
        <div className="stack-12">
          <label className="field"><span className="field-label">Bank</span>
            <select value={f.bank} onChange={set('bank')}><option value="">Choose…</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select>
          </label>
          <label className="field"><span className="field-label">Restaurant</span><input value={f.merchant} onChange={set('merchant')} placeholder="e.g. Mendokoro Ramenba" /></label>
          <label className="field"><span className="field-label">The promo</span><input value={f.discount} onChange={set('discount')} placeholder="e.g. 20% off, free dessert" /></label>
          <label className="field"><span className="field-label">Which branches (optional)</span><input value={f.branches} onChange={set('branches')} placeholder="Leave empty if all branches" /></label>
          <label className="field"><span className="field-label">Ends on (optional)</span><input type="date" value={f.ends_on} onChange={set('ends_on')} /></label>
          <label className="field"><span className="field-label">Link to the promo (optional)</span><input value={f.source_url} onChange={set('source_url')} placeholder="https://… bank or restaurant page" inputMode="url" /></label>
          <label className="field"><span className="field-label">Conditions (optional)</span><textarea rows={2} value={f.details} onChange={set('details')} placeholder="e.g. min. spend ₱2,000, weekdays only" /></label>
          <button className="btn btn-primary" disabled={!ok || busy} onClick={submit}>{busy ? 'Sending…' : 'Send for review'}</button>
          <p className="tiny muted">We check every promo before it goes live.</p>
        </div>
      )}
    </Sheet>
  );
}

export function PromosAdmin() {
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const load = () => {
    supabase.from('card_promos').select('*').eq('status', 'pending').order('created_at', { ascending: false }).then(({ data }) => setRows(data || []));
    supabase.from('card_promos').select('bank', { count: 'exact' }).eq('status', 'live').then(({ data, count }) => {
      const by = {}; (data || []).forEach((r) => { by[r.bank] = (by[r.bank] || 0) + 1; });
      setStats({ count, by });
    });
  };
  useEffect(load, []);
  async function review(id, status) {
    await supabase.from('card_promos').update({ status }).eq('id', id);
    load();
  }
  return (
    <div className="stack-12">
      <ImportPromos onDone={load} />
      {stats && <p className="small muted">{stats.count || 0} live promos · {Object.entries(stats.by).map(([b, n]) => `${b} ${n}`).join(' · ')}</p>}
      {!rows && <Spinner />}
      {rows && rows.length === 0 && <Empty icon="tag" title="No promos waiting">Promos people share show up here for approval.</Empty>}
      {(rows || []).map((p) => (
        <div key={p.id} className="stack-6">
          <PromoCard p={p} />
          <div className="row-6">
            <button className="btn btn-primary" onClick={() => review(p.id, 'live')}>Approve</button>
            <button className="btn btn-quiet" onClick={() => review(p.id, 'rejected')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// On a restaurant page: promos for your cards (or all banks if you haven't picked), others behind a tap.
export function CardPromosHere({ place }) {
  const promos = usePromos();
  const cards = useMyCards();
  const [showAll, setShowAll] = useState(false);
  const [editCards, setEditCards] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const all = promosFor(place, promos, null);
  const mine = cards.length ? all.filter((p) => cards.includes(p.bank)) : all;
  const others = all.length - mine.length;
  const list = showAll ? all : mine;
  return (
    <section className="promo-strip">
      {list.length > 0 && <h3 className="eyebrow">💳 Card promos here</h3>}
      {list.map((p) => <PromoCard key={p.id} p={p} />)}
      {others > 0 && !showAll && (
        <button className="link-btn left" onClick={() => setShowAll(true)}>
          {mine.length ? `+ ${others} more for other banks` : `${others} card promo${others === 1 ? '' : 's'} here for other banks — show`}
        </button>
      )}
      <div className="row-6">
        {all.length > 0 && <button className="link-btn left" onClick={() => setEditCards(true)}>{cards.length ? 'My cards' : 'Set my cards'}</button>}
        <button className="link-btn left" onClick={() => setSubmitting(true)}>Know a card promo here? Share it</button>
      </div>
      {editCards && <MyCardsSheet onClose={() => setEditCards(false)} />}
      {submitting && <SubmitPromoSheet place={place} onClose={() => setSubmitting(false)} />}
    </section>
  );
}

const toB64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});

// Admin: add promos from a bank page that blocks our reader (e.g. BDO). Paste the page text or attach screenshots.
function ImportPromos({ onDone }) {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState('BDO');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [shots, setShots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  async function go() {
    setBusy(true); setResult(null);
    try {
      const images = [];
      for (const f of shots.slice(0, 5)) images.push(await toB64(await compressImage(f, 1600, 0.8)));
      const { data } = await supabase.auth.getSession();
      const token = data && data.session && data.session.access_token;
      const r = await fetch('/api/cron/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ bank, url: url.trim(), text, images }),
      });
      const d = await r.json().catch(() => ({}));
      setResult(d);
      if (d.saved) { setText(''); setShots([]); setUrl(''); loadPromos(true); onDone && onDone(); }
    } catch (e) {
      setResult({ error: 'Couldn’t send it. Check your connection.' });
    }
    setBusy(false);
  }
  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="plus" size={18} /> Add promos from a bank page</button>;
  return (
    <div className="card stack-10">
      <span className="strong">Add promos from a bank page</span>
      <span className="small muted">For banks that block our reader (like BDO). Open the promo page on your phone or computer, then either select all the text and paste it here, or take screenshots. The AI picks out the restaurant promos and they go live right away.</span>
      <label className="field"><span className="field-label">Bank</span>
        <select value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select>
      </label>
      <label className="field"><span className="field-label">Link to the page (recommended)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.bdo.com.ph/…" inputMode="url" /></label>
      <label className="field"><span className="field-label">Page text</span><textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole page here (select all → copy → paste)" /></label>
      <label className="field"><span className="field-label">…or screenshots (up to 5)</span>
        <input type="file" accept="image/*" multiple onChange={(e) => setShots(Array.from(e.target.files || []).slice(0, 5))} />
      </label>
      <button className="btn btn-primary" disabled={busy || (!text.trim() && !shots.length)} onClick={go}>{busy ? 'Reading… (up to a minute)' : 'Read and add promos'}</button>
      {result && result.error && <Notice tone="warn">{result.error}</Notice>}
      {result && !result.error && (
        <Notice>{result.saved ? `Added ${result.saved} promo${result.saved === 1 ? '' : 's'}: ${result.promos.slice(0, 8).map((p) => `${p.merchant} (${p.discount})`).join(', ')}${result.promos.length > 8 ? '…' : ''}` : 'No restaurant promos found on that page.'}</Notice>
      )}
      <button className="link-btn left" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
