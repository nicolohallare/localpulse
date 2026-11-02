import React, { useEffect, useMemo, useState } from 'react';
import { supabase, getJSON, distanceM, fmtDistance, priceLabel, currentUser } from '../lib';
import { Icon, PlacePhoto, Spinner, Notice } from '../ui';
import { shareLink, PUBLIC_SITE } from '../game';
import { usePromos, useMyCards, promosFor } from '../promos';

// #/malls and #/mall/<id> — "Where to eat at SM ___": every place to eat inside a mall,
// ranked by Ube Banana check-ins and Google ratings, with the card promos that apply there.
const CUISINES = [
  ['all', 'All'],
  ['filipino', 'Filipino', (t) => /filipino|lechon|inasal|chicken|pares/.test(t)],
  ['asian', 'Asian', (t) => /japanese|chinese|korean|ramen|sushi|thai|vietnamese|dimsum|asian|shabu|yakiniku/.test(t)],
  ['fast', 'Fast food', (t) => /fast food|pizza|hamburger|burger|takeout/.test(t)],
  ['cafe', 'Coffee & dessert', (t) => /coffee|cafe|bakery|donut|dessert|tea|ice cream|juice/.test(t)],
];
// Bayesian score so a 5.0 from 1 review doesn't beat a 4.5 from 400.
const quality = (p, s) => {
  const v = p.ratingCount || 0;
  const g = p.rating != null ? (v / (v + 40)) * p.rating + (40 / (v + 40)) * 4.0 : 3.8;
  const u = s && s.visit_count ? (Number(s.avg_score) / 2) * (s.visit_count / (s.visit_count + 2)) + g * (2 / (s.visit_count + 2)) : g;
  return u + Math.min(v, 500) / 5000;
};

