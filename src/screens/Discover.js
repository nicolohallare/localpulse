import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, supabase, distanceM, fmtDistance, fmtCount, timeAgo, tiktokEmbed, matchMichelin, DISTINCTION, DISTINCTION_RANK, currencySymbol, priceLabel, getCountry, COUNTRY_NAME } from '../lib';
import { logPlay, game } from '../game';
import { Banana, Icon, PlacePhoto, Spinner, Notice, Empty, ScoreBadge, Sheet, GoButtons } from '../ui';
import MapView from '../MapView';

const CRAVINGS_BY_COUNTRY = {
  PH: ['Sisig', 'Lechon', 'Ramen', 'Samgyup', 'Kare-kare', 'Chicken wings', 'Pizza', 'Burger', 'Milk tea', 'Coffee', 'Halo-halo', 'Bulalo'],
  TW: ['Beef noodles', 'Xiao long bao', 'Braised pork rice', 'Hot pot', 'Bubble tea', 'Dumplings', 'Fried chicken', 'Shaved ice', 'Breakfast', 'Ramen', 'Coffee', 'Night market'],
};
const DEFAULT_CRAVINGS = ['Noodles', 'Dumplings', 'Ramen', 'Pizza', 'Burger', 'Fried chicken', 'Sushi', 'Coffee', 'Dessert', 'Bubble tea', 'Breakfast', 'Street food'];
const cravingsFor = (cc) => CRAVINGS_BY_COUNTRY[cc] || DEFAULT_CRAVINGS;
const FILTERS = [
  { k: 'open', label: 'Open now', test: (p) => p.openNow === true },
  { k: 'p1', label: () => currencySymbol(), test: (p) => p.priceLevel === 1 },
  { k: 'p2', label: () => currencySymbol().repeat(2), test: (p) => p.priceLevel === 2 },
  { k: 'p3', label: () => `${currencySymbol().repeat(3)}+`, test: (p) => p.priceLevel >= 3 },
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

export default function Discover({ loc, locNote, onRetryLocation, michelin, onOpen, onOpenProfile, onAddVideo, active = true }) {
  const [headline] = useState(() => mealLine());
  const [michSort, setMichSort] = useState('near');
  const [pickSort, setPickSort] = useState('best');
  const [showMap, setShowMap] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [why, setWhy] = useState({});
  const gotWhy = useCallback((id, w) => setWhy((cur) => (cur[id] === w ? cur : { ...cur, [id]: w })), []);
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
  // Stop the video when you leave Discover (the screen stays open in the background for Back).
  useEffect(() => { if (!active) setPlayer(null); }, [active]);
  const [related, setRelated] = useState({});
  const [filters, setFilters] = useState([]);
  const [craving, setCraving] = useState(null);
  const [crave, setCrave] = useState(null);
  const amen = filters.some((k) => FILTERS.find((f) => f.k === k).amen);
  const trendKey = useRef('');
  const nearbyReq = useRef(0);

  const loadStats = useCallback(async (list) => {
    const ids = list.map((p) => p.id);
    if (!ids.length) return;
    const { data } = await supabase.from('place_stats').select('*').in('google_place_id', ids);
    if (!Array.isArray(data)) return;
    const fresh = Object.fromEntries(data.map((r) => [r.google_place_id, r]));
    setStats((s) => ({ ...s, ...fresh }));
  }, []);

  const loadNearby = useCallback(async () => {
    // Wait for the phone's location — don't load the fallback area first.
    if (loc.label === 'Finding you…') { setLoading(true); return; }
    const req = ++nearbyReq.current;
    setLoading(true);
    setError(null);
    try {
      const list = await api.nearby(loc.lat, loc.lng, 1500, amen);
      if (req !== nearbyReq.current) return; // a newer location answered already
      setPlaces(list);
      loadStats(list);
      // Refresh trending whenever you're somewhere new (about 1 km), but not while still finding you.
      const key = `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}`;
      if (key !== trendKey.current && loc.label !== 'Finding you…') {
        trendKey.current = key;
        setTrending(null);
        api.trending(loc.lat, loc.lng, areaOf(list))
          .then((d) => { if (trendKey.current === key) { setTrending(d); loadStats(((d && d.items) || []).map((it) => it.place)); } })
          .catch(() => setTrending({ items: [] }));
      }
    } catch (e) {
      if (req === nearbyReq.current) setError(e);
    } finally {
      if (req === nearbyReq.current) setLoading(false);
    }
  }, [loc.lat, loc.lng, loc.label, loadStats, amen]);

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
      found.forEach(([id, vids]) => vids.forEach((v) => { (by[id] = by[id] || []).push({ url: v.url, handle: v.handle ? `@${v.handle}` : v.author, title: v.title, videoId: v.videoId, thumb: v.thumb, posted: v.posted }); }));
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
      ...(it.videos && it.videos.length ? it.videos : [it.video]).map((v) => ({ kind: 'youtube', id: v.id, title: v.title, channel: v.channel, thumb: v.thumb, views: v.views, posted: v.published })),
      ...tiks.map((t) => ({ kind: 'tiktok', id: t.videoId || null, url: t.url, title: t.title, channel: t.handle, thumb: t.thumb, posted: t.posted })),
    ];
    setPlayer({ place: it.place, clips, idx: start, why: it.why, order: it.order, say: null });
    api.summary(it.place.id).then((sm) => setPlayer((cur) => (cur && cur.place.id === it.place.id ? { ...cur, say: sm } : cur))).catch(() => {});
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
    nearbyReq.current++; // a slow nearby answer must not replace search results
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
    if (l.google_place_id) { onOpen(l.google_place_id); return; }
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
  const cc = getCountry();
  const michHere = (michelin || []).filter((l) => (l.country || 'PH') === cc);
  const michSource = michHere.length ? michHere : (michelin || []);
  const michCountry = michHere.length ? cc : 'PH';
  const michWithKm = michSource.map((l) => {
    const d = l.lat != null && loc && !loc.isDefault ? distanceM(loc, { lat: l.lat, lng: l.lng }) : null;
    return { ...l, km: d != null ? d / 1000 : null };
  });
  const byAward = (a, b) => (DISTINCTION_RANK[a.distinction] ?? 9) - (DISTINCTION_RANK[b.distinction] ?? 9) || a.name.localeCompare(b.name);
  const michList = michWithKm.slice().sort(michSort === 'near'
    ? (a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || byAward(a, b)
    : byAward);
  const michNear = michWithKm.filter((l) => l.km != null && l.km <= 6).sort((a, b) => a.km - b.km).slice(0, 6);
  // Top picks: nearby places + trending places, scored on rating, check-ins, buzz, MICHELIN, distance and open-now.
  const trendById = Object.fromEntries(((trending && trending.items) || []).map((it) => [it.place.id, it]));
  const pool = (() => {
    if (query) return sorted;
    const seen = new Set(sorted.map((p) => p.id));
    const extra = ((trending && trending.items) || []).map((it) => ({ ...it.place, dist: distanceM(loc, it.place) })).filter((p) => !seen.has(p.id));
    return [...sorted, ...applyFilters(extra, filters)];
  })();
  const hour = new Date().getHours();
  const ranked = pool.map((p) => {
    const m = matchMichelin(p.name, michelin);
    const { score, reasons } = rankPlace(p, { stat: stats[p.id], buzz: trendById[p.id], mich: m, hour });
    return { p, m, score, reasons };
  });
  const sortFns = {
    best: (a, b) => b.score - a.score,
    near: (a, b) => (a.p.dist ?? 1e9) - (b.p.dist ?? 1e9),
    rated: (a, b) => ((b.p.rating || 0) * Math.min(1, (b.p.ratingCount || 0) / 100)) - ((a.p.rating || 0) * Math.min(1, (a.p.ratingCount || 0) / 100)),
    buzz: (a, b) => (((trendById[b.p.id] || {}).creators || 0) * 10 + ((stats[b.p.id] || {}).visit_count || 0)) - (((trendById[a.p.id] || {}).creators || 0) * 10 + ((stats[a.p.id] || {}).visit_count || 0)) || b.score - a.score,
  };
  const picks = query ? ranked : ranked.slice().sort(sortFns[pickSort] || sortFns.best);
  const shownPicks = query || showAll ? picks : picks.slice(0, 10);
  const whyIds = [...shownPicks.slice(0, 12).map((x) => x.p.id), ...(mode === 'michelin' ? michList : michNear).map((l) => l.google_place_id).filter(Boolean).slice(0, 15)].join(',');
  useEffect(() => { if (whyIds) api.whyMany(whyIds.split(','), gotWhy); }, [whyIds, gotWhy]);

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
        <div className="brand-line">
          <Banana size={62} className="brand-banana" />
          <div>
            <p className="wordmark">Ube Banana</p>
            <p className="brand-tag">Everyone’s a food influencer</p>
          </div>
        </div>
        <h1 className="display">{headline}</h1>
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
          <div className="chips filter-chips" aria-label="Filters">
            {FILTERS.map((f) => (
              <button key={f.k} className={`chip chip-sm ${filters.includes(f.k) ? 'chip-soft-on' : ''}`} aria-pressed={filters.includes(f.k)} onClick={() => toggleFilter(f.k)}>{typeof f.label === 'function' ? f.label() : f.label}</button>
            ))}
          </div>
          {!query && (
            <section className="section crave">
              <h2 className="h3">What are you craving?</h2>
              <div className="crave-rail">
                {cravingsFor(getCountry()).map((c) => (
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
                    <PlaceRow key={p.id} place={p} stat={stats[p.id]} why={why[p.id]} michelin={matchMichelin(p.name, michelin)} onOpen={() => onOpen(p.id)} />
                  ))}
                </div>
              )}
            </section>
          )}
          {!craving && <section className="section">
            <div className="row-between">
              <h2 className="h2">{query && !searching ? `Results for “${query}”` : 'Top picks near you'}</h2>
              <button className="soft-btn map-toggle" onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}><Icon name="pin" size={16} /> {showMap ? 'Hide map' : 'Map'}</button>
            </div>
            {showMap && <div className="map-inline"><MapView center={loc} places={shownPicks.map((x) => x.p)} stats={stats} onPick={(p) => onOpen(p.id)} /></div>}
            {!query && (
              <div className="chips chips-inline" role="tablist" aria-label="Sort picks">
                {PICK_SORTS.map((o) => (
                  <button key={o.k} role="tab" aria-selected={pickSort === o.k} className={`chip chip-sm ${pickSort === o.k ? 'chip-on' : ''}`} onClick={() => setPickSort(o.k)}>{o.label}</button>
                ))}
              </div>
            )}
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
              {shownPicks.map(({ p, m, reasons }, i) => (
                <PlaceRow key={p.id} place={p} stat={stats[p.id]} why={why[p.id]} michelin={m} reasons={reasons}
                  rank={query ? null : i + 1} onOpen={() => onOpen(p.id)} />
              ))}
            </div>
            {!query && picks.length > 10 && (
              <button className="soft-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show top 10' : `Show all ${picks.length} places`}</button>
            )}
            {!query && picks.length > 0 && <p className="tiny muted">Ranked by rating, check-ins, creator buzz, MICHELIN, distance and open now.</p>}
            {!loading && places.length > 0 && sorted.length === 0 && <p className="small muted">No places match those filters. Try removing one.</p>}
            {sorted.length > 0 && <p className="attribution">Places, ratings and photos from Google Maps</p>}
          </section>}
          {!query && !craving && <TrendingRail data={trending} loc={loc} onOpen={onOpen} related={related} onPlay={openClips} />}
          {!query && !craving && michNear.length > 0 && (
            <section className="section">
              <div className="row-between"><h2 className="h2">MICHELIN near you</h2><button className="link-btn" onClick={() => setMode('michelin')}>See all</button></div>
              <div className="mich-rail">
                {michNear.map((l) => (
                  <button key={l.id} className="mich-chip" onClick={() => openMichelin(l)}>
                    <span className="mich-dist">{DISTINCTION[l.distinction]}</span>
                    <span className="strong">{l.name}</span>
                    <span className="tiny muted">{fmtDistance(l.km * 1000)} away</span>
                    {why[l.google_place_id] && why[l.google_place_id].why && <span className="tiny clamp-2 ink">{why[l.google_place_id].why}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
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
        </>
      )}

      {mode === 'michelin' && (
        <section className="section">
          <h2 className="h2">MICHELIN Guide {COUNTRY_NAME[michCountry] || michCountry}</h2>
          <p className="muted small">{michCountry === 'TW' ? 'Starred restaurants' : 'Restaurants'} recognised in the 2026 selection{michSort === 'near' ? ', nearest to you first' : ''}. Tap one to see it on Ube Banana.</p>
          <div className="seg" role="tablist" aria-label="Sort">
            <button role="tab" aria-selected={michSort === 'near'} className={michSort === 'near' ? 'seg-on' : ''} onClick={() => setMichSort('near')}>Nearest</button>
            <button role="tab" aria-selected={michSort === 'award'} className={michSort === 'award' ? 'seg-on' : ''} onClick={() => setMichSort('award')}>By award</button>
          </div>
          <div className="place-list">
            {michList.map((l) => (
              <button key={l.id} className={`mich-row ${l.km != null && l.km <= 5 ? 'mich-near' : ''}`} onClick={() => openMichelin(l)} disabled={opening === l.id}>
                <span className="row-between">
                  <span className="mich-dist">{DISTINCTION[l.distinction]}</span>
                  {l.km != null && <span className="mich-km">{l.km <= 5 ? 'Near you · ' : ''}{fmtDistance(l.km * 1000)}</span>}
                </span>
                <span className="mich-name">{l.name}</span>
                <span className="muted small">{opening === l.id ? 'Opening…' : (l.city || 'Metro Manila & environs')}</span>
                <WhyLine w={why[l.google_place_id]} />
              </button>
            ))}
          </div>
          <a className="link-out" href={michCountry === 'TW' ? 'https://guide.michelin.com/tw/en/selection/taiwan/restaurants' : 'https://guide.michelin.com/en/article/michelin-guide-ceremony/philippines-full-selection-2026'} target="_blank" rel="noreferrer">
            Full selection on guide.michelin.com <Icon name="external" size={14} />
          </a>
        </section>
      )}

      {mode === 'top' && (
        <section className="section">
          <h2 className="h2">Most checked-in on Ube Banana</h2>
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
                <iframe title={c.title || 'TikTok video'} src={tiktokEmbed(c.id)}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              </div>
            ) : <Spinner label="Loading TikTok…" />}
            {c.kind === 'tiktok' && (
              <a className="btn btn-primary" href={c.url} target="_blank" rel="noreferrer">Not playing? Watch on TikTok <Icon name="external" size={14} /></a>
            )}
            {(player.why || (player.order && player.order.length > 0) || (player.say && player.say.summary)) && (
              <div className="why-card">
                {player.why && <p className="why-line">{player.why}</p>}
                {player.order && player.order.length > 0 && <p className="small"><strong>What to order:</strong> {player.order.join(', ')}</p>}
                {player.say && player.say.summary && <p className="small"><strong>What people say:</strong> {player.say.summary}</p>}
                <span className="tiny muted">{player.say && player.say.sources ? player.say.sources : 'From the creator’s video'}</span>
              </div>
            )}
            <div className="stack-4">
              <span className="tiny muted">{c.kind === 'youtube' ? 'YouTube' : 'TikTok'}{c.channel ? ` · ${c.channel}` : ''}{c.posted ? ` · ${timeAgo(c.posted)}` : ''}</span>
              {c.title && <p className="strong clamp-3">{c.title}</p>}
            </div>
            {player.clips.length > 1 && (
              <div className="stack-8">
                <span className="field-label">More videos about {player.place.name}</span>
                <div className="clip-rail">
                  {player.clips.map((x, i) => (
                    <button key={`${x.kind}-${x.url || x.id}`} className={`clip ${i === player.idx ? 'clip-on' : ''} clip-${x.kind}`} onClick={() => pick(i)} aria-pressed={i === player.idx}>
                      {x.thumb && <img src={x.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
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
              <button className="soft-btn" onClick={() => { const id = player.place.id; setPlayer(null); onOpen(id); }}>See all takes on Ube Banana</button>
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

// Headline: a playful question that follows the Filipino meal clock, picked fresh on each visit.
const ANYTIME = ['Hangry?!', 'Gutom na?', 'Kain na tayo!', 'Tummy rumbling?'];
const MEAL_LINES = {
  almusal: ['Tapsilog o pandesal?', 'Gising na, gutom na.', 'Almusal muna!', 'Kape and…?'],
  lunch: ['Lunch break na!', 'Rice is life. Saan?', 'Unli-rice, saan?', 'Lunch, saan tayo?'],
  merienda: ['Merienda o diet?', 'Sweet tooth calling?', 'Halo-halo weather?', 'Merienda time!'],
  dinner: ['Hangry?!', 'Saan tayo, barkada?', 'Dinner na! Saan?', 'Treat yourself?'],
  late: ['Midnight cravings?', 'Gutom pa rin?', 'Isang kain pa?', 'Silog o sisig?'],
};
function mealLine(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  const meal = h >= 5 && h < 10.5 ? 'almusal' : h < 14 && h >= 10.5 ? 'lunch' : h >= 14 && h < 17 ? 'merienda' : h >= 17 && h < 21.5 ? 'dinner' : 'late';
  const pool = [...MEAL_LINES[meal], ...MEAL_LINES[meal], ...ANYTIME]; // meal lines twice as likely
  return pool[Math.floor(Math.random() * pool.length)];
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

// "🔥 4 creators · 2 check-ins" — how many different people are talking about a place.
function buzzLine(it, tiks = []) {
  const ytCreators = new Set((it.videos && it.videos.length ? it.videos : [it.video]).map((v) => v.channel));
  const ttCreators = new Set((tiks || []).map((t) => t.handle).filter(Boolean));
  const creators = ytCreators.size + [...ttCreators].filter((h) => !ytCreators.has(h)).length;
  const bits = [creators > 1 ? `🔥 ${creators} creators` : `▶ ${it.video.channel}`];
  if (it.checkins) bits.push(`${it.checkins} check-in${it.checkins === 1 ? '' : 's'}`);
  if (creators <= 1) bits.push(timeAgo(it.video.published));
  return bits.join(' · ');
}

function TrendingRail({ data, loc, onOpen, onPlay, related = {} }) {
  if (data && (!data.items || data.items.length === 0)) return null;
  return (
    <section className="section trend">
      <div className="sec-head">
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
                  {it.why && <span className="trend-why clamp-2">{it.why}</span>}
                  {it.order && it.order.length > 0 && <span className="tiny clamp-1"><strong>Order:</strong> {it.order.join(', ')}</span>}
                  <span className="tiny muted clamp-1">{[it.minutes != null ? `🚗 ~${it.minutes} min` : (d != null ? fmtDistance(d) : null), it.place.type].filter(Boolean).join(' · ')}</span>
                  <span className="trend-buzz clamp-1">{buzzLine(it, related[it.place.id])}</span>
                </button>
                {(related[it.place.id] || []).length > 0 && (
                  <button className="trend-tt" onClick={() => onPlay(it, (it.videos && it.videos.length) || 1)}>
                    <span className="tt-stack">
                      {(related[it.place.id] || []).slice(0, 3).map((t) => <span key={t.url} className="tt-dot">{t.thumb ? <img src={t.thumb} alt="" /> : '♪'}</span>)}
                    </span>
                    <span className="clamp-1">🎵 {related[it.place.id].length} TikTok{related[it.place.id].length === 1 ? '' : 's'}</span>
                  </button>
                )}
                <div className="trend-go"><GoButtons place={it.place} size="sm" /></div>
              </article>
            );
          })}
        </div>
      )}
      {data && <p className="tiny muted">Ranked by how many different creators talked about it lately — not one big video.</p>}
    </section>
  );
}

function WhyLine({ w, fallback }) {
  if (w && w.why) {
    return (
      <span className="row-why">
        <span className="clamp-2">{w.why}</span>
        {w.order && w.order.length > 0 && <span className="tiny clamp-1"><strong>Order:</strong> {w.order.join(', ')}</span>}
      </span>
    );
  }
  if (fallback) return <span className="small muted clamp-2">{fallback}</span>;
  return null;
}

// ── Top picks: one score from the signals that matter when deciding where to eat ──
const MICH_BONUS = { three_star: 18, two_star: 16, one_star: 14, bib_gourmand: 10, selected: 6 };
const MORNING = new Set(['breakfast_restaurant', 'brunch_restaurant', 'cafe', 'coffee_shop', 'bakery', 'diner']);
const NIGHT = new Set(['bar', 'pub', 'wine_bar', 'lounge_bar', 'night_club', 'bar_and_grill', 'cocktail_bar']);
export function rankPlace(p, { stat, buzz, mich, hour }) {
  const reasons = [];
  let score = 0;
  // Quality: Google rating weighted by how many people rated it (a 4.9 from 12 people counts less than a 4.6 from 3,000).
  if (p.rating != null) {
    const v = p.ratingCount || 0;
    const adj = (v / (v + 150)) * p.rating + (150 / (v + 150)) * 4.2;
    score += Math.max(0, Math.min(1, (adj - 3.9) / 0.8)) * 35;
    reasons.push({ k: 'rating', t: `★ ${p.rating.toFixed(1)}${v ? ` (${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v})` : ''}` });
  }
  // Ube Banana verified check-ins.
  if (stat && stat.visit_count) {
    const conf = stat.visit_count / (stat.visit_count + 3);
    score += (Number(stat.avg_score) / 10) * 25 * conf + Math.min(stat.visit_count, 10);
    reasons.push({ k: 'ube', t: `🍌 ${Number(stat.avg_score).toFixed(1)} · ${stat.visit_count} check-in${stat.visit_count === 1 ? '' : 's'}` });
  }
  // Buzz: different creators talking about it lately.
  if (buzz && buzz.creators) {
    score += Math.min(buzz.creators, 4) * 5 + (buzz.checkins ? 3 : 0);
    if (buzz.creators > 1) reasons.push({ k: 'buzz', t: `🔥 ${buzz.creators} creators` });
    else reasons.push({ k: 'buzz', t: '▶ In a recent video' });
  }
  if (mich) {
    score += MICH_BONUS[mich.distinction] || 6;
    reasons.push({ k: 'mich', t: DISTINCTION[mich.distinction] });
  }
  // Nearness: walking distance or drive time.
  const mins = buzz && buzz.minutes != null ? buzz.minutes : null;
  if (p.dist != null) {
    score += Math.max(0, 1 - p.dist / 3000) * 20;
    reasons.push({ k: 'near', t: p.dist <= 1200 ? `🚶 ${Math.max(1, Math.round(p.dist / 80))} min walk` : (mins != null ? `🚗 ${mins} min` : fmtDistance(p.dist)) });
  }
  // Open now, and right for this time of day.
  if (p.openNow === true) { score += 6; reasons.push({ k: 'open', t: 'Open now' }); }
  if (p.openNow === false) score -= 40;
  const t = p.primaryType || '';
  if (hour >= 5 && hour < 11) { if (MORNING.has(t)) score += 6; if (NIGHT.has(t)) score -= 12; }
  if (hour >= 18 || hour < 2) { if (NIGHT.has(t)) score += 3; }
  return { score, reasons };
}

const PICK_SORTS = [
  { k: 'best', label: 'Best for you' },
  { k: 'near', label: 'Nearest' },
  { k: 'rated', label: 'Top rated' },
  { k: 'buzz', label: 'Buzzing' },
];

function PlaceRow({ place: p, stat, michelin, why, onOpen, rank, reasons }) {
  return (
    <button className="place-row" onClick={onOpen}>
      <span className="thumb-wrap">
        <PlacePhoto photo={p.photos[0]} width={300} className="place-thumb" alt="" />
        {rank && <span className="pick-rank">{rank}</span>}
      </span>
      <span className="place-main">
        <span className="row-title">{p.name}</span>
        <span className="muted small">{[p.type, fmtDistance(p.dist), priceLabel(p)].filter(Boolean).join(' · ')}</span>
        <WhyLine w={why} fallback={p.blurb} />
        {reasons && reasons.length > 0 && (
          <span className="reason-row">{reasons.map((x) => <span key={x.k} className={`reason reason-${x.k}`}>{x.t}</span>)}</span>
        )}
        {!reasons && <span className="score-line">
          {stat ? (
            <><ScoreBadge score={stat.avg_score} /><span className="small strong">Ube Banana</span></>
          ) : (
            <span className="small muted">No check-ins yet</span>
          )}
          {p.rating != null && <span className="small muted">★ {p.rating.toFixed(1)} Google</span>}
        </span>}
        {michelin && !reasons && <span className="mich-tag">{DISTINCTION[michelin.distinction]} {michelin.year}</span>}
        {p.openNow === false && <span className="tiny closed">Closed now</span>}
      </span>
    </button>
  );
}
