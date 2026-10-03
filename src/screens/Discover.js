import React, { useCallback, useEffect, useState } from 'react';
import { api, supabase, distanceM, fmtDistance, matchMichelin, DISTINCTION } from '../lib';
import { Icon, PlacePhoto, Spinner, Notice, Empty, ScoreBadge } from '../ui';
import MapView from '../MapView';

const MODES = [
  { k: 'near', label: 'Near me' },
  { k: 'michelin', label: 'Michelin-listed' },
  { k: 'top', label: 'Most checked-in' },
];

export default function Discover({ loc, locNote, onRetryLocation, michelin, onOpen, onOpenProfile }) {
  const [mode, setMode] = useState('near');
  const [places, setPlaces] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [top, setTop] = useState(null);
  const [opening, setOpening] = useState(null);

  const loadStats = useCallback(async (list) => {
    const ids = list.map((p) => p.id);
    if (!ids.length) return;
    const { data } = await supabase.from('place_stats').select('*').in('google_place_id', ids);
    if (data) setStats((s) => ({ ...s, ...Object.fromEntries(data.map((r) => [r.google_place_id, r])) }));
  }, []);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.nearby(loc.lat, loc.lng, 1500);
      setPlaces(list);
      loadStats(list);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [loc.lat, loc.lng, loadStats]);

  useEffect(() => { loadNearby(); }, [loadNearby]);

  useEffect(() => {
    if (mode !== 'top' || top) return;
    (async () => {
      const { data } = await supabase.from('place_stats').select('*').order('visit_count', { ascending: false }).limit(20);
      const rows = data || [];
      const names = await api.names(rows.map((r) => r.google_place_id)).catch(() => []);
      const byId = Object.fromEntries(names.map((n) => [n.id, n]));
      setTop(rows.map((r) => ({ ...r, ...(byId[r.google_place_id] || {}) })));
    })();
  }, [mode, top]);

  async function runSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setMode('near');
    try {
      const list = await api.search(q, loc.lat, loc.lng);
      setPlaces(list);
      loadStats(list);
    } catch (err) {
      setError(err);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery('');
    loadNearby();
  }

  async function openMichelin(l) {
    setOpening(l.id);
    try {
      const res = await api.search(`${l.name} restaurant ${l.city || 'Philippines'}`, loc.lat, loc.lng);
      const hit = res.find((p) => matchMichelin(p.name, [l])) || res[0];
      if (hit) onOpen(hit.id);
    } catch (e) {
      setError(e);
    } finally {
      setOpening(null);
    }
  }

  const sorted = places.map((p) => ({ ...p, dist: distanceM(loc, p) }));

  return (
    <div className="screen">
      <header className="disc-head">
        <div className="row-between">
          <button className="pill-btn" onClick={onRetryLocation} aria-label={`Location: ${loc.label}. Tap to refresh`}>
            <Icon name="pin" size={18} className="ube" />
            <span>{loc.label}</span>
          </button>
          <button className="avatar-btn" onClick={onOpenProfile} aria-label="Your profile"><Icon name="user" size={22} /></button>
        </div>
        <h1 className="display">Where to eat<br />tonight?</h1>
        <form className="search" onSubmit={runSearch} role="search">
          <Icon name="search" size={20} />
          <label className="sr-only" htmlFor="q">Search places</label>
          <input id="q" type="search" enterKeyHint="search" placeholder="Restaurant, dish or area"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" className="link-btn" onClick={clearSearch}>Clear</button>}
        </form>
        {locNote && <p className="tiny muted">{locNote}</p>}
      </header>

      <div className="chips" role="tablist" aria-label="Filter">
        {MODES.map((m) => (
          <button key={m.k} role="tab" aria-selected={mode === m.k} className={`chip ${mode === m.k ? 'chip-on' : ''}`}
            onClick={() => setMode(m.k)}>{m.label}</button>
        ))}
      </div>

      {mode === 'near' && (
        <>
          <MapView center={loc} places={sorted} stats={stats} onPick={(p) => onOpen(p.id)} />
          <section className="section">
            <h2 className="h2">{query && !searching ? `Results for “${query}”` : 'Popular near you'}</h2>
            {(loading || searching) && <Spinner label={searching ? 'Searching…' : 'Finding places near you…'} />}
            {error && !loading && (
              <Notice tone="warn" title="Couldn’t load places" action={<button className="btn btn-quiet" onClick={loadNearby}>Try again</button>}>
                {error.message}{error.hint ? ` — ${error.hint}` : ''}
              </Notice>
            )}
            {!loading && !searching && !error && sorted.length === 0 && (
              <Empty title="Nothing found here">Try a different search or area.</Empty>
            )}
            <div className="place-list">
              {sorted.map((p) => (
                <PlaceRow key={p.id} place={p} stat={stats[p.id]} michelin={matchMichelin(p.name, michelin)} onOpen={() => onOpen(p.id)} />
              ))}
            </div>
            {sorted.length > 0 && <p className="attribution">Places, ratings and photos from Google Maps</p>}
          </section>
        </>
      )}

      {mode === 'michelin' && (
        <section className="section">
          <h2 className="h2">MICHELIN Guide Philippines</h2>
          <p className="muted small">Restaurants recognised in the 2026 selection. Tap one to see it on LocalPulse.</p>
          <div className="place-list">
            {(michelin || []).map((l) => (
              <button key={l.id} className="mich-row" onClick={() => openMichelin(l)} disabled={opening === l.id}>
                <span className="mich-dist">{DISTINCTION[l.distinction]}</span>
                <span className="mich-name">{l.name}</span>
                <span className="muted small">{opening === l.id ? 'Opening…' : (l.city || 'Metro Manila & environs')}</span>
              </button>
            ))}
          </div>
          <a className="link-out" href="https://guide.michelin.com/en/article/michelin-guide-ceremony/philippines-full-selection-2026" target="_blank" rel="noreferrer">
            Full selection on guide.michelin.com <Icon name="external" size={14} />
          </a>
        </section>
      )}

      {mode === 'top' && (
        <section className="section">
          <h2 className="h2">Most checked-in on LocalPulse</h2>
          {!top && <Spinner label="Loading…" />}
          {top && top.length === 0 && (
            <Empty icon="check" title="No check-ins yet">Be the first: open a place you’re at and tap “Check in here”.</Empty>
          )}
          <div className="place-list">
            {(top || []).map((r, i) => (
              <button key={r.google_place_id} className="top-row" onClick={() => onOpen(r.google_place_id)}>
                <span className="top-rank">{i + 1}</span>
                <span className="top-main">
                  <span className="row-title">{r.name || 'Place'}</span>
                  <span className="muted small">{r.address || ''}</span>
                </span>
                <span className="top-score">
                  <ScoreBadge score={r.avg_score} />
                  <span className="tiny muted">{r.visit_count} visit{r.visit_count === 1 ? '' : 's'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlaceRow({ place: p, stat, michelin, onOpen }) {
  return (
    <button className="place-row" onClick={onOpen}>
      <PlacePhoto photo={p.photos[0]} width={300} className="place-thumb" alt="" />
      <span className="place-main">
        <span className="row-title">{p.name}</span>
        <span className="muted small">{[p.type, fmtDistance(p.dist), p.price].filter(Boolean).join(' · ')}</span>
        <span className="score-line">
          {stat ? (
            <><ScoreBadge score={stat.avg_score} /><span className="small strong">LocalPulse</span></>
          ) : (
            <span className="small muted">No check-ins yet</span>
          )}
          {p.rating != null && <span className="small muted">★ {p.rating.toFixed(1)} Google</span>}
        </span>
        {michelin && <span className="mich-tag">{DISTINCTION[michelin.distinction]} {michelin.year}</span>}
        {p.openNow === false && <span className="tiny closed">Closed now</span>}
      </span>
    </button>
  );
}
