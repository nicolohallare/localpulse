import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, supabase, distanceM, fmtDistance, fmtCount, timeAgo, matchMichelin, DISTINCTION } from '../lib';
import { logPlay, game } from '../game';
import { Icon, PlacePhoto, Spinner, Notice, Empty, ScoreBadge, Sheet, GoButtons } from '../ui';
import MapView from '../MapView';

const CRAVINGS = ['Sisig', 'Lechon', 'Ramen', 'Samgyup', 'Kare-kare', 'Chicken wings', 'Pizza', 'Burger', 'Milk tea', 'Coffee', 'Halo-halo', 'Bulalo'];
const FILTERS = [
  { k: 'open', label: 'Open now', test: (p) => p.openNow === true },
  { k: 'p1', label: '₱', test: (p) => p.price === '₱' },
  { k: 'p2', label: '₱₱', test: (p) => p.price === '₱₱' },
  { k: 'p3', label: '₱₱₱+', test: (p) => p.price === '₱₱₱' || p.price === '₱₱₱₱' },
  { k: 'groups', label: 'Groups', amen: true, test: (p) => p.amenities && p.amenities.groups },
  { k: 'kids', label: 'Kid-friendly', amen: true, test: (p) => p.amenities && p.amenities.kids },
  { k: 'pets', label: 'Pet-friendly', amen: true, test: (p) => p.amenities && p.amenities.pets },
  { k: 'parking', label: 'Parking', amen: true, test: (p) => p.amenities && p.amenities.parking },
];

function applyFilters(list, active) {
  if (!active.length) return list;
  const prices = active.filter((k) => k.startsWith('p'));
  const others = active.filter((k) => !k.startsWith('p'));
  return list.filter((p) =>
    (!prices.length || prices.some((k) => FILTERS.find((f) => f.k === k).test(p))) &&
    others.every((k) => FILTERS.find((f) => f.k === k).test(p)));
}

const MODES = [
  { k: 'near', label: 'Near me' },
  { k: 'michelin', label: 'Michelin-listed' },
  { k: 'top', label: 'Most checked-in' },
];