export function MallList({ onBack, onOpenMall }) {
  const [malls, setMalls] = useState(null);
  useEffect(() => { getJSON('/api/places/mall').then((d) => setMalls(d.malls || [])).catch(() => setMalls([])); }, []);
  return (
    <div className="screen pad-top">
      <div className="screen-head row-6"><button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1 className="display-xs">Where to eat at SM</h1></div>
      <p className="muted small" style={{ padding: '0 20px' }}>Every restaurant, café and food stall inside each mall, ranked by real check-ins and ratings.</p>
      {!malls ? <Spinner label="Loading malls…" /> : (
        <div className="mall-list">
          {malls.map((m) => (
            <button key={m.id} className="mall-item" onClick={() => onOpenMall(m.id)}>
              <span className="mall-item-name">{m.name}</span>
              <span className="tiny muted">{m.town}</span>
              <Icon name="back" size={18} className="mall-chev" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Mall({ id, loc, demo, onBack, onOpen }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [stats, setStats] = useState({});
  const [cuisine, setCuisine] = useState('all');
  const [mine, setMine] = useState(0);
  const promos = usePromos();
  const myCards = useMyCards();

  useEffect(() => {
    setData(null); setErr(null);
    getJSON(`/api/places/mall?id=${encodeURIComponent(id)}`).then(setData).catch((e) => setErr(e));
  }, [id]);

  const inside = useMemo(() => (data ? data.places.filter((p) => p.inside) : []), [data]);
  const near = useMemo(() => (data ? data.places.filter((p) => !p.inside) : []), [data]);

  useEffect(() => {
    if (!data || !data.places.length) return;
    const ids = data.places.map((p) => p.id);
    supabase.from('place_stats').select('*').in('google_place_id', ids).then(({ data: rows }) => {
      setStats(Object.fromEntries((rows || []).map((r) => [r.google_place_id, r])));
    });
    // Your own check-ins here this month (for the challenge preview).
    currentUser().then((u) => {
      if (!u) return;
      const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
      supabase.from('visits').select('google_place_id').eq('user_id', u.id).in('google_place_id', ids).gte('created_at', since.toISOString())
        .then(({ data: v }) => setMine(new Set((v || []).map((x) => x.google_place_id)).size));
    }).catch(() => {});
  }, [data]);

  if (err) return <div className="screen pad"><button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button><Notice tone="warn" title="Couldn’t load this mall">{err.message}</Notice></div>;
  if (!data) return <div className="screen pad"><Spinner label="Finding places to eat…" /></div>;

  const m = data.mall;
  const test = (CUISINES.find((c) => c[0] === cuisine) || [])[2];
  const withPromo = (p) => ({ ...p, promo: promosFor(p, promos, myCards.length ? myCards : null)[0] || null });
  const ranked = inside.map(withPromo).filter((p) => !test || test(`${p.type || ''} ${p.name}`.toLowerCase()))
    .sort((a, b) => quality(b, stats[b.id]) - quality(a, stats[a.id]));
  const withPromos = inside.map(withPromo).filter((p) => p.promo);
  const checkins = inside.reduce((n, p) => n + ((stats[p.id] && stats[p.id].visit_count) || 0), 0);
  const unreviewed = inside.filter((p) => (p.ratingCount || 0) < 20).length;
  const dist = loc && !loc.isDefault && m.lat ? distanceM(loc, { lat: m.lat, lng: m.lng }) : null;

  async function share() {
    const r = await shareLink({ title: `Where to eat at ${m.name}`, text: `${inside.length} places to eat at ${m.name}, ranked by real check-ins 🍌`, url: `${PUBLIC_SITE}/mall/${m.id}` });
    if (r === 'copied') window.alert('Link copied — paste it anywhere');
  }

  return (
    <div className="screen place-screen">
      <div className="hero mall-hero">
        <PlacePhoto photo={m.photo} width={900} className="hero-img" alt={m.name} />
        <div className="hero-shade" />
        <button className="icon-btn float tl" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <button className="icon-btn float tr" onClick={share} aria-label="Share"><Icon name="share" size={20} /></button>
        <div className="mall-hero-text">
          <span className="mall-kicker">Where to eat at</span>
          <h1 className="mall-title">{m.name}</h1>
          <span className="mall-sub">{inside.length} places to eat · {m.town}{dist != null ? ` · ${fmtDistance(dist)} away` : ''}</span>
        </div>
      </div>

      <div className="place-body">
        <div className="mall-stats">
          <div><span className="num-big">{inside.length}</span><span className="tiny muted">places to eat</span></div>
          {withPromos.length > 0
            ? <div><span className="num-big">{withPromos.length}</span><span className="tiny muted">with card promos</span></div>
            : <div><span className="num-big">{unreviewed}</span><span className="tiny muted">with under 20 reviews</span></div>}
          <div><span className="num-big">{checkins}</span><span className="tiny muted">Ube Banana check-ins</span></div>
        </div>

        {demo && (
          <div className="mall-challenge">
            <span className="mall-kicker dark">Pilot preview · {m.name.replace('SM City ', '').replace('SM Center ', '').replace('SM ', '')} Food Trip</span>
            <strong>Check in at 3 restaurants here this month</strong>
            <span className="small">Win SM Gift Passes. Every check-in is verified at the restaurant.</span>
            <span className="challenge-bar"><span style={{ width: `${Math.min(100, (mine / 3) * 100)}%` }} /></span>
            <span className="tiny">{Math.min(mine, 3)} of 3 done</span>
          </div>
        )}

        {unreviewed > 0 && !demo && (
          <p className="small muted">{unreviewed} of these have fewer than 20 reviews on Google. Eat here? Check in and be the first to say what’s good.</p>
        )}

        <div className="chips chips-inline filter-row" aria-label="Cuisine">
          {CUISINES.map(([k, label]) => (
            <button key={k} className={`chip chip-sm ${cuisine === k ? 'chip-on' : ''}`} onClick={() => setCuisine(k)}>{label}</button>
          ))}
        </div>

        <div className="place-list">
          {ranked.map((p, i) => <MallRow key={p.id} p={p} stat={stats[p.id]} rank={i + 1} onOpen={() => onOpen(p.id)} />)}
          {ranked.length === 0 && <p className="small muted">Nothing in this category here yet.</p>}
        </div>

        {near.length > 0 && cuisine === 'all' && (
          <>
            <h2 className="h2" style={{ marginTop: 18 }}>Just outside the mall</h2>
            <div className="place-list">
              {near.map(withPromo).sort((a, b) => quality(b, stats[b.id]) - quality(a, stats[a.id])).slice(0, 12)
                .map((p) => <MallRow key={p.id} p={p} stat={stats[p.id]} onOpen={() => onOpen(p.id)} />)}
            </div>
          </>
        )}
        <p className="attribution">Places, ratings and photos from Google Maps</p>
      </div>
    </div>
  );
}

function MallRow({ p, stat, rank, onOpen }) {
  return (
    <button className="place-row" onClick={onOpen}>
      <span className="thumb-wrap">
        <PlacePhoto photo={p.photos[0]} width={300} className="place-thumb" alt="" />
        {rank && rank <= 10 && <span className="pick-rank">{rank}</span>}
      </span>
      <span className="place-main">
        <span className="row-title clamp-1">{p.name}</span>
        <span className="muted small clamp-1">{[p.type, priceLabel(p)].filter(Boolean).join(' · ')}{p.openNow === true ? <span className="open-txt"> · Open now</span> : p.openNow === false ? <span className="closed-txt"> · Closed</span> : null}</span>
        <span className="reason-row">
          {stat && stat.visit_count ? <span className="reason reason-ube">🍌 {Number(stat.avg_score).toFixed(1)} · {stat.visit_count} check-in{stat.visit_count === 1 ? '' : 's'}</span> : null}
          {p.rating != null ? <span className="reason reason-rating">★ {p.rating.toFixed(1)} ({p.ratingCount >= 1000 ? `${(p.ratingCount / 1000).toFixed(1)}k` : p.ratingCount})</span> : <span className="reason">No reviews yet</span>}
          {p.promo && <span className="reason reason-promo">💳 {String(p.promo.discount).slice(0, 20)} · {p.promo.bank}</span>}
        </span>
      </span>
    </button>
  );
}