export default function Discover({ loc, locNote, onRetryLocation, michelin, onOpen, onOpenProfile, onAddVideo }) {
  const [mode, setMode] = useState('near');
  const [places, setPlaces] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [top, setTop] = useState(null);
  const [opening, setOpening] = useState(null);
  const [trending, setTrending] = useState(null);
  const [player, setPlayer] = useState(null);
  const [related, setRelated] = useState({});
  const [filters, setFilters] = useState([]);
  const [craving, setCraving] = useState(null);
  const [crave, setCrave] = useState(null);
  const amen = filters.some((k) => FILTERS.find((f) => f.k === k).amen);
  const trendAsked = useRef(false);

  const loadStats = useCallback(async (list) => {
    const ids = list.map((p) => p.id);
    if (!ids.length) return;
    const { data } = await supabase.from('place_stats').select('*').in('google_place_id', ids);
    if (!Array.isArray(data)) return;
    const fresh = Object.fromEntries(data.map((r) => [r.google_place_id, r]));
    setStats((s) => ({ ...s, ...fresh }));
  }, []);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.nearby(loc.lat, loc.lng, 1500, amen);
      setPlaces(list);
      loadStats(list);
      if (!trendAsked.current) {
        trendAsked.current = true;
        api.trending(loc.lat, loc.lng, areaOf(list))
          .then((d) => setTrending(d))
          .catch(() => setTrending({ items: [] }));
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [loc.lat, loc.lng, loadStats, amen]);

  useEffect(() => {
    if (query.trim()) doSearch(query.trim()); else loadNearby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadNearby]);

  useEffect(() => {
    if (!craving) { setCrave(null); return; }
    let off = false;
    setCrave(null);
    (async () => {
      const [ranked, google] = await Promise.all([
        game.dishRank(craving.toLowerCase()).catch(() => []),
        api.search(craving, loc.lat, loc.lng, amen).catch(() => []),
      ]);
      const names = await api.names((ranked || []).map((r) => r.google_place_id)).catch(() => []);
      const byId = Object.fromEntries(names.map((n) => [n.id, n]));
      if (!off) {
        setCrave({
          locals: (ranked || []).map((r) => ({ ...r, ...(byId[r.google_place_id] || {}) })).filter((r) => r.name),
          google: (google || []).map((p) => ({ ...p, dist: distanceM(loc, p) })),
        });
        loadStats(google || []);
      }
    })();
    return () => { off = true; };
  }, [craving, loc, amen, loadStats]);

  useEffect(() => {
    const items = (trending && trending.items) || [];
    if (!items.length) return;
    let off = false;
    const ids = items.map((it) => it.place.id);
    (async () => {
      const [{ data: imported }, found] = await Promise.all([
        supabase.from('place_videos').select('google_place_id,url,creator_handle,title').in('google_place_id', ids).eq('platform', 'tiktok'),
        Promise.all(ids.map((id) => api.discoverTiktok(id).then((d) => [id, (d && d.videos) || []]).catch(() => [id, []]))),
      ]);
      const by = {};
      (imported || []).forEach((v) => { (by[v.google_place_id] = by[v.google_place_id] || []).push({ url: v.url, handle: v.creator_handle, title: v.title }); });
      found.forEach(([id, vids]) => vids.forEach((v) => { (by[id] = by[id] || []).push({ url: v.url, handle: v.handle ? `@${v.handle}` : v.author, title: v.title, videoId: v.videoId, thumb: v.thumb }); }));
      // De-duplicate by video id in the URL, keep up to 4 per place.
      Object.keys(by).forEach((id) => {
        const seen = new Set();
        by[id] = by[id].filter((v) => {
          const k = (String(v.url).match(/video\/(\d+)/) || [])[1] || v.url;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).slice(0, 4);
      });
      if (!off) setRelated(by);
    })();
    return () => { off = true; };
  }, [trending]);

  // Open the player for a trending place: its YouTube video first, then its TikToks.
  async function openClips(it, start = 0) {
    const tiks = related[it.place.id] || [];
    const clips = [
      { kind: 'youtube', id: it.video.id, title: it.video.title, channel: it.video.channel, thumb: it.video.thumb, views: it.video.views },
      ...tiks.map((t) => ({ kind: 'tiktok', id: t.videoId || null, url: t.url, title: t.title, channel: t.handle, thumb: t.thumb })),
    ];
    setPlayer({ place: it.place, clips, idx: start });
    playClip(it.place, clips[start]);
    // Fill in TikTok video ids / fresh thumbnails for clips that came from imports.
    const filled = await Promise.all(clips.map(async (c) => {
      if (c.kind !== 'tiktok' || (c.id && c.thumb)) return c;
      const m = await api.oembed(c.url).catch(() => null);
      return m ? { ...c, id: c.id || m.videoId, thumb: m.thumb || c.thumb, title: c.title || m.title, channel: c.channel || (m.handle ? `@${m.handle}` : m.author) } : c;
    }));
    setPlayer((cur) => (cur && cur.place.id === it.place.id ? { ...cur, clips: filled } : cur));
  }

  function playClip(place, c) {
    if (!c) return;
    if (c.kind === 'youtube') logPlay({ placeId: place.id, ref: c.id, platform: 'youtube', creator: c.channel });
    else logPlay({ placeId: place.id, ref: c.url, platform: 'tiktok', creator: c.channel });
  }

  const toggleFilter = (k) => setFilters((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

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
    if (q) doSearch(q);
  }

  async function doSearch(q) {
    setSearching(true);
    setError(null);
    setMode('near');
    try {
      setCraving(null);
      const list = await api.search(q, loc.lat, loc.lng, amen);
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

  const sorted = applyFilters(places.map((p) => ({ ...p, dist: distanceM(loc, p) })), filters);

  return (
    <div className="screen">
      <header className="disc-head">
        <div className="row-between">
          <button className="pill-btn" onClick={onRetryLocation} aria-label={`Location: ${loc.label}. Tap to change`}>
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
          <div className="chips filter-chips" aria-label="Filters">
            {FILTERS.map((f) => (
              <button key={f.k} className={`chip chip-sm ${filters.includes(f.k) ? 'chip-soft-on' : ''}`} aria-pressed={filters.includes(f.k)} onClick={() => toggleFilter(f.k)}>{f.label}</button>
            ))}
          </div>
          {!query && (
            <section className="section crave">
              <h2 className="h3">What are you craving?</h2>
              <div className="crave-rail">
                {CRAVINGS.map((c) => (
                  <button key={c} className={`crave-chip ${craving === c ? 'crave-on' : ''}`} aria-pressed={craving === c} onClick={() => setCraving(craving === c ? null : c)}>{c}</button>
                ))}
              </div>
            </section>
          )}
          {craving && (
            <section className="section stack-12">
              <div className="row-between"><h2 className="h2">Best {craving.toLowerCase()} near you</h2><button className="link-btn" onClick={() => setCraving(null)}>Clear</button></div>
              {!crave && <Spinner label={`Finding the best ${craving.toLowerCase()}…`} />}
              {crave && crave.locals.length > 0 && (
                <div className="stack-8">
                  <span className="eyebrow">Locals say order it here</span>
                  {crave.locals.map((r, i) => (
                    <button key={r.google_place_id} className="top-row" onClick={() => onOpen(r.google_place_id)}>
                      <span className="top-rank">{i + 1}</span>
                      <span className="top-main"><span className="row-title">{r.name}</span><span className="muted small">{r.address || ''}</span></span>
                      <span className="top-score"><span className="dish-chip dish-good">👍 {r.recommends}</span>{r.skips > 0 && <span className="tiny muted">👎 {r.skips}</span>}</span>
                    </button>
                  ))}
                </div>
              )}
              {crave && crave.locals.length === 0 && (
                <p className="small muted">No locals have rated {craving.toLowerCase()} nearby yet. Tried it somewhere? Check in and tell people whether to order it.</p>
              )}
              {crave && crave.google.length > 0 && (
                <div className="place-list">
                  <span className="eyebrow">More {craving.toLowerCase()} spots on Google Maps</span>
                  {applyFilters(crave.google, filters).map((p) => (
                    <PlaceRow key={p.id} place={p} stat={stats[p.id]} michelin={matchMichelin(p.name, michelin)} onOpen={() => onOpen(p.id)} />
                  ))}
                </div>
              )}
            </section>
          )}
          {!query && !craving && <TrendingRail data={trending} loc={loc} onOpen={onOpen} related={related} onPlay={openClips} />}
          {!query && !craving && (
            <section className="section">
              <button className="creator-cta" onClick={onAddVideo}>
                <span className="cta-icon"><Icon name="video" size={22} /></span>
                <span className="grow">
                  <span className="strong block">Saw a food TikTok?</span>
                  <span className="small muted">Pin it to the restaurant — we’ll find the place for you.</span>
                </span>
                <Icon name="plus" size={20} />
              </button>
            </section>
          )}
          {!craving && <section className="section">
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
            {!loading && places.length > 0 && sorted.length === 0 && <p className="small muted">No places match those filters. Try removing one.</p>}
            {sorted.length > 0 && <p className="attribution">Places, ratings and photos from Google Maps</p>}
          </section>}
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
      {player && (() => {
        const c = player.clips[player.idx];
        const pick = (i) => { setPlayer({ ...player, idx: i }); playClip(player.place, player.clips[i]); };
        return (
          <Sheet title={player.place.name} onClose={() => setPlayer(null)} tall>
            {c.kind === 'youtube' ? (
              <div className="player">
                <iframe title={c.title || 'YouTube video'} src={`https://www.youtube-nocookie.com/embed/${c.id}?autoplay=1&playsinline=1&rel=0`}
                  allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            ) : c.id ? (
              <div className="player player-tall">
                <iframe title={c.title || 'TikTok video'} src={`https://www.tiktok.com/embed/v2/${c.id}`}
                  allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            ) : <Spinner label="Loading TikTok…" />}
            <div className="stack-4">
              <span className="tiny muted">{c.kind === 'youtube' ? 'YouTube' : 'TikTok'}{c.channel ? ` · ${c.channel}` : ''}</span>
              {c.title && <p className="strong clamp-3">{c.title}</p>}
            </div>
            {player.clips.length > 1 && (
              <div className="stack-8">
                <span className="field-label">More videos about {player.place.name}</span>
                <div className="clip-rail">
                  {player.clips.map((x, i) => (
                    <button key={`${x.kind}-${x.url || x.id}`} className={`clip ${i === player.idx ? 'clip-on' : ''} clip-${x.kind}`} onClick={() => pick(i)} aria-pressed={i === player.idx}>
                      {x.thumb && <img src={x.thumb} alt="" loading="lazy" />}
                      <span className="clip-tag">{x.kind === 'youtube' ? 'YouTube' : 'TikTok'}</span>
                      {i === player.idx && <span className="clip-now">Playing</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="stack-8">
              <span className="field-label">Go to {player.place.name}</span>
              <GoButtons place={player.place} />
              <button className="soft-btn" onClick={() => { const id = player.place.id; setPlayer(null); onOpen(id); }}>See all takes on LocalPulse</button>
            </div>
            <a className="link-out" href={c.kind === 'youtube' ? `https://www.youtube.com/watch?v=${c.id}` : c.url} target="_blank" rel="noreferrer">
              Open on {c.kind === 'youtube' ? 'YouTube' : 'TikTok'} <Icon name="external" size={14} />
            </a>
          </Sheet>
        );
      })()}
    </div>
  );
}

// Most common city/area in the nearby results' addresses, e.g. "Taguig".
function areaOf(list) {
  const count = {};
  list.forEach((p) => {
    const parts = String(p.address || '').split(',').map((x) => x.trim()).filter(Boolean);
    const a = parts[parts.length - 1];
    if (a && a.length < 40) count[a] = (count[a] || 0) + 1;
  });
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'Metro Manila';
}

function TrendingRail({ data, loc, onOpen, onPlay, related = {} }) {
  if (data && (!data.items || data.items.length === 0)) return null;
  return (
    <section className="section trend">
      <div className="row-between">
        <h2 className="h2">Trending near you</h2>
        {data && data.area && <span className="tiny muted">{data.basis === 'drive' ? `Within ${data.limit} min drive` : `Within ${data.limit} km`} · last {data.days} days</span>}
      </div>
      {!data && <Spinner label="Finding what food creators are talking about…" />}
      {data && (
        <div className="trend-rail">
          {data.items.map((it, i) => {
            const d = distanceM(loc, it.place);
            return (
              <article key={it.place.id} className="trend-card">
                <button className="trend-thumb" onClick={() => onPlay(it)} aria-label={`Play: ${it.video.title}`}>
                  {it.video.thumb && <img src={it.video.thumb} alt="" loading="lazy" />}
                  <span className="trend-rank">#{i + 1}</span>
                  <span className="play"><Icon name="play" size={20} /></span>
                  {it.video.views ? <span className="trend-views">{fmtCount(it.video.views)} views</span> : null}
                </button>
                <button className="trend-body" onClick={() => onOpen(it.place.id)}>
                  <span className="row-title-sm clamp-1">{it.place.name}</span>
                  <span className="tiny muted clamp-1">{[it.minutes != null ? `🚗 ~${it.minutes} min` : (d != null ? fmtDistance(d) : null), it.place.type].filter(Boolean).join(' · ')}</span>
                  <span className="tiny muted clamp-1">▶ {it.video.channel} · {timeAgo(it.video.published)}</span>
                </button>
                {(related[it.place.id] || []).length > 0 && (
                  <button className="trend-tt" onClick={() => onPlay(it, 1)}>
                    <span className="tt-stack">
                      {(related[it.place.id] || []).slice(0, 3).map((t) => <span key={t.url} className="tt-dot">{t.thumb ? <img src={t.thumb} alt="" /> : '♪'}</span>)}
                    </span>
                    🎵 {related[it.place.id].length} TikTok{related[it.place.id].length === 1 ? '' : 's'} about it
                  </button>
                )}
                <div className="trend-go"><GoButtons place={it.place} size="sm" /></div>
              </article>
            );
          })}
        </div>
      )}
      {data && <p className="tiny muted">Most-viewed food videos from YouTube, plus TikToks about the same places, matched on Google Maps.</p>}
    </section>
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
